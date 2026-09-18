import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Stream from "effect/Stream";

import * as DelegationBroker from "./DelegationBroker.ts";

const makeBroker = DelegationBroker.make.pipe(Effect.provide(NodeServices.layer));
const environmentId = EnvironmentId.make("environment-delegation-test");
const originThread = {
  environmentId,
  threadId: ThreadId.make("thread-delegation-test"),
};

it.effect("routes a delegation request and correlates its response", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const broker = yield* makeBroker;
      const events = yield* broker.connect({
        clientId: "delegation-client-test",
        environmentId,
        protocolVersion: 1,
      });
      yield* events.pipe(
        Stream.filterMap((event) =>
          event.type === "connected" ? Result.failVoid : Result.succeed(event),
        ),
        Stream.runForEach((event) =>
          broker.respond({
            clientId: "delegation-client-test",
            connectionId: event.connectionId,
            requestId: event.request.requestId,
            ok: true,
            result: { projects: [] },
          }),
        ),
        Effect.forkScoped,
      );
      yield* Effect.yieldNow;

      const result = yield* broker.invoke<{ projects: ReadonlyArray<unknown> }>({
        operation: "listTargets",
        originThread,
        input: {},
      });

      expect(result).toEqual({ projects: [] });
    }),
  ),
);

it.effect("reports a missing delegation host", () =>
  Effect.gen(function* () {
    const broker = yield* makeBroker;
    const exit = yield* Effect.exit(
      broker.invoke({ operation: "status", originThread, input: {} }),
    );
    expect(exit._tag).toBe("Failure");
  }),
);
