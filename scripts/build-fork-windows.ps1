[CmdletBinding()]
param(
  [string]$BuildVersion,
  [string]$OutputDirectory,
  [switch]$SkipInstall,
  [switch]$VerboseBuild
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot

function Find-Executable {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name,
    [Parameter(Mandatory = $true)]
    [string[]]$Candidates
  )

  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if ($null -ne $command) {
    return $command.Source
  }

  foreach ($candidate in $Candidates) {
    if (Test-Path -LiteralPath $candidate) {
      return $candidate
    }
  }

  throw "$Name is not installed or is not on PATH."
}

function Resolve-ForkBuildVersion {
  param(
    [Parameter(Mandatory = $true)]
    [string]$GitExecutable
  )

  $stableTags = @(& $GitExecutable -C $repoRoot tag --merged HEAD --list)
  if ($LASTEXITCODE -ne 0) {
    throw "Git could not list the stable tags."
  }

  $versions = @(
    foreach ($tag in $stableTags) {
      if ($tag -match '^v(?<version>\d+\.\d+\.\d+)$') {
        [pscustomobject]@{
          Tag = $tag
          Version = [version]$Matches.version
        }
      }
    }
  )
  if ($versions.Count -eq 0) {
    throw "Git did not find a stable release tag in this branch."
  }

  $latestStable = $versions | Sort-Object Version -Descending | Select-Object -First 1
  $commitCount = & $GitExecutable -C $repoRoot rev-list --count HEAD
  if ($LASTEXITCODE -ne 0) {
    throw "Git could not count the fork commits."
  }

  return "$($latestStable.Version)-delegation.$commitCount"
}

$nodeExe = Find-Executable -Name "node" -Candidates @(
  "C:\Program Files\nodejs\node.exe"
)
$gitExe = Find-Executable -Name "git" -Candidates @(
  "C:\Program Files\Git\cmd\git.exe"
)
$vpExe = Find-Executable -Name "vp" -Candidates @(
  (Join-Path $env:LOCALAPPDATA "vite-plus\bin\vp.exe")
)
$null = Find-Executable -Name "cargo" -Candidates @(
  (Join-Path $env:USERPROFILE ".cargo\bin\cargo.exe")
)

if ([string]::IsNullOrWhiteSpace($BuildVersion)) {
  $BuildVersion = Resolve-ForkBuildVersion -GitExecutable $gitExe
}
if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
  $OutputDirectory = Join-Path $repoRoot "release-fork"
} elseif (-not [System.IO.Path]::IsPathRooted($OutputDirectory)) {
  $OutputDirectory = Join-Path $repoRoot $OutputDirectory
}

Push-Location $repoRoot
try {
  if (-not $SkipInstall) {
    & $vpExe install --filter=@t3tools/desktop... --filter=t3... --filter=@t3tools/scripts...
    if ($LASTEXITCODE -ne 0) {
      throw "Vite+ could not install the desktop dependencies."
    }
  }

  $buildArguments = @(
    "scripts/build-desktop-artifact.ts",
    "--platform", "win",
    "--target", "nsis",
    "--arch", "x64",
    "--build-version", $BuildVersion,
    "--output-dir", $OutputDirectory
  )
  if ($VerboseBuild) {
    $buildArguments += "--verbose"
  }

  & $nodeExe @buildArguments
  if ($LASTEXITCODE -ne 0) {
    throw "The Windows application build failed."
  }
} finally {
  Pop-Location
}

$installer = Get-ChildItem -LiteralPath $OutputDirectory -Filter "T3-Code-Delegation-*.exe" |
  Sort-Object LastWriteTimeUtc -Descending |
  Select-Object -First 1
if ($null -eq $installer) {
  throw "The build did not make a Windows installer."
}

Write-Host "Installer: $($installer.FullName)"
