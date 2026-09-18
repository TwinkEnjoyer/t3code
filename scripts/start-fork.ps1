[CmdletBinding()]
param(
  [switch]$Update
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$forkDataDir = Join-Path $repoRoot ".t3"

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

$nodeExe = Find-Executable -Name "node" -Candidates @(
  "C:\Program Files\nodejs\node.exe"
)
$gitExe = Find-Executable -Name "git" -Candidates @(
  "C:\Program Files\Git\cmd\git.exe"
)
$vpExe = Find-Executable -Name "vp" -Candidates @(
  (Join-Path $env:LOCALAPPDATA "vite-plus\bin\vp.exe")
)

if ($Update) {
  $changes = & $gitExe -C $repoRoot status --porcelain
  if ($LASTEXITCODE -ne 0) {
    throw "Git could not read the fork status."
  }
  if ($changes) {
    throw "The fork has local changes. Commit or store them before you update."
  }

  & $gitExe -C $repoRoot fetch origin codex/delegation-v0.1
  if ($LASTEXITCODE -ne 0) {
    throw "Git could not fetch the fork branch."
  }

  & $gitExe -C $repoRoot pull --ff-only origin codex/delegation-v0.1
  if ($LASTEXITCODE -ne 0) {
    throw "Git could not update the local fork with a fast-forward merge."
  }

  Push-Location $repoRoot
  try {
    & $vpExe i
    if ($LASTEXITCODE -ne 0) {
      throw "Vite+ could not install the updated dependencies."
    }
  } finally {
    Pop-Location
  }
}

Push-Location $repoRoot
try {
  & $nodeExe scripts/dev-runner.ts dev:desktop --home-dir $forkDataDir
  if ($LASTEXITCODE -ne 0) {
    throw "The fork desktop process stopped with an error."
  }
} finally {
  Pop-Location
}
