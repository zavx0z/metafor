import type {MetaSourceResolver} from "shared/metafor/source"
import type { EnergyMassStore } from "./mass.ts"
import type {EnergyRuntimeStore} from "./energy.ts"
import type {ForceMessage} from "shared/protocol/force/message"
import type {OracleRpcPeer} from "shared/transport/oracle"
import type {EnergyNativeReplGrant} from "../environment"
import type {EnergyPeerOracleKernel} from "../peer-oracle"

export type EnergyProtocol = {
  /** Native service composition only, never passed as a Process argument. */
  readonly peerOracle?: EnergyPeerOracleKernel
  /** Waits only for already-started local Process/Reaction/finalizer work. */
  quiesce(): Promise<void>
  close(): void
}

export type EnergyForce = {
  onImpulse: (message: ForceMessage) => void | Promise<void>
  impulse(message: ForceMessage): void
}

export type EnergyProtocolOptions = {
  force?: EnergyForce
  energyId?: string
  runtimeKind?: string
  massStore?: EnergyMassStore
  energyStore?: EnergyRuntimeStore
  /** Source preparation or explicitly supplied installed artifacts; no automatic source fallback. */
  sourceResolver?: MetaSourceResolver
  /** Trusted service composition; action arguments cannot select scopes or a peer. */
  oracleEnvironment?: {
    peer: Pick<OracleRpcPeer, "call">
    graphScopes: readonly string[]
    codespaceScopes?: readonly string[]
    replScopes?: readonly string[]
    replGrant?: EnergyNativeReplGrant
    peerScopes?: readonly string[]
    providerDiscoveryScopes?: readonly string[]
    peerKernel?: EnergyPeerOracleKernel
  }
  /** Fatal domain invariant failure, distinct from a failed user Process/Reaction. */
  onFatal?(error: Error): void | Promise<void>
}
