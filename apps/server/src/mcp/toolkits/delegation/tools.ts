import {
  DelegationAcknowledgeResult,
  DelegationBrokerError,
  DelegationCreateInput,
  DelegationListTargetsResult,
  DelegationTaskLookup,
  DelegationTaskMessageInput,
  DelegationTaskSnapshot,
  McpCapabilityUnavailableError,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import * as Crypto from "effect/Crypto";
import * as Tool from "effect/unstable/ai/Tool";
import * as Toolkit from "effect/unstable/ai/Toolkit";

import * as DelegationBroker from "../../DelegationBroker.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";

const dependencies = [
  DelegationBroker.DelegationBroker,
  McpInvocationContext.McpInvocationContext,
  Crypto.Crypto,
];

const DelegationToolError = Schema.Union([McpCapabilityUnavailableError, DelegationBrokerError]);

const ListDelegationTargetsTool = Tool.make("list_delegation_targets", {
  description: "List the T3 projects and models that this client can use for delegated work.",
  success: DelegationListTargetsResult,
  failure: DelegationToolError,
  dependencies,
})
  .annotate(Tool.Title, "List delegation targets")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false);

const DelegateTaskTool = Tool.make("delegate_task", {
  description:
    "Start a child T3 thread on a connected environment. Save the returned task and thread references for later calls.",
  parameters: DelegationCreateInput,
  success: DelegationTaskSnapshot,
  failure: DelegationToolError,
  dependencies,
})
  .annotate(Tool.Title, "Delegate task")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, false)
  .annotate(Tool.OpenWorld, false);

const DelegationTaskStatusTool = Tool.make("task_status", {
  description: "Read the current state of a delegated T3 child thread.",
  parameters: DelegationTaskLookup,
  success: DelegationTaskSnapshot,
  failure: DelegationToolError,
  dependencies,
})
  .annotate(Tool.Title, "Read delegated task status")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false);

const DelegationTaskMessageTool = Tool.make("task_message", {
  description:
    "Send a message to a child thread. A child can use its parent thread reference, and the parent receives the message through task_status.",
  parameters: DelegationTaskMessageInput,
  success: DelegationAcknowledgeResult,
  failure: DelegationToolError,
  dependencies,
})
  .annotate(Tool.Title, "Message delegated agent")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, false)
  .annotate(Tool.OpenWorld, false);

const DelegationTaskCancelTool = Tool.make("task_cancel", {
  description: "Interrupt the active turn in a delegated child thread.",
  parameters: DelegationTaskLookup,
  success: DelegationAcknowledgeResult,
  failure: DelegationToolError,
  dependencies,
})
  .annotate(Tool.Title, "Cancel delegated task")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, true)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false);

export const DelegationToolkit = Toolkit.make(
  ListDelegationTargetsTool,
  DelegateTaskTool,
  DelegationTaskStatusTool,
  DelegationTaskMessageTool,
  DelegationTaskCancelTool,
);
