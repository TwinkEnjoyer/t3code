# Install and run the delegation fork on Windows

Use the Windows installer for normal daily use. The installed fork uses its own application and data identities.

The fork stores application data in `%APPDATA%\t3code-delegation`. It stores T3 data in `%USERPROFILE%\.t3-delegation`.

## Get the installer

1. Open the **Build delegation fork for Windows** workflow in GitHub Actions.
2. Open the newest successful run for the default branch.
3. Download the `t3-code-delegation-windows-x64-*` artifact.
4. Extract the artifact ZIP file.
5. Run the `T3-Code-Delegation-*.exe` installer.

🟨 The installer is not code-signed. Windows can show a SmartScreen warning.

## Build the installer locally

Install Node.js, Vite+, Rust, and Visual Studio Build Tools 2022 first.

Run this command from PowerShell:

```powershell
& "C:\Users\user\Documents\t3code-delegation\scripts\build-fork-windows.ps1"
```

The command writes the installer to `release-fork`.

## Update the installed fork

The build workflow makes a new installer after each change to the default branch.

1. Download the newest successful artifact.
2. Close T3 Code Delegation.
3. Run the new installer.

The installer keeps the fork data in place.

The app does not install updates itself. Use the newest workflow artifact for each update.

## Run from source

Use the source-run desktop as the daily version of this fork. This path keeps fork data separate from the official T3 installation.

## Start the fork

1. Open PowerShell.
2. Run the launcher:

   ```powershell
   & "C:\Users\user\Documents\t3code-delegation\scripts\start-fork.ps1"
   ```

3. Keep the PowerShell window open while you use the app.

The launcher stores fork data under `C:\Users\user\Documents\t3code-delegation\.t3`. It does not use `C:\Users\user\.t3`.

## Update the local copy

Run the launcher with `-Update` after the stable-update pull request merges:

```powershell
& "C:\Users\user\Documents\t3code-delegation\scripts\start-fork.ps1" -Update
```

The launcher stops if the checkout has local changes. It uses a fast-forward pull and then installs the current dependencies.

## Connect another computer

Install this fork on each computer that must host delegated work. Install and sign in to each provider on its host computer.

Use **Settings -> Connections** to add the environment. Use a local network address, Tailscale, T3 Connect, or SSH.

Add each target project in its owning environment. Keep the coordinating client open while agents exchange task messages.
