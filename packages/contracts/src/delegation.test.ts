import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import {
  canTransitionDelegationTask,
  DelegationTaskSnapshot,
  isDelegationTaskTerminal,
} from "./delegation.ts";

const decodeSnapshot = Schema.decodeUnknownSync(DelegationTaskSnapshot);

describe("DelegationTaskSnapshot", () => {
  it("decodes a task that selects another environment and model", () => {
    const snapshot = decodeSnapshot({
      spec: {
        taskId: "task-1",
        origin: {
          type: "agent",
          thread: { environmentId: "environment-a", threadId: "thread-a" },
        },
        target: {
          environmentId: "environment-b",
          projectId: "project-b",
          modelSelection: { instanceId: "claude-work", model: "claude-fable-5-1" },
          runtimeMode: "approval-required",
          interactionMode: "default",
          threadEnvMode: "worktree",
          requiresInteractiveDesktop: true,
        },
        title: "  Render review  ",
        prompt: "  Render the scene and report defects.  ",
        sourceRevision: "abc123",
        createdAt: "2026-09-19T00:00:00.000Z",
      },
      state: "running",
      attempt: 1,
      childThread: { environmentId: "environment-b", threadId: "thread-b" },
      updatedAt: "2026-09-19T00:01:00.000Z",
    });

    expect(snapshot.spec.title).toBe("Render review");
    expect(snapshot.spec.prompt).toBe("Render the scene and report defects.");
    expect(snapshot.spec.target.modelSelection.instanceId).toBe("claude-work");
  });

  it("rejects an empty prompt", () => {
    expect(() =>
      decodeSnapshot({
        spec: {
          taskId: "task-1",
          origin: {
            type: "user",
            thread: { environmentId: "environment-a", threadId: "thread-a" },
          },
          target: {
            environmentId: "environment-b",
            projectId: "project-b",
            modelSelection: { instanceId: "codex", model: "gpt-5.6-sol" },
            runtimeMode: "full-access",
            interactionMode: "default",
            threadEnvMode: "local",
            requiresInteractiveDesktop: false,
          },
          title: "Test",
          prompt: "   ",
          sourceRevision: "abc123",
          createdAt: "2026-09-19T00:00:00.000Z",
        },
        state: "queued",
        attempt: 0,
        updatedAt: "2026-09-19T00:00:00.000Z",
      }),
    ).toThrow();
  });
});

describe("delegation task transitions", () => {
  it("accepts normal and retry transitions", () => {
    expect(canTransitionDelegationTask("queued", "assigned")).toBe(true);
    expect(canTransitionDelegationTask("running", "waiting")).toBe(true);
    expect(canTransitionDelegationTask("lost", "queued")).toBe(true);
  });

  it("keeps terminal tasks terminal", () => {
    expect(isDelegationTaskTerminal("completed")).toBe(true);
    expect(isDelegationTaskTerminal("running")).toBe(false);
    expect(canTransitionDelegationTask("completed", "running")).toBe(false);
  });
});
