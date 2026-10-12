import type {MetaforCosmosPeerLifecycle} from "./contract"
export type {MetaforCosmosPeerLifecycle} from "./contract"

/** Produces one fresh request. No resource effects, hidden loop or lifecycle controller. */
export default function requestResourcePhase({event, signal}: MetaforCosmosPeerLifecycle.Input): MetaforCosmosPeerLifecycle.Output {
  signal.throwIfAborted()
  if (event !== "started" && event !== "stopping") throw new Error("Unsupported peer lifecycle event")
  return Object.freeze({request: event === "started" ? "start" : "stop", requestId: crypto.randomUUID()})
}
