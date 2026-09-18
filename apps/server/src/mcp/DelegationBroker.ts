import {
  DelegationBrokerError,
  type DelegationBrokerRequest,
  type DelegationBrokerResponse,
  type DelegationHost,
  type DelegationOperation,
  type DelegationStreamEvent,
  type ScopedThreadRef,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";
import * as SynchronizedRef from "effect/SynchronizedRef";

export interface DelegationInvokeInput {
  readonly operation: DelegationOperation;
  readonly originThread: ScopedThreadRef;
  readonly input: unknown;
  readonly timeoutMs?: number;
}

export class DelegationBroker extends Context.Service<
  DelegationBroker,
  {
    readonly connect: (host: DelegationHost) => Effect.Effect<Stream.Stream<DelegationStreamEvent>>;
    readonly respond: (
      response: DelegationBrokerResponse,
    ) => Effect.Effect<void, DelegationBrokerError>;
    readonly invoke: <A = unknown>(
      input: DelegationInvokeInput,
    ) => Effect.Effect<A, DelegationBrokerError>;
  }
>()("t3/mcp/DelegationBroker") {}

interface HostConnection {
  readonly host: DelegationHost;
  readonly connectionId: string;
  readonly queue: Queue.Queue<DelegationStreamEvent>;
  readonly order: number;
}

interface PendingRequest {
  readonly connection: HostConnection;
  readonly deferred: Deferred.Deferred<unknown, DelegationBrokerError>;
}

interface BrokerState {
  readonly hosts: ReadonlyMap<string, HostConnection>;
  readonly pending: ReadonlyMap<string, PendingRequest>;
  readonly sequence: number;
}

const brokerError = (
  reason: DelegationBrokerError["reason"],
  message: string,
): DelegationBrokerError => new DelegationBrokerError({ reason, message });

export const make = Effect.gen(function* DelegationBrokerMake() {
  const crypto = yield* Crypto.Crypto;
  const state = yield* SynchronizedRef.make<BrokerState>({
    hosts: new Map(),
    pending: new Map(),
    sequence: 0,
  });

  const closeConnection = Effect.fn("DelegationBroker.closeConnection")(function* (
    connection: HostConnection,
    pending: ReadonlyArray<PendingRequest>,
  ) {
    yield* Effect.forEach(
      pending,
      (request) =>
        Deferred.fail(
          request.deferred,
          brokerError("disconnected", "The delegation host disconnected."),
        ),
      { discard: true },
    );
    yield* Queue.shutdown(connection.queue);
  });

  const disconnect = Effect.fn("DelegationBroker.disconnect")(function* (
    connection: HostConnection,
  ) {
    const pending = yield* SynchronizedRef.modify(state, (current) => {
      if (current.hosts.get(connection.host.clientId) !== connection) {
        return [new Array<PendingRequest>(), current] as const;
      }
      const hosts = new Map(current.hosts);
      hosts.delete(connection.host.clientId);
      const disconnected: Array<PendingRequest> = [];
      const remaining = new Map(current.pending);
      for (const [requestId, request] of current.pending) {
        if (request.connection === connection) {
          disconnected.push(request);
          remaining.delete(requestId);
        }
      }
      return [disconnected, { ...current, hosts, pending: remaining }] as const;
    });
    yield* closeConnection(connection, pending);
  });

  const acquireConnection = Effect.fn("DelegationBroker.acquireConnection")(function* (
    host: DelegationHost,
  ) {
    const queue = yield* Queue.unbounded<DelegationStreamEvent>();
    const connectionId = yield* crypto.randomUUIDv4.pipe(Effect.orDie);
    const registration = yield* SynchronizedRef.modify(state, (current) => {
      const next: HostConnection = {
        host,
        connectionId,
        queue,
        order: current.sequence,
      };
      const hosts = new Map(current.hosts);
      const previous = hosts.get(host.clientId);
      hosts.set(host.clientId, next);
      const disconnected: Array<PendingRequest> = [];
      const pending = new Map(current.pending);
      if (previous !== undefined) {
        for (const [requestId, request] of current.pending) {
          if (request.connection === previous) {
            disconnected.push(request);
            pending.delete(requestId);
          }
        }
      }
      return [
        { connection: next, previous, disconnected },
        { ...current, hosts, pending, sequence: current.sequence + 1 },
      ] as const;
    });
    if (registration.previous !== undefined) {
      yield* closeConnection(registration.previous, registration.disconnected);
    }
    yield* Queue.offer(queue, { type: "connected", connectionId });
    return registration.connection;
  });

  const connect: DelegationBroker["Service"]["connect"] = Effect.fn("DelegationBroker.connect")(
    (host) =>
      Effect.succeed(
        Stream.unwrap(
          Effect.acquireRelease(acquireConnection(host), disconnect).pipe(
            Effect.map((connection) => Stream.fromQueue(connection.queue)),
          ),
        ),
      ),
  );

  const respond: DelegationBroker["Service"]["respond"] = Effect.fn("DelegationBroker.respond")(
    function* (response) {
      const pending = yield* SynchronizedRef.modify(state, (current) => {
        const request = current.pending.get(response.requestId);
        if (
          request === undefined ||
          request.connection.host.clientId !== response.clientId ||
          request.connection.connectionId !== response.connectionId
        ) {
          return [undefined, current] as const;
        }
        const next = new Map(current.pending);
        next.delete(response.requestId);
        return [request, { ...current, pending: next }] as const;
      });
      if (pending === undefined) {
        return;
      }
      if (response.ok) {
        yield* Deferred.succeed(pending.deferred, response.result);
        return;
      }
      yield* Deferred.fail(
        pending.deferred,
        brokerError(
          response.error === undefined ? "invalid-response" : "remote-error",
          response.error?.message ?? "The delegation host returned an invalid response.",
        ),
      );
    },
  );

  const invoke = Effect.fn("DelegationBroker.invoke")(function* <A = unknown>(
    input: DelegationInvokeInput,
  ): Effect.fn.Return<A, DelegationBrokerError> {
    const timeoutMs = input.timeoutMs ?? 30_000;
    const deferred = yield* Deferred.make<unknown, DelegationBrokerError>();
    const route = yield* SynchronizedRef.modify(state, (current) => {
      const connection = [...current.hosts.values()].sort(
        (left, right) => right.order - left.order,
      )[0];
      if (connection === undefined) {
        return [undefined, current] as const;
      }
      const requestId = `delegation-${current.sequence}`;
      const pending = new Map(current.pending);
      pending.set(requestId, { connection, deferred });
      return [
        { connection, requestId },
        { ...current, pending, sequence: current.sequence + 1 },
      ] as const;
    });
    if (route === undefined) {
      return yield* brokerError(
        "no-host",
        "No connected T3 client can route this delegation request.",
      );
    }

    const request: DelegationBrokerRequest = {
      requestId: route.requestId,
      operation: input.operation,
      originThread: input.originThread,
      input: input.input,
      timeoutMs,
    };
    const removePending = SynchronizedRef.update(state, (current) => {
      if (!current.pending.has(route.requestId)) return current;
      const pending = new Map(current.pending);
      pending.delete(route.requestId);
      return { ...current, pending };
    });
    const result = yield* Effect.gen(function* () {
      const accepted = yield* Queue.offer(route.connection.queue, {
        type: "request",
        connectionId: route.connection.connectionId,
        request,
      });
      if (!accepted) {
        return yield* brokerError("disconnected", "The delegation host stopped accepting work.");
      }
      const response = yield* Deferred.await(deferred).pipe(Effect.timeoutOption(timeoutMs));
      return yield* Option.match(response, {
        onNone: () =>
          Effect.fail(
            brokerError("timeout", `The delegation request timed out after ${timeoutMs} ms.`),
          ),
        onSome: (value) => Effect.succeed(value as A),
      });
    }).pipe(Effect.ensuring(removePending));
    return result;
  });

  return DelegationBroker.of({ connect, respond, invoke });
}).pipe(Effect.withSpan("DelegationBroker.make"));

export const layer = Layer.effect(DelegationBroker, make);
