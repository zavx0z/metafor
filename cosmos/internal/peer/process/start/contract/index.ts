import type {ActionParams} from "@metafor/types/metafor/action"
import type {InferMetaEnergy, InferMetaFields, InferMetaMass, InferMetaValues} from "@metafor/types/metafor/schema"
import type meta from "@internal/peer/meta"

/** Context follows the owning Meta; configuration/credential never becomes a Field record. */
export declare namespace MetaforCosmosInternalPeerProcessStart {
  type Context = ActionParams<InferMetaFields<typeof meta>, InferMetaMass<typeof meta>, InferMetaValues<typeof meta>, InferMetaEnergy<typeof meta>>
  type Input = Pick<Context, "mass" | "energy" | "signal"> & Pick<Context["value"], "requestId"> & {role?: string, environment?: Context["environment"] | undefined}
  type Output = Pick<Context["value"], "ackId" | "status" | "error" | "oracleReady" | "oracleError">
}
