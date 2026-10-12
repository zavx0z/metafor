import type {ActionParams} from "@metafor/types/metafor/action"
import type {InferMetaEnergy, InferMetaFields, InferMetaMass, InferMetaValues} from "@metafor/types/metafor/schema"
import type meta from "@internal/peer/meta"

/** Stop reads the exact request grant; cleanup uses only the Meta-owned live Energy resource. */
export declare namespace MetaforCosmosInternalPeerProcessStop {
  type Context = ActionParams<InferMetaFields<typeof meta>, InferMetaMass<typeof meta>, InferMetaValues<typeof meta>, InferMetaEnergy<typeof meta>>
  type Input = Pick<Context, "energy" | "signal"> & Pick<Context["value"], "requestId">
  type Output = Pick<Context["value"], "ackId" | "status" | "error">
  type Cleanup = Pick<Context, "energy">
}
