# Delegate work to another T3 environment

Delegation starts a normal T3 thread in a connected environment. The child thread can use a different provider and model.

The T3 client routes requests between environments. Each target server still owns its files, tools, terminals, and provider process.

## Requirements

- Connect each target environment to the same T3 client.
- Add the target project in its environment.
- Install and enable the target provider.
- Keep the client open while agents exchange messages.

An SSH profile can start and connect a remote T3 server. The agent does not receive raw SSH credentials.

## Agent tools

- `list_delegation_targets` lists connected projects and available models.
- `delegate_task` starts a child thread.
- `task_status` reads the latest child state.
- `task_message` sends a new turn to a child or parent thread.
- `task_cancel` interrupts the active child turn.

The child thread appears in the normal thread list. Open that thread to inspect its work or send a message.

## Worktree isolation

Use `threadEnvMode: "worktree"` for concurrent code changes. Also pass a Git revision through `sourceRevision`.

Use `threadEnvMode: "local"` for machine-local tests and render jobs. Avoid concurrent writes to the same local checkout.

## Current limits

The client keeps task links in memory. A client restart keeps the child thread, but it removes the temporary task link.

Task completion does not wake the parent automatically. The parent can poll status and receive child task messages in the response.

Interactive desktop work needs a logged-in desktop host. A background Windows service cannot control the user desktop.

## Security

Only connected environments appear as targets. Existing environment credentials protect each broker connection.

Review delegated prompts before you use full-access mode. A delegated agent receives the permissions of its target thread.
