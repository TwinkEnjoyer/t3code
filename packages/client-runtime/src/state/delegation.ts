import { WS_METHODS } from "@t3tools/contracts";
import { Atom } from "effect/unstable/reactivity";

import type { EnvironmentRegistry } from "../connection/registry.ts";
import {
  createAtomCommandScheduler,
  createEnvironmentRpcCommand,
  createEnvironmentRpcSubscriptionAtomFamily,
} from "./runtime.ts";

export function createDelegationEnvironmentAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>,
) {
  const scheduler = createAtomCommandScheduler();
  return {
    requests: createEnvironmentRpcSubscriptionAtomFamily(runtime, {
      label: "environment-data:delegation:requests",
      tag: WS_METHODS.delegationConnect,
      idleTtlMs: 0,
    }),
    respond: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:delegation:respond",
      tag: WS_METHODS.delegationRespond,
      scheduler,
      concurrency: {
        mode: "singleFlight",
        key: ({ environmentId, input }) =>
          JSON.stringify([environmentId, input.connectionId, input.requestId]),
      },
    }),
  };
}
