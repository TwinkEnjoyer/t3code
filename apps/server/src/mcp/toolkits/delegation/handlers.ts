import {
  DelegationTaskId,
  type DelegationAcknowledgeResult,
  type DelegationCreateInput,
  type DelegationListTargetsResult,
  type DelegationTaskLookup,
  type DelegationTaskMessageInput,
  type DelegationTaskSnapshot,
} from "@t3tools/contracts";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import * as DelegationBroker from "../../DelegationBroker.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import { DelegationToolkit } from "./tools.ts";

const make = Effect.gen(function* () {
  const broker = yield* DelegationBroker.DelegationBroker;
  const crypto = yield* Crypto.Crypto;

  const invoke = Effect.fn("DelegationToolkit.invoke")(function* <A>(
    operation: "listTargets" | "delegate" | "status" | "message" | "cancel",
    input: unknown,
    timeoutMs?: number,
  ): Effect.fn.Return<
    A,
    | import("@t3tools/contracts").McpCapabilityUnavailableError
    | import("@t3tools/contracts").DelegationBrokerError,
    McpInvocationContext.McpInvocationContext
  > {
    const scope = yield* McpInvocationContext.requireMcpCapability("delegation");
    return yield* broker.invoke<A>({
      operation,
      originThread: {
        environmentId: scope.environmentId,
        threadId: scope.threadId,
      },
      input,
      ...(timeoutMs === undefined ? {} : { timeoutMs }),
    });
  });

  return DelegationToolkit.of({
    list_delegation_targets: () => invoke<DelegationListTargetsResult>("listTargets", {}),
    delegate_task: (input: DelegationCreateInput) =>
      Effect.gen(function* () {
        const scope = yield* McpInvocationContext.requireMcpCapability("delegation");
        const taskId = yield* crypto.randomUUIDv4.pipe(
          Effect.orDie,
          Effect.map((value) => DelegationTaskId.make(`task-${value}`)),
        );
        const createdAt = yield* DateTime.now.pipe(Effect.map(DateTime.formatIso));
        return yield* invoke<DelegationTaskSnapshot>(
          "delegate",
          {
            taskId,
            origin: {
              type: "agent",
              thread: {
                environmentId: scope.environmentId,
                threadId: scope.threadId,
              },
            },
            input,
            createdAt,
          },
          60_000,
        );
      }),
    task_status: (input: DelegationTaskLookup) => invoke<DelegationTaskSnapshot>("status", input),
    task_message: (input: DelegationTaskMessageInput) =>
      invoke<DelegationAcknowledgeResult>("message", input, 60_000),
    task_cancel: (input: DelegationTaskLookup) =>
      invoke<DelegationAcknowledgeResult>("cancel", input),
  });
});

export const DelegationToolkitHandlersLive = DelegationToolkit.toLayer(make);
