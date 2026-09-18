"use client";

import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import {
  DELEGATION_OPERATIONS,
  DelegationCreateRequest,
  DelegationMessageId,
  DelegationTaskLookup,
  DelegationTaskMessageInput,
  type DelegationBrokerRequest,
  type DelegationBrokerResponse,
  type DelegationHost,
  type DelegationStreamEvent,
  type DelegationTaskSnapshot,
  type EnvironmentId,
} from "@t3tools/contracts";
import { buildTemporaryWorktreeBranchName } from "@t3tools/shared/git";
import * as Schema from "effect/Schema";
import { AsyncResult, Atom } from "effect/unstable/reactivity";
import { useCallback, useEffect, useMemo, useState } from "react";

import { randomHex, newMessageId, newThreadId, randomUUID } from "~/lib/utils";
import { delegationEnvironment } from "~/state/delegation";
import { readProjects, readThreadShell, useServerConfigs } from "~/state/entities";
import { useEnvironments } from "~/state/environments";
import { threadEnvironment } from "~/state/threads";
import { useAtomCommand } from "~/state/use-atom-command";

type StreamResult<E> = AsyncResult.AsyncResult<DelegationStreamEvent, E>;

const decodeDelegationCreateRequest = Schema.decodeUnknownSync(DelegationCreateRequest);
const decodeDelegationTaskLookup = Schema.decodeUnknownSync(DelegationTaskLookup);
const decodeDelegationTaskMessageInput = Schema.decodeUnknownSync(DelegationTaskMessageInput);
const delegatedTasks = new Map<string, DelegationTaskSnapshot>();

function createRequestConsumerAtom<E>(options: {
  readonly requestsAtom: Atom.Atom<StreamResult<E>>;
  readonly clientId: string;
  readonly connectionAtom: Atom.Writable<string | null>;
  readonly requestHandlerAtom: Atom.Atom<{
    readonly handle: (request: DelegationBrokerRequest) => Promise<unknown>;
  }>;
  readonly respond: (response: DelegationBrokerResponse) => Promise<unknown>;
  readonly label: string;
}): Atom.Atom<void> {
  return Atom.make((get) => {
    get.mount(options.connectionAtom);
    get.mount(options.requestHandlerAtom);
    let disposed = false;
    let activeConnectionId: string | null = null;
    let connectionExplicitlyAnnounced = false;
    let reportedConnectionId: string | null = null;
    let requestsVersion = 0;

    const consume = (result: StreamResult<E>) => {
      if (!AsyncResult.isSuccess(result)) return;
      const event = result.value;
      if (event.type === "connected") {
        activeConnectionId = event.connectionId;
        connectionExplicitlyAnnounced = true;
      } else if (activeConnectionId === null) {
        activeConnectionId = event.connectionId;
      } else if (activeConnectionId !== event.connectionId) {
        if (connectionExplicitlyAnnounced) return;
        activeConnectionId = event.connectionId;
      }
      if (reportedConnectionId !== event.connectionId) {
        reportedConnectionId = event.connectionId;
        get.set(options.connectionAtom, event.connectionId);
      }
      if (event.type === "connected") return;
      const request = event.request;
      void get
        .once(options.requestHandlerAtom)
        .handle(request)
        .then(
          (value) =>
            options.respond({
              clientId: options.clientId,
              connectionId: event.connectionId,
              requestId: request.requestId,
              ok: true,
              ...(value === undefined ? {} : { result: value }),
            }),
          (cause) =>
            options.respond({
              clientId: options.clientId,
              connectionId: event.connectionId,
              requestId: request.requestId,
              ok: false,
              error: {
                message: cause instanceof Error ? cause.message : "The delegation request failed.",
              },
            }),
        );
    };

    const initial = get.once(options.requestsAtom);
    if (AsyncResult.isSuccess(initial)) {
      activeConnectionId = initial.value.connectionId;
      connectionExplicitlyAnnounced = initial.value.type === "connected";
      if (initial.value.type === "connected") {
        reportedConnectionId = initial.value.connectionId;
        get.set(options.connectionAtom, initial.value.connectionId);
      }
    }
    get.subscribe(options.requestsAtom, (result) => {
      requestsVersion += 1;
      consume(result);
    });
    queueMicrotask(() => {
      const initialConnectionWasSkipped =
        AsyncResult.isSuccess(initial) &&
        initial.value.connectionId === activeConnectionId &&
        initial.value.connectionId !== reportedConnectionId;
      if (!disposed && (requestsVersion === 0 || initialConnectionWasSkipped)) {
        consume(initial);
      }
    });
    get.addFinalizer(() => {
      disposed = true;
      if (activeConnectionId !== null) {
        get.set(options.connectionAtom, null);
      }
    });
  }).pipe(Atom.setIdleTTL(0), Atom.withLabel(options.label));
}

function taskState(thread: ReturnType<typeof readThreadShell>): DelegationTaskSnapshot["state"] {
  if (thread === null) return "lost";
  if (thread.hasPendingApprovals || thread.hasPendingUserInput) return "waiting";
  if (thread.latestTurn?.state === "running") return "running";
  if (thread.latestTurn?.state === "error") return "failed";
  if (thread.latestTurn?.state === "interrupted") return "canceled";
  if (thread.latestTurn?.state === "completed") return "completed";
  return thread.session?.status === "starting" || thread.session?.status === "running"
    ? "running"
    : "assigned";
}

export function DelegationHosts() {
  const { environments } = useEnvironments();
  return (
    <>
      {environments.map((environment) => (
        <DelegationHostBridge
          key={environment.environmentId}
          environmentId={environment.environmentId}
        />
      ))}
    </>
  );
}

function DelegationHostBridge(props: { readonly environmentId: EnvironmentId }) {
  const { environmentId } = props;
  const { environments } = useEnvironments();
  const serverConfigs = useServerConfigs();
  const [clientId] = useState(() => `delegation-client-${randomUUID()}`);
  const host = useMemo<DelegationHost>(
    () => ({ clientId, environmentId, protocolVersion: 1 }),
    [clientId, environmentId],
  );
  const requestsAtom = delegationEnvironment.requests({ environmentId, input: host });
  const respond = useAtomCommand(delegationEnvironment.respond, {
    label: "delegation response",
    reportFailure: false,
  });
  const startTurn = useAtomCommand(threadEnvironment.startTurn, { reportFailure: false });
  const interruptTurn = useAtomCommand(threadEnvironment.interruptTurn, { reportFailure: false });

  const handleRequest = useCallback(
    async (request: DelegationBrokerRequest): Promise<unknown> => {
      if (!DELEGATION_OPERATIONS.includes(request.operation)) {
        throw new Error(`Unsupported delegation operation: ${request.operation}.`);
      }
      if (request.operation === "listTargets") {
        const labels = new Map(
          environments.map((environment) => [environment.environmentId, environment.label]),
        );
        return {
          projects: readProjects().map((project) => {
            const config = serverConfigs.get(project.environmentId);
            return {
              environmentId: project.environmentId,
              environmentLabel: labels.get(project.environmentId) ?? project.environmentId,
              projectId: project.id,
              projectTitle: project.title,
              workspaceRoot: project.workspaceRoot,
              defaultModelSelection:
                project.defaultModelSelection ?? config?.settings.defaultModelSelection ?? null,
              models:
                config?.providers.flatMap((provider) =>
                  provider.enabled && provider.installed
                    ? provider.models.map((model) => ({
                        instanceId: provider.instanceId,
                        model: model.slug,
                      }))
                    : [],
                ) ?? [],
            };
          }),
        };
      }

      if (request.operation === "delegate") {
        const delegated = decodeDelegationCreateRequest(request.input);
        const project = readProjects().find(
          (candidate) =>
            candidate.environmentId === delegated.input.target.environmentId &&
            candidate.id === delegated.input.target.projectId,
        );
        if (project === undefined) {
          throw new Error("The target T3 project is not connected to this client.");
        }
        if (
          delegated.input.target.threadEnvMode === "worktree" &&
          delegated.input.sourceRevision === undefined
        ) {
          throw new Error("A worktree delegation needs a source revision.");
        }

        const childThreadId = newThreadId();
        const childThread = scopeThreadRef(project.environmentId, childThreadId);
        const parent = delegated.origin.thread;
        const prompt = [
          delegated.input.prompt,
          "",
          `Delegation task: ${delegated.taskId}`,
          `Parent thread: ${parent.environmentId}/${parent.threadId}`,
          "Use task_message with the task ID and parent thread reference to report results or ask questions.",
        ].join("\n");
        const worktree =
          delegated.input.target.threadEnvMode === "worktree"
            ? {
                prepareWorktree: {
                  projectCwd: project.workspaceRoot,
                  baseBranch: delegated.input.sourceRevision!,
                  branch: buildTemporaryWorktreeBranchName(randomHex),
                },
                runSetupScript: true,
              }
            : {};
        const result = await startTurn({
          environmentId: project.environmentId,
          input: {
            threadId: childThreadId,
            message: {
              messageId: newMessageId(),
              role: "user",
              text: prompt,
              attachments: [],
            },
            modelSelection: delegated.input.target.modelSelection,
            titleSeed: delegated.input.title,
            runtimeMode: delegated.input.target.runtimeMode,
            interactionMode: delegated.input.target.interactionMode,
            bootstrap: {
              createThread: {
                projectId: project.id,
                title: delegated.input.title,
                modelSelection: delegated.input.target.modelSelection,
                runtimeMode: delegated.input.target.runtimeMode,
                interactionMode: delegated.input.target.interactionMode,
                branch: null,
                worktreePath: null,
                createdAt: delegated.createdAt,
              },
              ...worktree,
            },
            createdAt: delegated.createdAt,
          },
        });
        if (result._tag === "Failure") throw squashAtomCommandFailure(result);
        const snapshot: DelegationTaskSnapshot = {
          spec: {
            taskId: delegated.taskId,
            origin: delegated.origin,
            target: delegated.input.target,
            title: delegated.input.title,
            prompt: delegated.input.prompt,
            ...(delegated.input.sourceRevision === undefined
              ? {}
              : { sourceRevision: delegated.input.sourceRevision }),
            createdAt: delegated.createdAt,
          },
          state: "assigned",
          attempt: 0,
          childThread,
          updatedAt: delegated.createdAt,
        };
        delegatedTasks.set(delegated.taskId, snapshot);
        return snapshot;
      }

      if (request.operation === "status") {
        const lookup = decodeDelegationTaskLookup(request.input);
        const previous = delegatedTasks.get(lookup.taskId);
        if (previous === undefined) {
          throw new Error("This client does not know the delegated task.");
        }
        const thread = readThreadShell(lookup.childThread);
        const state = taskState(thread);
        const updated: DelegationTaskSnapshot = {
          ...previous,
          state,
          updatedAt: thread?.updatedAt ?? new Date().toISOString(),
          ...(state === "completed"
            ? {
                result: {
                  summary: "The child thread completed its latest turn.",
                  artifacts: [],
                },
              }
            : {}),
          ...(state === "failed" && thread?.session?.lastError
            ? { error: thread.session.lastError }
            : {}),
        };
        delegatedTasks.set(lookup.taskId, updated);
        return updated;
      }

      if (request.operation === "message") {
        const input = decodeDelegationTaskMessageInput(request.input);
        const task = delegatedTasks.get(input.taskId);
        if (
          task !== undefined &&
          task.spec.origin.thread.environmentId === input.childThread.environmentId &&
          task.spec.origin.thread.threadId === input.childThread.threadId
        ) {
          const updated: DelegationTaskSnapshot = {
            ...task,
            messages: [
              ...(task.messages ?? []),
              {
                messageId: DelegationMessageId.make(`message-${randomUUID()}`),
                taskId: input.taskId,
                sender: { type: "child", threadId: request.originThread.threadId },
                text: input.text,
                createdAt: new Date().toISOString(),
              },
            ],
            updatedAt: new Date().toISOString(),
          };
          delegatedTasks.set(input.taskId, updated);
          return { accepted: true, taskId: input.taskId, childThread: input.childThread };
        }
        const target = readThreadShell(input.childThread);
        if (target === null) throw new Error("The target agent thread was not found.");
        const createdAt = new Date().toISOString();
        const result = await startTurn({
          environmentId: input.childThread.environmentId,
          input: {
            threadId: input.childThread.threadId,
            message: {
              messageId: newMessageId(),
              role: "user",
              text: `[Agent message for ${input.taskId}]\n\n${input.text}`,
              attachments: [],
            },
            modelSelection: target.modelSelection,
            runtimeMode: target.runtimeMode,
            interactionMode: target.interactionMode,
            createdAt,
          },
        });
        if (result._tag === "Failure") throw squashAtomCommandFailure(result);
        return { accepted: true, taskId: input.taskId, childThread: input.childThread };
      }

      const input = decodeDelegationTaskLookup(request.input);
      const result = await interruptTurn({
        environmentId: input.childThread.environmentId,
        input: {
          threadId: input.childThread.threadId,
          createdAt: new Date().toISOString(),
        },
      });
      if (result._tag === "Failure") throw squashAtomCommandFailure(result);
      return { accepted: true, taskId: input.taskId, childThread: input.childThread };
    },
    [environments, interruptTurn, serverConfigs, startTurn],
  );

  const [requestHandlerAtom] = useState(() =>
    Atom.make<{ readonly handle: (request: DelegationBrokerRequest) => Promise<unknown> }>({
      handle: () => Promise.reject(new Error("The delegation host is not ready.")),
    }),
  );
  const setRequestHandler = useAtomSet(requestHandlerAtom);
  useEffect(() => setRequestHandler({ handle: handleRequest }), [handleRequest, setRequestHandler]);
  const [connectionAtom] = useState(() => Atom.make<string | null>(null));
  const consumerAtom = useMemo(
    () =>
      createRequestConsumerAtom({
        requestsAtom,
        clientId,
        connectionAtom,
        requestHandlerAtom,
        respond: (response) => respond({ environmentId, input: response }),
        label: `delegation-host:${environmentId}:${clientId}`,
      }),
    [clientId, connectionAtom, environmentId, requestHandlerAtom, requestsAtom, respond],
  );
  useAtomValue(consumerAtom);
  return null;
}
