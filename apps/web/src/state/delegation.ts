import { createDelegationEnvironmentAtoms } from "@t3tools/client-runtime/state/delegation";

import { connectionAtomRuntime } from "../connection/runtime";

export const delegationEnvironment = createDelegationEnvironmentAtoms(connectionAtomRuntime);
