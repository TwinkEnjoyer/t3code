import * as Schema from "effect/Schema";

import {
  EnvironmentId,
  IsoDateTime,
  NonNegativeInt,
  ProjectId,
  ThreadId,
  TrimmedNonEmptyString,
} from "./baseSchemas.ts";
import { ScopedThreadRef, ThreadEnvMode } from "./environment.ts";
import { ModelSelection, ProviderInteractionMode, RuntimeMode } from "./orchestration.ts";

export const DelegationTaskId = TrimmedNonEmptyString.pipe(Schema.brand("DelegationTaskId"));
export type DelegationTaskId = typeof DelegationTaskId.Type;

export const DelegationMessageId = TrimmedNonEmptyString.pipe(Schema.brand("DelegationMessageId"));
export type DelegationMessageId = typeof DelegationMessageId.Type;

export const DelegationTaskState = Schema.Literals([
  "queued",
  "assigned",
  "running",
  "waiting",
  "completed",
  "failed",
  "canceled",
  "lost",
]);
export type DelegationTaskState = typeof DelegationTaskState.Type;

export const DelegationTaskOrigin = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("user"),
    thread: ScopedThreadRef,
  }),
  Schema.Struct({
    type: Schema.Literal("agent"),
    thread: ScopedThreadRef,
  }),
]);
export type DelegationTaskOrigin = typeof DelegationTaskOrigin.Type;

export const DelegationTarget = Schema.Struct({
  environmentId: EnvironmentId,
  projectId: ProjectId,
  modelSelection: ModelSelection,
  runtimeMode: RuntimeMode,
  interactionMode: ProviderInteractionMode,
  threadEnvMode: ThreadEnvMode,
  requiresInteractiveDesktop: Schema.Boolean,
});
export type DelegationTarget = typeof DelegationTarget.Type;

export const DelegationTaskSpec = Schema.Struct({
  taskId: DelegationTaskId,
  origin: DelegationTaskOrigin,
  target: DelegationTarget,
  title: TrimmedNonEmptyString,
  prompt: TrimmedNonEmptyString,
  sourceRevision: Schema.optionalKey(TrimmedNonEmptyString),
  createdAt: IsoDateTime,
});
export type DelegationTaskSpec = typeof DelegationTaskSpec.Type;

export const DelegationArtifact = Schema.Struct({
  name: TrimmedNonEmptyString,
  uri: TrimmedNonEmptyString,
  mediaType: Schema.optionalKey(TrimmedNonEmptyString),
  sha256: Schema.optionalKey(TrimmedNonEmptyString),
});
export type DelegationArtifact = typeof DelegationArtifact.Type;

export const DelegationTaskResult = Schema.Struct({
  summary: TrimmedNonEmptyString,
  artifacts: Schema.Array(DelegationArtifact),
  commit: Schema.optionalKey(TrimmedNonEmptyString),
});
export type DelegationTaskResult = typeof DelegationTaskResult.Type;

export const DelegationMessageSender = Schema.Union([
  Schema.Struct({ type: Schema.Literal("user") }),
  Schema.Struct({ type: Schema.Literal("parent"), threadId: ThreadId }),
  Schema.Struct({ type: Schema.Literal("child"), threadId: ThreadId }),
]);
export type DelegationMessageSender = typeof DelegationMessageSender.Type;

export const DelegationMessage = Schema.Struct({
  messageId: DelegationMessageId,
  taskId: DelegationTaskId,
  sender: DelegationMessageSender,
  text: TrimmedNonEmptyString,
  createdAt: IsoDateTime,
});
export type DelegationMessage = typeof DelegationMessage.Type;

export const DelegationTaskSnapshot = Schema.Struct({
  spec: DelegationTaskSpec,
  state: DelegationTaskState,
  attempt: NonNegativeInt,
  childThread: Schema.optionalKey(ScopedThreadRef),
  result: Schema.optionalKey(DelegationTaskResult),
  error: Schema.optionalKey(TrimmedNonEmptyString),
  messages: Schema.optionalKey(Schema.Array(DelegationMessage)),
  updatedAt: IsoDateTime,
});
export type DelegationTaskSnapshot = typeof DelegationTaskSnapshot.Type;

export const DelegationTargetProject = Schema.Struct({
  environmentId: EnvironmentId,
  environmentLabel: TrimmedNonEmptyString,
  projectId: ProjectId,
  projectTitle: TrimmedNonEmptyString,
  workspaceRoot: TrimmedNonEmptyString,
  defaultModelSelection: Schema.NullOr(ModelSelection),
  models: Schema.Array(ModelSelection),
});
export type DelegationTargetProject = typeof DelegationTargetProject.Type;

export const DelegationListTargetsResult = Schema.Struct({
  projects: Schema.Array(DelegationTargetProject),
});
export type DelegationListTargetsResult = typeof DelegationListTargetsResult.Type;

export const DelegationCreateInput = Schema.Struct({
  target: DelegationTarget,
  title: TrimmedNonEmptyString,
  prompt: TrimmedNonEmptyString,
  sourceRevision: Schema.optionalKey(TrimmedNonEmptyString),
});
export type DelegationCreateInput = typeof DelegationCreateInput.Type;

export const DelegationCreateRequest = Schema.Struct({
  taskId: DelegationTaskId,
  origin: DelegationTaskOrigin,
  input: DelegationCreateInput,
  createdAt: IsoDateTime,
});
export type DelegationCreateRequest = typeof DelegationCreateRequest.Type;

export const DelegationTaskLookup = Schema.Struct({
  taskId: DelegationTaskId,
  childThread: ScopedThreadRef,
});
export type DelegationTaskLookup = typeof DelegationTaskLookup.Type;

export const DelegationTaskMessageInput = Schema.Struct({
  ...DelegationTaskLookup.fields,
  text: TrimmedNonEmptyString,
});
export type DelegationTaskMessageInput = typeof DelegationTaskMessageInput.Type;

export const DelegationAcknowledgeResult = Schema.Struct({
  accepted: Schema.Boolean,
  taskId: DelegationTaskId,
  childThread: ScopedThreadRef,
});
export type DelegationAcknowledgeResult = typeof DelegationAcknowledgeResult.Type;

export const DELEGATION_OPERATIONS = [
  "listTargets",
  "delegate",
  "status",
  "message",
  "cancel",
] as const;

export const DelegationOperation = Schema.Literals(DELEGATION_OPERATIONS);
export type DelegationOperation = typeof DelegationOperation.Type;

export const DelegationClientId = TrimmedNonEmptyString.check(Schema.isMaxLength(128));
export type DelegationClientId = typeof DelegationClientId.Type;

export const DelegationConnectionId = TrimmedNonEmptyString.check(Schema.isMaxLength(64));
export type DelegationConnectionId = typeof DelegationConnectionId.Type;

export const DelegationHost = Schema.Struct({
  clientId: DelegationClientId,
  environmentId: EnvironmentId,
  protocolVersion: Schema.Literal(1),
});
export type DelegationHost = typeof DelegationHost.Type;

export const DelegationBrokerRequest = Schema.Struct({
  requestId: TrimmedNonEmptyString,
  operation: DelegationOperation,
  originThread: ScopedThreadRef,
  input: Schema.Unknown,
  timeoutMs: Schema.Int.check(Schema.isGreaterThan(0)),
});
export type DelegationBrokerRequest = typeof DelegationBrokerRequest.Type;

export const DelegationStreamEvent = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("connected"),
    connectionId: DelegationConnectionId,
  }),
  Schema.Struct({
    type: Schema.Literal("request"),
    connectionId: DelegationConnectionId,
    request: DelegationBrokerRequest,
  }),
]);
export type DelegationStreamEvent = typeof DelegationStreamEvent.Type;

export const DelegationBrokerResponse = Schema.Struct({
  clientId: DelegationClientId,
  connectionId: DelegationConnectionId,
  requestId: TrimmedNonEmptyString,
  ok: Schema.Boolean,
  result: Schema.optional(Schema.Unknown),
  error: Schema.optional(
    Schema.Struct({
      message: TrimmedNonEmptyString,
      detail: Schema.optional(Schema.Unknown),
    }),
  ),
});
export type DelegationBrokerResponse = typeof DelegationBrokerResponse.Type;

export class DelegationBrokerError extends Schema.TaggedError<DelegationBrokerError>()(
  "DelegationBrokerError",
  {
    reason: Schema.Literals([
      "no-host",
      "timeout",
      "disconnected",
      "invalid-response",
      "remote-error",
    ]),
    message: TrimmedNonEmptyString,
  },
) {}

const TERMINAL_DELEGATION_TASK_STATES: ReadonlySet<DelegationTaskState> = new Set([
  "completed",
  "failed",
  "canceled",
]);

const DELEGATION_TASK_TRANSITIONS: Readonly<
  Record<DelegationTaskState, ReadonlySet<DelegationTaskState>>
> = {
  queued: new Set(["assigned", "failed", "canceled"]),
  assigned: new Set(["running", "failed", "canceled", "lost"]),
  running: new Set(["waiting", "completed", "failed", "canceled", "lost"]),
  waiting: new Set(["running", "completed", "failed", "canceled", "lost"]),
  completed: new Set(),
  failed: new Set(),
  canceled: new Set(),
  lost: new Set(["queued", "failed", "canceled"]),
};

export function isDelegationTaskTerminal(state: DelegationTaskState): boolean {
  return TERMINAL_DELEGATION_TASK_STATES.has(state);
}

export function canTransitionDelegationTask(
  from: DelegationTaskState,
  to: DelegationTaskState,
): boolean {
  return DELEGATION_TASK_TRANSITIONS[from].has(to);
}
