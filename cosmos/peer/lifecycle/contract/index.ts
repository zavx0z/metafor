import type {MetaLifecycleEvent} from "@metafor/types/metafor/lifecycle"

/** Native event becomes a causal per-resource request; Meta retains ordering/policy. */
export declare namespace MetaforCosmosPeerLifecycle {
  type Input = Readonly<{event: MetaLifecycleEvent; signal: AbortSignal}>
  type Output = Readonly<{request: "start" | "stop"; requestId: string}>
}
