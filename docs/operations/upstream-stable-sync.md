# Upstream stable sync

The fork checks for a stable T3 Code release every six hours.

The workflow accepts tags with the exact `vMAJOR.MINOR.PATCH` form. It ignores preview and nightly tags.

When a release exists, the workflow opens a pull request against the default branch. Review and merge that pull request after its checks pass.

Set the repository variable `T3_FORK_AUTO_MERGE` to `true` to enable automatic merge. Configure required checks before you enable this option.

If Git reports a conflict, the workflow opens an issue. Merge the release manually and keep the fork changes intact.

Run **Sync upstream stable** from GitHub Actions to start an immediate check.
