# Upstream stable sync

The fork checks for a stable T3 Code release each day at 4:00 AM Australia/Sydney time.

The workflow accepts tags with the exact `vMAJOR.MINOR.PATCH` form. It ignores preview and nightly tags.

When a release exists, the workflow opens a pull request against the default branch. Review and merge that pull request after its checks pass.

If Git finds a conflict, the workflow can ask Codex to repair the merge. Codex changes only the update branch. The workflow validates the merge and then opens the normal update pull request.

Add an OpenAI API key as an Actions secret to enable conflict repair:

```powershell
gh secret set OPENAI_API_KEY --repo TwinkEnjoyer/t3code
```

The command asks for the key without adding it to the shell history. An OpenAI API key uses API billing. A ChatGPT or Codex sign-in does not replace this key.

The Codex job receives no stored Git credential. It uses the `workspace-write` sandbox. A later workflow step pushes the validated merge.

Set the repository variable `T3_FORK_AUTO_MERGE` to `true` to enable automatic merge. Configure required checks before you enable this option.

If Codex cannot repair a conflict, the workflow opens or updates one issue. Fix the branch manually, or run the workflow again after you correct the setup.

Run **Sync upstream stable** from GitHub Actions to start an immediate check.
