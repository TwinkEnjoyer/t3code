# Run the delegation fork on Windows

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

## Package the fork later

A source-run desktop is the safer daily option for now. The current package build uses the official application ID.

A private installer needs a distinct application ID, product name, update repository, and signing plan. Add those changes before you install it beside official T3 Code.
