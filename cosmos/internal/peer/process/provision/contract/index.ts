import type {ActionParams} from "@metafor/types/metafor/action"
import type {InferMetaEnergy, InferMetaFields, InferMetaMass, InferMetaValues} from "@metafor/types/metafor/schema"
import type meta from "@internal/peer/meta"

/** Configuration bytes stay in native ingress/Mass; the contract derives ordinary completion from its Meta. */
export declare namespace MetaforCosmosInternalPeerProcessProvision {
  type Context = ActionParams<InferMetaFields<typeof meta>, InferMetaMass<typeof meta>, InferMetaValues<typeof meta>, InferMetaEnergy<typeof meta>>
  type Input = Pick<Context, "mass" | "energy" | "signal"> & Pick<Context["value"], "requestId">
  type Output = Pick<Context["value"], "ackId" | "status" | "error">
}
