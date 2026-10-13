import type {AtomRef, MetaAddress} from "./graph"
import type {ReadProvidersReceipt} from "./providers"
import type {MassDirectoryLease} from "./mass"
import type {ProfileTargetDescriptor} from "./profile-intent"

export const PEER_WORLD_DESCRIBE_METHOD = "world.describe" as const
export const PROVIDER_PEERS_READ_METHOD = "provider.peers.read" as const
export const PEER_PROVIDER_ORACLE_CHANNEL = "metafor.provider-oracle.v1" as const
export const PEER_PROVIDER_PHOTON_CHANNEL = "metafor.provider-photons.v1" as const

/** Erasing a world's history creates a new cut even when peer ID and root Meta stay unchanged. */
export interface OracleWorldIdentity {
  peerId: string
  root: MetaAddress
  cutId: string
}

/** Exact source Atom scope. Notice order is separate from canonical Force history. */
export interface ProviderAtomPeerBinding {
  worldIdentity: OracleWorldIdentity
  root: MetaAddress
  atomRef: AtomRef
  grants: readonly ["provider.registry.read", "photon.observe"]
  connectionEpoch: string
  photonCursor: {cutId: string, sequence: number, id: string} | null
}

/** A real world answers from its live bound network Atom, not native process inference. */
export interface OraclePeerWorld {
  schema: "metafor/peer-world/v1"
  version: 1
  peerId: string
  root: MetaAddress
  worldIdentity: OracleWorldIdentity
  role: "leader" | "follower"
  connectionEpoch: string
  noticeSequence: number
  providerRefs: AtomRef[]
  profileTargets: ProfileTargetDescriptor[]
  actor: {ref: AtomRef, meta: "@internal/peer"}
  methods: readonly ["readProviders", "energy.profile.intent"] | readonly ["readProviders"]
}

export interface ProviderPeerCatalogSnapshot {
  schema: "metafor/provider-peers/v1"
  version: 1
  resolution: "exact" | "unknown"
  peers: Array<{
    peerId: string
    connection: "connected" | "disconnected" | "unknown" | "stale"
    world: OraclePeerWorld | null
    catalog: ReadProvidersReceipt | null
    checkedAt: number
    issue: string | null
    bindings: ProviderAtomPeerBinding[]
    observation: "current" | "stale" | "gap" | "unknown"
  }>
}

/** Caller owns network and Mass lease. The opaque port is specialized and validated by native Energy; this contract owns no transport implementation. */
export interface OraclePeerLeaseInput<Network extends object = object> {
  network: Network
  allowedPeers: readonly string[]
  role: "leader" | "follower"
  /** Exact retained native resource lease; scope pins persist inside its own directory Mass. */
  lease: MassDirectoryLease
}

/** Durable native capability, revoked by lease signal, explicit stop or Energy shutdown. */
export interface OraclePeerLease {
  readonly ready: boolean
  close(): Promise<void>
}
