/**
 * Lifetime-scoped native Oracle capability on an already-owned public PeerNetwork.
 * Reuses OracleRpcPeer/wire, never creates a second transport or reads a Store.
 * [Energy law](../../docs/domains/ENERGY.md#доступ-process-к-oracle-environment).
 * [Tests](./peer-oracle.spec.ts) cover admission, lease loss and ordinary RPC.
 * @packageDocumentation
 */
import {READ_GRAPH_METHOD, parseMetaAddress, validateGraph, type AtomRef, type Graph, type RuntimeNode} from "@metafor/types/metafor/graph"
import {PROVIDER_META, READ_PROVIDERS_METHOD, PROVIDERS_OBSERVATION_SCHEMA, type ReadProvidersReceipt} from "@metafor/types/metafor/providers"
import {parseProviderRegistry} from "@metafor/types/metafor/provider-validation"
import {PEER_PROVIDER_ORACLE_CHANNEL, PEER_PROVIDER_PHOTON_CHANNEL, PEER_WORLD_DESCRIBE_METHOD, type OraclePeerLeaseInput, type OraclePeerWorld, type ProviderPeerCatalogSnapshot, type ProviderAtomPeerBinding} from "@metafor/types/metafor/peer-oracle"
import type {PeerNetwork} from "@metafor/tech-peer"
import {isOracleRpcCall, isOracleRpcResponse} from "shared/protocol/oracle/rpc"
import {OracleRpcPeer, OracleRpcRemoteError, OracleRpcAdmissionRefusedError, type OracleChannel, type OracleChannelListener} from "shared/transport/oracle"
import {DARK_FORCE_HISTORY_READ_METHOD, META_FIELD_VALUE_APPLY_METHOD, isMetaFieldValueApplyRefusal, validateMetaCausalFrontier, type DarkForceHistoryReadReceipt, type MetaCausalFrontier, type MetaFieldValueApplyReceipt, type MetaFieldValueApplyRequest} from "shared/protocol/metafor/observation"
import type {ForceMessage, SourcedForceMessage} from "shared/protocol/force/message"
import {resolveCanonicalForceFieldsPayload} from "shared/protocol/force/fields"
import {openPeerWorldPins} from "./peer-pins"
import {PROFILE_INTENT_METHOD, PROFILE_RECONFIGURE_INPUT_PREFIX, isProfileIntentRefusal, type ProfileIntentRequest, type ProfileIntentReceipt as PublicProfileIntentReceipt, type ProfileCatalogReceipt} from "@metafor/types/metafor/profile-intent"
import {parseProfileIntent, profileTargets, resolveProfileTarget} from "./profile-intent"
import {createProfileIntentJournal} from "./profile-journal"

type ProfileIntentReceipt = PublicProfileIntentReceipt<MetaFieldValueApplyReceipt>
/** Energy-owned Photon wire; fundamental Meta types do not depend on Force transport. */
interface ProviderPhotonNotice {
  schema: "metafor/provider-photon/v1"
  version: 1
  binding: ProviderAtomPeerBinding
  noticeSequence: number
  latestObservedFrontier: MetaCausalFrontier
  message: SourcedForceMessage
}

const MAX_WIRE_BYTES = 256 * 1024
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value)
const empty = (value: unknown) => object(value) && Reflect.ownKeys(value).length === 0
const peerId = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)
const allAtoms = (graph: Graph) => {
  const nodes: RuntimeNode[] = [...graph.runtime.roots]
  const atoms = []
  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index]!
    if (node.kind === "atom") atoms.push(node)
    nodes.push(...(node.children ?? []))
  }
  return atoms
}
async function bounded<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  // A caller may create a rejecting RPC promise just as its lease is revoked.
  // Retain a handler before the synchronous abort check, without hiding the rejection.
  void work.catch(() => {})
  signal.throwIfAborted()
  let timer: ReturnType<typeof setTimeout> | undefined
  let abort: (() => void) | undefined
  const cancelled = new Promise<never>((_resolve, reject) => {
    abort = () => reject(new Error("Peer Oracle lease closed"))
    signal.addEventListener("abort", abort, {once: true})
    timer = setTimeout(() => reject(new Error("Peer Oracle operation timed out")), 5000)
  })
  try {return await Promise.race([work, cancelled])}
  finally {clearTimeout(timer); if (abort) signal.removeEventListener("abort", abort)}
}

type Actor = {ref: AtomRef, meta: "@internal/peer"}
type PeerObservation = ProviderPeerCatalogSnapshot["peers"][number]
const atomRef = (value: unknown): value is AtomRef => typeof value === "string" && /^atom:[1-9][0-9]*$/.test(value)
const sameWorld = (a: OraclePeerWorld, b: OraclePeerWorld) => a.worldIdentity.peerId === b.worldIdentity.peerId && a.root === b.root && a.worldIdentity.cutId === b.worldIdentity.cutId
const samePhoton = (a: ForceMessage["parts"][0], b: ForceMessage["parts"][0]) =>
  (["part", "op", "path", "by", "ts", "from", "value"] as const).every(key => a[key] === b[key])
const statePhoton = (value: unknown): value is SourcedForceMessage => {
  if (!object(value) || Object.keys(value).join(",") !== "parts" || !Array.isArray(value.parts) || value.parts.length !== 1 || !object(value.parts[0])) return false
  const part = value.parts[0]
  return Object.keys(part).every(key => ["part", "op", "path", "by", "ts", "from", "value"].includes(key)) && part.part === "photon" && (part.op === "test" || part.op === "replace") &&
    typeof part.by === "string" && part.by.length <= 128 && typeof part.ts === "number" && Number.isSafeInteger(part.ts) && part.ts >= 0 &&
    (typeof part.path === "number" || typeof part.path === "string") && atomRef(`atom:${part.path}`) &&
    typeof part.value === "string" && part.value.length <= 1024 && (part.from === undefined || typeof part.from === "string" || typeof part.from === "number")
}

/** One lease contains only its own channel listeners and RPC peers, never network ownership. */
class NativePeerOracleLease {
  readonly #allowed: Set<string>
  readonly #sessions = new Map<string, {rpc: OracleRpcPeer, listeners: Set<OracleChannelListener>}>()
  readonly #controller = new AbortController()
  readonly #off: Array<() => void> = []
  readonly #remote = new Map<string, PeerObservation>()
  readonly #pinned = new Map<string, OraclePeerWorld>()
  readonly #lastNotice = new Map<string, number>()
  readonly #subscribers = new Map<string, {refs: Set<string>, epoch: string, sequence: number}>()
  readonly #hints = new Set<string>()
  readonly #authorizing = new Map<string, Promise<OraclePeerWorld>>()
  #reading: Promise<ProviderPeerCatalogSnapshot["peers"]> | undefined
  readonly #work = new Set<Promise<unknown>>()
  #closing: Promise<void> | undefined
  #closed = false
  #signature = ""

  constructor(readonly input: OraclePeerLeaseInput<PeerNetwork>, private readonly readLocal: (method: string, peerId: string, params?: unknown) => Promise<unknown>, private readonly pins: Awaited<ReturnType<typeof openPeerWorldPins>>, private readonly changed: (reason: "network" | "notice" | "observed" | "hint") => void) {
    if (input.allowedPeers.length > 32 || !input.allowedPeers.every(peerId) || !peerId(input.network.id) || input.allowedPeers.includes(input.network.id)) throw new Error("Invalid peer Oracle admission")
    input.lease.signal.throwIfAborted()
    this.#allowed = new Set(input.allowedPeers)
    const abort = () => {void this.close()}
    input.lease.signal.addEventListener("abort", abort, {once: true})
    this.#off.push(() => input.lease.signal.removeEventListener("abort", abort))
    this.#off.push(input.network.onData(event => {
      if (this.#closed || event.channel !== PEER_PROVIDER_ORACLE_CHANNEL && event.channel !== PEER_PROVIDER_PHOTON_CHANNEL || !this.#allowed.has(event.peerId) || !this.#connected(event.peerId)) return
      try {
        const text = typeof event.data === "string" ? event.data : new TextDecoder("utf-8", {fatal: true}).decode(event.data)
        if (Buffer.byteLength(text) > MAX_WIRE_BYTES) return
        const value: unknown = JSON.parse(text)
        if (event.channel === PEER_PROVIDER_PHOTON_CHANNEL) {this.#receiveNotice(event.peerId, value); return}
        if (!isOracleRpcCall(value) && !isOracleRpcResponse(value)) return
        if (isOracleRpcCall(value) && value.target !== input.network.id) return
        const session = this.#session(event.peerId)
        const message = isOracleRpcCall(value) ? {...value, source: event.peerId} : value
        for (const listener of session.listeners) {
          const work = Promise.resolve(listener(message))
          this.#work.add(work)
          void work.then(() => this.#work.delete(work), () => this.#work.delete(work))
        }
      } catch {}
    }))
    const state = () => {
      if (this.#closed) return
      const signature = [...this.#allowed].sort().map(id => `${id}:${input.network.snapshot().links.find(link => link.peerId === id && link.state === "open")?.generation ?? "closed"}`).join("|")
      if (signature === this.#signature) return
      this.#signature = signature
      for (const [id, session] of this.#sessions) {
        const observed = this.#remote.get(id)
        if (!this.#connected(id) || observed?.world && observed.world.connectionEpoch !== this.epoch(id)) {
          session.rpc.close(); this.#sessions.delete(id); this.#subscribers.delete(id)
          if (observed) {observed.connection = this.#connected(id) ? "stale" : "disconnected"; observed.observation = "gap"; observed.issue = "Peer connection epoch changed"}
        }
      }
      this.changed("network")
    }
    this.#off.push(input.network.subscribe(state))
    state()
  }

  #connected(id: string) {return !this.#closed && this.input.network.snapshot().links.some(link => link.peerId === id && link.state === "open")}
  epoch(id: string) {return this.input.network.snapshot().links.find(link => link.peerId === id && link.state === "open")?.generation ?? "disconnected"}
  sequence(id: string) {return this.#subscribers.get(id)?.sequence ?? 0}
  // Local service readiness is independent of each remote world's availability.
  // Remote reads/intents still require their own connected, pinned live scope.
  get ready() {return !this.#closed && !this.input.lease.signal.aborted && (this.input.network.snapshot().bootstrap || this.input.network.snapshot().links.some(link => link.state === "open"))}

  #receiveNotice(id: string, input: unknown) {
    const observed = this.#remote.get(id)
    if (!observed?.world || !object(input) || input.schema !== "metafor/provider-photon/v1" || input.version !== 1 || !object(input.binding) ||
        !statePhoton(input.message) || !Number.isSafeInteger(input.noticeSequence) || Number(input.noticeSequence) <= 0 || !validateMetaCausalFrontier(input.latestObservedFrontier).ok) return
    const notice = input as unknown as ProviderPhotonNotice
    const expected = observed.bindings.find(binding => binding.atomRef === notice.binding.atomRef)
    if (!expected || JSON.stringify(notice.binding.worldIdentity) !== JSON.stringify(expected.worldIdentity) || notice.binding.root !== expected.root ||
        notice.binding.connectionEpoch !== this.epoch(id) || JSON.stringify(notice.binding.grants) !== JSON.stringify(expected.grants) ||
        `atom:${notice.message.parts[0].path}` !== notice.binding.atomRef || notice.latestObservedFrontier.cutId !== expected.worldIdentity.cutId) return
    const previous = this.#lastNotice.get(id) ?? observed.world.noticeSequence
    if (notice.noticeSequence <= previous) return
    if (notice.binding.photonCursor !== null) {
      const cursor = notice.binding.photonCursor
      if (cursor.cutId !== expected.worldIdentity.cutId || !Number.isSafeInteger(cursor.sequence) || cursor.sequence <= 0 || cursor.sequence > notice.latestObservedFrontier.throughSequence || cursor.id !== `${cursor.cutId}:${cursor.sequence}`) return
      expected.photonCursor = structuredClone(cursor)
    }
    observed.observation = notice.noticeSequence === previous + 1 ? "stale" : "gap"
    observed.connection = "stale"
    observed.issue = observed.observation === "gap" ? "Scoped Photon notice sequence has a gap" : "Scoped Photon requires an ordinary Oracle refresh"
    this.#lastNotice.set(id, notice.noticeSequence)
    this.changed("notice")
  }

  /** Current cached observation for diagnostics; callers recover freshness through read(). */
  snapshot(): PeerObservation[] {return structuredClone([...this.#remote.values()])}

  #session(id: string) {
    const existing = this.#sessions.get(id)
    if (existing) return existing
    const listeners = new Set<OracleChannelListener>()
    const channel: OracleChannel = {identity: this.input.network.id, methods: [PEER_WORLD_DESCRIBE_METHOD, READ_PROVIDERS_METHOD, PROFILE_INTENT_METHOD],
      send: async message => {
        if (this.#closed || !this.#allowed.has(id) || !this.#connected(id)) throw new Error("Peer Oracle is disconnected")
        const encoded = JSON.stringify(message)
        if (Buffer.byteLength(encoded) > MAX_WIRE_BYTES) throw new Error("Peer Oracle frame exceeds limit")
        await this.input.network.send(id, encoded, {channel: PEER_PROVIDER_ORACLE_CHANNEL})
      },
      subscribe(listener) {listeners.add(listener); return () => {listeners.delete(listener)}},
      async close() {listeners.clear()},
    }
    const rpc = new OracleRpcPeer(channel)
    for (const method of [PEER_WORLD_DESCRIBE_METHOD, READ_PROVIDERS_METHOD, PROFILE_INTENT_METHOD]) rpc.expose(method, async (params, context) => {
      if (context.source !== id || !this.#allowed.has(id) || !this.#connected(id) || method !== PROFILE_INTENT_METHOD && !empty(params)) throw new Error("Peer Oracle admission denied")
      this.#controller.signal.throwIfAborted()
      if (method === READ_PROVIDERS_METHOD || method === PROFILE_INTENT_METHOD) {
        try {await this.#authorizeWorld(id)} catch (error) {this.#subscribers.delete(id); throw error}
      }
      if (method === PROFILE_INTENT_METHOD && this.input.role !== "follower") throw new Error("Remote profile intent requires leader to follower")
      const localRead = this.readLocal(method, id, params)
      this.#work.add(localRead)
      void localRead.then(() => this.#work.delete(localRead), () => this.#work.delete(localRead))
      const result = await bounded(localRead, this.#controller.signal)
      const hint = `${id}:${this.epoch(id)}`
      if (method === PEER_WORLD_DESCRIBE_METHOD && !this.#hints.has(hint)) {this.#hints.add(hint); this.changed("hint")}
      if (method === READ_PROVIDERS_METHOD) {
        const catalog = result as ReadProvidersReceipt
        const previous = this.#subscribers.get(id)
        this.#subscribers.set(id, {refs: new Set(catalog.providers.map(provider => provider.ref)), epoch: this.epoch(id), sequence: previous?.epoch === this.epoch(id) ? previous.sequence : 0})
      }
      this.#controller.signal.throwIfAborted()
      return result
    })
    const session = {rpc, listeners}
    this.#sessions.set(id, session)
    return session
  }

  async read(): Promise<ProviderPeerCatalogSnapshot["peers"]> {
    return await (this.#reading ??= this.#read().finally(() => {this.#reading = undefined}))
  }

  #authorizeWorld(id: string): Promise<OraclePeerWorld> {
    const pending = this.#authorizing.get(id)
    if (pending) return pending
    const work = (async () => {
      const world = await bounded(this.#session(id).rpc.call<OraclePeerWorld>(id, PEER_WORLD_DESCRIBE_METHOD, {}), this.#controller.signal)
      if (!world || world.schema !== "metafor/peer-world/v1" || world.version !== 1 || world.peerId !== id || !world.worldIdentity || world.worldIdentity.peerId !== id ||
          world.worldIdentity.root !== world.root || typeof world.root !== "string" || !parseMetaAddress(world.root) || typeof world.worldIdentity.cutId !== "string" || !world.worldIdentity.cutId ||
          world.connectionEpoch !== this.epoch(id) || !Number.isSafeInteger(world.noticeSequence) || world.noticeSequence < 0 ||
          world.role !== (this.input.role === "leader" ? "follower" : "leader") || world.actor?.meta !== "@internal/peer" ||
          !atomRef(world.actor.ref) || !Array.isArray(world.methods) || ![[READ_PROVIDERS_METHOD], [READ_PROVIDERS_METHOD, PROFILE_INTENT_METHOD]].some(methods => JSON.stringify(methods) === JSON.stringify(world.methods)) ||
          !Array.isArray(world.providerRefs) || world.providerRefs.length > 64 || !world.providerRefs.every(atomRef) || !Array.isArray(world.profileTargets) || world.profileTargets.length > 8) throw new Error("Invalid peer world descriptor")
      for (const target of world.profileTargets) {
        parseProfileIntent({id: "descriptor", operation: "profile.open", target: {worldIdentity: target.worldIdentity, atomRef: target.atomRef}, expectedProfile: target.expectedProfile})
        if (JSON.stringify(target.worldIdentity) !== JSON.stringify(world.worldIdentity) || target.meta !== world.root || !["intel-macos-chrome-studio", "workspace-capsule"].includes(target.meta) || typeof target.available !== "boolean" || typeof target.state !== "string" || !Array.isArray(target.supportedOperations) || target.supportedOperations.some(operation => operation !== "profile.open" && operation !== "profile.save" && operation !== "profile.reconfigure")) throw new Error("Invalid peer profile descriptor")
      }
      const pinned = this.#pinned.get(id)
      if (pinned && !sameWorld(pinned, world)) throw new Error("Admitted peer world identity changed; explicit owner binding is required")
      await this.pins.bind(world, [...world.providerRefs, ...world.profileTargets.map(target => target.atomRef)])
      this.#pinned.set(id, structuredClone(world))
      return world
    })()
    this.#authorizing.set(id, work)
    void work.then(() => this.#authorizing.delete(id), () => this.#authorizing.delete(id))
    return work
  }

  async #read(): Promise<ProviderPeerCatalogSnapshot["peers"]> {
    return await Promise.all([...this.#allowed].sort().map(async id => {
      const checkedAt = Date.now()
      if (!this.#connected(id)) return {peerId: id, connection: "disconnected" as const, world: null, catalog: null, checkedAt, issue: "Admitted peer is disconnected", bindings: [], observation: "unknown" as const}
      try {
        const session = this.#session(id)
        const world = await this.#authorizeWorld(id)
        const catalog = await bounded(session.rpc.call<ReadProvidersReceipt>(id, READ_PROVIDERS_METHOD, {}), this.#controller.signal)
        if (!catalog || catalog.schema !== PROVIDERS_OBSERVATION_SCHEMA || catalog.version !== 1 || catalog.root !== world.root || !Array.isArray(catalog.providers) || catalog.providers.length === 0 || catalog.providers.length > 64) throw new Error("Invalid peer Provider catalog")
        for (const provider of catalog.providers) {
          if (provider.meta !== PROVIDER_META) throw new Error("Invalid peer Provider owner")
          if (provider.registry.resolution === "exact") parseProviderRegistry(provider.registry.value)
        }
        const grantedRefs = await this.pins.bind(world, catalog.providers.map(provider => provider.ref))
        catalog.providers = catalog.providers.filter(provider => grantedRefs.includes(provider.ref))
        this.#pinned.set(id, structuredClone(world))
        const previous = this.#remote.get(id)
        const bindings: ProviderAtomPeerBinding[] = catalog.providers.map(provider => ({worldIdentity: world.worldIdentity, root: world.root, atomRef: provider.ref,
          grants: ["provider.registry.read", "photon.observe"], connectionEpoch: world.connectionEpoch,
          photonCursor: previous?.bindings.find(binding => binding.atomRef === provider.ref && binding.worldIdentity.cutId === world.worldIdentity.cutId)?.photonCursor ?? null}))
        const latestNotice = this.#lastNotice.get(id) ?? world.noticeSequence
        const noticeDuringRead = latestNotice > world.noticeSequence
        this.#lastNotice.set(id, Math.max(latestNotice, world.noticeSequence))
        const result: PeerObservation = {peerId: id, connection: noticeDuringRead ? "stale" : "connected", world, catalog, checkedAt,
          issue: noticeDuringRead ? "Scoped Photon arrived during ordinary Oracle observation" : null, bindings,
          observation: noticeDuringRead ? previous?.observation === "gap" ? "gap" : "stale" : "current"}
        this.#remote.set(id, result)
        if (previous?.connection !== "connected" || previous.observation !== "current" || previous.world?.connectionEpoch !== world.connectionEpoch) this.changed("observed")
        return result
      } catch (error) {
        if (!this.#connected(id) || error instanceof Error && error.message === "Peer Oracle operation timed out") {
          this.#sessions.get(id)?.rpc.close()
          this.#sessions.delete(id)
        }
        const previous = this.#remote.get(id)
        this.#remote.delete(id)
        if (previous) this.changed("observed")
        return {peerId: id, connection: this.#connected(id) ? "unknown" as const : "disconnected" as const, world: null, catalog: null, checkedAt, issue: "Admitted peer Oracle catalog is unavailable or its world identity changed", bindings: [], observation: "unknown" as const}
      }
    }))
  }

  async publish(message: SourcedForceMessage, frontier: MetaCausalFrontier, photonCursor: ProviderAtomPeerBinding["photonCursor"], root: Graph["root"]) {
    for (const [id, subscriber] of this.#subscribers) {
      const ref = `atom:${message.parts[0].path}` as AtomRef
      if (!this.#connected(id) || subscriber.epoch !== this.epoch(id) || !subscriber.refs.has(ref)) continue
      try {await this.#authorizeWorld(id)} catch {this.#subscribers.delete(id); continue}
      const notice: ProviderPhotonNotice = {schema: "metafor/provider-photon/v1", version: 1, noticeSequence: ++subscriber.sequence,
        binding: {worldIdentity: {peerId: this.input.network.id, root, cutId: frontier.cutId}, root, atomRef: ref,
          grants: ["provider.registry.read", "photon.observe"], connectionEpoch: subscriber.epoch, photonCursor}, latestObservedFrontier: frontier, message}
      try {await this.input.network.send(id, JSON.stringify(notice), {channel: PEER_PROVIDER_PHOTON_CHANNEL})} catch {this.changed("network")}
    }
  }

  async profileIntent(request: ProfileIntentRequest): Promise<ProfileIntentReceipt> {
    const id = request.target.worldIdentity.peerId
    if (this.input.role !== "leader" || !this.#allowed.has(id) || !this.#connected(id)) throw new Error("Profile peer is not an admitted follower")
    const world = await this.#authorizeWorld(id)
    if (!world.methods.some(method => method === PROFILE_INTENT_METHOD) || JSON.stringify(world.worldIdentity) !== JSON.stringify(request.target.worldIdentity) ||
        !world.profileTargets.some(target => target.atomRef === request.target.atomRef && target.supportedOperations.includes(request.operation))) throw new Error("Profile Atom capability is not assigned")
    return await bounded(this.#session(id).rpc.call<ProfileIntentReceipt>(id, PROFILE_INTENT_METHOD, request), this.#controller.signal)
  }

  close(): Promise<void> {
    if (this.#closing) return this.#closing
    this.#closed = true
    this.#controller.abort()
    for (const off of this.#off.splice(0)) off()
    for (const session of this.#sessions.values()) {session.rpc.close(); session.listeners.clear()}
    this.#sessions.clear()
    this.changed("network")
    return this.#closing = Promise.allSettled([...this.#work, ...(this.#reading ? [this.#reading] : [])]).then(() => {})
  }
}

/** Kernel lifetime is distinct from Process lifetime; callbacks use only its native fixed RPC capability. */
export class EnergyPeerOracleKernel {
  readonly #leases = new Set<NativePeerOracleLease>()
  readonly #knownAtoms = new Map<string, string>()
  readonly #browserOwners = new Map<string, AtomRef>()
  readonly #published = new Map<string, string>()
  #photonWork = Promise.resolve()
  #photonQueued = 0
  readonly #deferred = new Set<string>()
  readonly #admitted = new Map<string, string>()
  readonly #uncertain = new Map<string, string>()
  readonly #actors = new Map<NativePeerOracleLease, Actor>()
  readonly #worlds = new Map<NativePeerOracleLease, {identity: OraclePeerWorld["worldIdentity"], pins: Awaited<ReturnType<typeof openPeerWorldPins>>, intents: ReturnType<typeof createProfileIntentJournal>}>()
  readonly #intents = new Map<string, {request: string, result: Promise<ProfileIntentReceipt>}>()
  readonly #retired = new Set<Promise<void>>()
  readonly #calls = new Set<Promise<unknown>>()
  #closed = false
  #refreshing = false
  #refreshPending = false
  #probePending = false
  #refreshWork: Promise<void> | undefined
  #closing: Promise<void> | undefined
  #sequence = 0
  readonly #controller = new AbortController()

  constructor(private readonly options: {peer: Pick<OracleRpcPeer, "call">, refreshProviders: boolean, profileControl?: boolean}) {}

  #call<T>(method: string, params: unknown = {}): Promise<T> {
    this.#controller.signal.throwIfAborted()
    const work = this.options.peer.call<T>("dark", method, params)
    this.#calls.add(work)
    void work.then(() => this.#calls.delete(work), () => this.#calls.delete(work))
    return bounded(work, this.#controller.signal)
  }

  async #graph(): Promise<Graph> {
    const result = validateGraph(await this.#call(READ_GRAPH_METHOD, {}))
    if (!result.ok) throw new Error("Peer Oracle current Graph is unavailable")
    this.#knownAtoms.clear()
    this.#browserOwners.clear()
    const visit = (node: RuntimeNode, browserOwner?: AtomRef) => {
      if (node.kind === "atom") {
        this.#knownAtoms.set(node.ref, node.meta)
        if (node.meta === "capsule" || node.meta === "chrome-studio") browserOwner = node.ref
        if (browserOwner && (node.ref === browserOwner || node.meta === "@capsule/runtime")) this.#browserOwners.set(node.ref, browserOwner)
      }
      for (const child of node.children ?? []) visit(child, browserOwner)
    }
    for (const root of result.value.runtime.roots) visit(root)
    return result.value
  }

  async #history(query: {kind: "frontier"} | {kind: "range", cutId: string, fromSequence: number, limit: number}) {
    const result = await this.#call<DarkForceHistoryReadReceipt>(DARK_FORCE_HISTORY_READ_METHOD, {contractVersion: 1, query})
    if (!validateMetaCausalFrontier(result.frontier).ok) throw new Error("Peer Oracle history frontier is invalid")
    return result
  }

  async open(actor: Actor, opaque: OraclePeerLeaseInput) {
    const network = opaque.network
    if (!network || typeof network !== "object" || !peerId(Reflect.get(network, "id")) ||
      ["connect", "send", "onData", "subscribe", "snapshot", "disconnect", "closeBootstrap", "close"].some(method => typeof Reflect.get(network, method) !== "function")) throw new Error("Native peer Oracle requires its public PeerNetwork port")
    const input: OraclePeerLeaseInput<PeerNetwork> = {...opaque, network: network as PeerNetwork}
    if (this.#closed || actor.meta !== "@internal/peer" || !["leader", "follower"].includes(input.role)) throw new Error("Peer Oracle role is not assigned")
    const verify = async () => {
      input.lease.signal.throwIfAborted()
      if (this.#closed) throw new Error("Peer Oracle Energy closed")
      const graph = await this.#graph()
      const owner = allAtoms(graph).find(atom => atom.ref === actor.ref && atom.meta === actor.meta)
      if (!owner || typeof owner.values.role === "string" && owner.values.role !== input.role) throw new Error("Peer Oracle actor or role is absent")
      input.lease.signal.throwIfAborted()
      return graph
    }
    const current = await verify()
    const initial = await bounded(this.#call<ReadProvidersReceipt>(READ_PROVIDERS_METHOD, {}), input.lease.signal)
    if (initial.schema !== PROVIDERS_OBSERVATION_SCHEMA) throw new Error("Peer Oracle Provider scope is unavailable")
    if ([...this.#leases].some(lease => lease.input.network === input.network)) throw new Error("Peer Oracle network already leased")
    const frontier = await this.#history({kind: "frontier"})
    const localIdentity = {peerId: input.network.id, root: current.root, cutId: frontier.frontier.cutId}
    const profiles = this.options.profileControl ? profileTargets(current, localIdentity) : []
    const pins = await openPeerWorldPins(input.lease, localIdentity, [...initial.providers.map(provider => provider.ref), ...profiles.map(target => target.atomRef)])
    let lease: NativePeerOracleLease
    lease = new NativePeerOracleLease(input, async (method, remoteId, params) => {
      const graph = await verify()
      if (method === PROFILE_INTENT_METHOD) return await this.profileIntent(params)
      if (method === PEER_WORLD_DESCRIBE_METHOD) {
        const history = await this.#history({kind: "frontier"})
        if (history.frontier.cutId !== localIdentity.cutId || graph.root !== localIdentity.root) throw new Error("Local peer world identity changed")
        return {schema: "metafor/peer-world/v1", version: 1, peerId: input.network.id, root: graph.root,
          worldIdentity: {peerId: input.network.id, root: graph.root, cutId: history.frontier.cutId}, role: input.role,
          connectionEpoch: lease.epoch(remoteId), noticeSequence: lease.sequence(remoteId), providerRefs: allAtoms(graph).filter(atom => atom.meta === PROVIDER_META && atom.values.registryMode !== "executor" && pins.localRefs.includes(atom.ref)).map(atom => atom.ref),
          profileTargets: this.options.profileControl ? profileTargets(graph, localIdentity).filter(target => pins.localRefs.includes(target.atomRef)) : [],
          actor, methods: this.options.profileControl ? [READ_PROVIDERS_METHOD, PROFILE_INTENT_METHOD] : [READ_PROVIDERS_METHOD]} satisfies OraclePeerWorld
      }
      const catalog = await this.#call<ReadProvidersReceipt>(READ_PROVIDERS_METHOD, {})
      catalog.providers = catalog.providers.filter(provider => pins.localRefs.includes(provider.ref))
      return catalog
    }, pins, reason => this.#changed(reason))
    this.#leases.add(lease)
    this.#actors.set(lease, actor)
    this.#worlds.set(lease, {identity: localIdentity, pins, intents: createProfileIntentJournal(input.lease)})
    const close = () => {
      this.#leases.delete(lease); this.#actors.delete(lease); this.#worlds.delete(lease)
      const work = lease.close()
      this.#retired.add(work)
      void work.then(() => this.#retired.delete(work), () => this.#retired.delete(work))
      return work
    }
    input.lease.signal.addEventListener("abort", () => {void close()}, {once: true})
    this.#changed()
    await lease.read()
    return {get ready() {return lease.ready}, close}
  }

  /** Observes actual Force changes; browser child changes invalidate their owner, never create another provider or synthetic Photon. */
  observe(message: ForceMessage) {
    if (this.#closed) return
    const part = message.parts[0]
    if (part.part === "gluon" && part.by === "boundary" && (part.op === "add" || part.op === "replace" || part.op === "remove") &&
        this.#browserOwners.has(`atom:${part.path}`) && resolveCanonicalForceFieldsPayload(part.value)) {
      this.#changed("notice")
      return
    }
    if (!statePhoton(message)) return
    const ref = `atom:${message.parts[0].path}`
    const meta = this.#knownAtoms.get(ref)
    if (meta === "@internal/peer" && message.parts[0].value === "running") {this.#changed("observed"); return}
    if (this.#browserOwners.has(ref)) {this.#changed("notice"); return}
    if (meta !== PROVIDER_META) return
    if (this.#deferred.has(ref) && ["ready", "discoveryFailed"].includes(String(message.parts[0].value))) this.#changed("notice")
    if (this.#photonQueued >= 32) {this.#changed(); return}
    const snapshot = structuredClone(message)
    this.#photonQueued++
    this.#photonWork = this.#photonWork.then(async () => {
      if (this.#closed) return
      const graph = await this.#graph()
      const catalog = await this.#call<ReadProvidersReceipt>(READ_PROVIDERS_METHOD, {})
      const provider = catalog.providers.find(provider => provider.ref === ref)
      if (!provider) return
      const registry = provider.registry.value
      const semantic = JSON.stringify({resolution: provider.registry.resolution, entries: registry?.entries.map(entry => ({
        id: entry.id, service: entry.service, host: entry.host, remotePeerId: entry.remotePeerId, executorId: entry.executorId, assignmentId: entry.assignmentId,
        source: entry.source.kind === "peer" ? {kind: entry.source.kind, peerId: entry.source.peerId, universeRoot: entry.source.universeRoot, worldIdentity: entry.source.worldIdentity, atoms: entry.source.atomBindings?.map(binding => ({worldIdentity: binding.worldIdentity, atomRef: binding.atomRef, grants: binding.grants, connectionEpoch: binding.connectionEpoch}))} : entry.source, resolution: entry.resolution, connection: entry.connection, capabilities: entry.capabilities, check: entry.checks.status,
      })), observations: registry?.observations, selectedId: registry?.settings.selectedId})
      if (this.#published.get(ref) === semantic) return
      const history = await this.#history({kind: "frontier"})
      const records = await this.#history({kind: "range", cutId: history.frontier.cutId, fromSequence: Math.max(1, history.frontier.throughSequence - 127), limit: 128})
      const matches = records.frontier.cutId === history.frontier.cutId ? records.entries.filter(entry => samePhoton(entry.particle, snapshot.parts[0])) : []
      const cursor = matches.length === 1 ? {cutId: history.frontier.cutId, sequence: matches[0]!.sequence, id: matches[0]!.id} : null
      this.#published.set(ref, semantic)
      for (const lease of this.#leases) await lease.publish(snapshot, history.frontier, cursor, graph.root)
    }).catch(() => {this.#changed()}).finally(() => {this.#photonQueued--})
  }

  async read(signal: AbortSignal): Promise<ProviderPeerCatalogSnapshot> {
    signal.throwIfAborted()
    if (this.#closed) throw new Error("Peer Oracle Energy closed")
    const peers = (await Promise.all([...this.#leases].map(lease => lease.read()))).flat()
    signal.throwIfAborted()
    return {schema: "metafor/provider-peers/v1", version: 1, resolution: this.#leases.size ? "exact" : "unknown", peers}
  }

  /** Read-only native observation; stale/gap is retained until a successful bounded ordinary refresh. */
  snapshot(): ProviderPeerCatalogSnapshot {
    return {schema: "metafor/provider-peers/v1", version: 1, resolution: this.#leases.size ? "exact" : "unknown", peers: [...this.#leases].flatMap(lease => lease.snapshot())}
  }

  /** Public assigned profile metadata; native paths, catalogs and credentials remain with their owner. */
  async readProfiles(): Promise<ProfileCatalogReceipt> {
    if (this.#closed || !this.options.profileControl) throw new Error("Profile Oracle capability is not assigned")
    const graph = await this.#graph()
    const history = await this.#history({kind: "frontier"})
    const targets = [...this.#worlds].flatMap(([lease, owner]) => !lease.input.lease.signal.aborted && owner.identity.cutId === history.frontier.cutId ?
      profileTargets(graph, owner.identity).filter(target => owner.pins.localRefs.includes(target.atomRef)) : [])
    for (const lease of this.#leases) if (lease.input.role === "leader") for (const peer of await lease.read()) {
      if (peer.connection === "connected" && peer.observation === "current") targets.push(...(peer.world?.profileTargets ?? []))
    }
    return {schema: "metafor/profile-targets/v1", version: 1, targets}
  }

  /** Explicit local intent or an admitted leader's bounded request to its follower. Never retries uncertain admission. */
  profileIntent(value: unknown): Promise<ProfileIntentReceipt> {
    const request = parseProfileIntent(value)
    if (this.#closed || !this.options.profileControl) return Promise.reject(new Error("Profile Oracle capability is not assigned"))
    const key = JSON.stringify([request.target.worldIdentity, request.id])
    const encoded = JSON.stringify(request)
    const previous = this.#intents.get(key)
    if (previous) return previous.request === encoded ? previous.result : Promise.reject(new Error("Profile intent identity conflicts with an earlier request"))
    if (this.#intents.size >= 1024) return Promise.reject(new Error("Profile intent admission ledger is full"))
    const local = [...this.#leases].find(lease => lease.input.network.id === request.target.worldIdentity.peerId)
    const remote = [...this.#leases].find(lease => lease.input.role === "leader" && lease.input.allowedPeers.includes(request.target.worldIdentity.peerId))
    const result = (local ? this.#applyProfileIntent(local, request) : remote ? remote.profileIntent(request) : Promise.reject(new Error("Profile world binding is unavailable"))).catch(error => {
      if (error instanceof OracleRpcRemoteError && error.code === "admission_refused" && isProfileIntentRefusal(error.data)) throw new OracleRpcAdmissionRefusedError(error.message, error.data)
      throw error
    })
    this.#intents.set(key, {request: encoded, result})
    void result.catch(() => {})
    return result
  }

  async #applyProfileIntent(lease: NativePeerOracleLease, request: ProfileIntentRequest): Promise<ProfileIntentReceipt> {
    if (this.#closed || !this.options.profileControl || lease.input.lease.signal.aborted) throw new Error("Profile Oracle capability is unavailable")
    const owner = this.#worlds.get(lease)
    if (!owner || !owner.pins.localRefs.includes(request.target.atomRef)) throw new Error("Profile Atom scope is not assigned")
    let input: MetaFieldValueApplyRequest | undefined
    return await owner.intents.admit(request, async () => {
      if (!input) throw new Error("Profile admission preflight is absent")
      const admission = await this.#call<ProfileIntentReceipt["admission"]>(META_FIELD_VALUE_APPLY_METHOD, input)
      if (admission.resolution !== "exact" || admission.atom.root !== input.atom.root || admission.atom.ref !== input.atom.ref || admission.field !== "input" || admission.frontier.cutId !== owner.identity.cutId) throw new Error("Profile admission is uncertain; do not automatically resend")
      return {schema: "metafor/profile-intent/v1", version: 1, id: request.id, operation: request.operation, target: request.target, admission}
    }, async () => {
      try {
        const history = await this.#history({kind: "frontier"})
        if (history.frontier.cutId !== owner.identity.cutId) throw new Error("Profile world identity changed")
        const graph = await this.#graph()
        const atom = resolveProfileTarget(graph, owner.identity, request)
        lease.input.lease.signal.throwIfAborted()
        input = {contractVersion: 1, atom: {root: graph.root, ref: atom.ref, meta: atom.meta}, field: "input",
        value: request.operation === "profile.open" ? "open" : request.operation === "profile.save" ? "save"
          : PROFILE_RECONFIGURE_INPUT_PREFIX + JSON.stringify({id: request.id, templatePath: "templatePath" in request ? request.templatePath : undefined}), expectedFrontier: history.frontier}
      } catch (error) {
        throw new OracleRpcAdmissionRefusedError(error instanceof Error ? error.message : "Profile precondition refused", {
          schema: "metafor/profile-intent-refusal/v1", version: 1, id: request.id, operation: request.operation, target: request.target, reason: "precondition",
        })
      }
    })
  }

  #changed(reason: "network" | "notice" | "observed" | "hint" = "network") {
    if (this.#closed) return
    this.#refreshPending = true
    if (reason === "network" || reason === "hint") this.#probePending = true
    if (this.#refreshing) return
    this.#refreshing = true
    this.#refreshWork = (async () => {
      let conflictRetries = 1
      while (this.#refreshPending && !this.#closed) {
        this.#refreshPending = false
        const probe = this.#probePending
        this.#probePending = false
        let attemptingProvider: string | undefined
        try {
          if (probe) await Promise.all([...this.#leases].map(lease => lease.read()))
          const graph = await this.#graph()
          for (const [lease, actor] of this.#actors) {
            const node = allAtoms(graph).find(atom => atom.ref === actor.ref && atom.meta === actor.meta)
            if (node?.state !== "running") continue
            if (this.#closed) break
            if (node.values.oracleReady === lease.ready) continue
            const history = await this.#history({kind: "frontier"})
            if (this.#closed) break
            await this.#call(META_FIELD_VALUE_APPLY_METHOD, {contractVersion: 1, atom: {root: graph.root, ref: actor.ref, meta: actor.meta},
              field: "oracleReady", value: lease.ready, expectedFrontier: history.frontier})
          }
          for (const provider of allAtoms(graph).filter(atom => atom.meta === PROVIDER_META && atom.values.registryMode !== "executor").slice(0, 16)) {
            if (!this.options.refreshProviders) break
            if (this.#closed) break
            const admitted = this.#admitted.get(provider.ref) ?? this.#uncertain.get(provider.ref)
            if (admitted && provider.values.discoveryAckId !== admitted) {this.#deferred.add(provider.ref); continue}
            if (admitted) {this.#admitted.delete(provider.ref); this.#uncertain.delete(provider.ref)}
            if (provider.state === "discovering" || provider.state === "turning" || provider.state === "bootstrapping" || provider.values.discoveryRequest != null) {this.#deferred.add(provider.ref); continue}
            attemptingProvider = provider.ref
            this.#deferred.delete(provider.ref)
            const stale = [...this.#leases].flatMap(lease => lease.snapshot()).some(peer => peer.observation === "gap") ? "gap" : "stale"
            let history = await this.#call<DarkForceHistoryReadReceipt>(DARK_FORCE_HISTORY_READ_METHOD, {contractVersion: 1, query: {kind: "frontier"}})
            if (this.#closed) break
            await this.#call(META_FIELD_VALUE_APPLY_METHOD, {contractVersion: 1, atom: {root: graph.root, ref: provider.ref, meta: provider.meta},
              field: "discoveryStatus", value: stale, expectedFrontier: history.frontier})
            history = await this.#call<DarkForceHistoryReadReceipt>(DARK_FORCE_HISTORY_READ_METHOD, {contractVersion: 1, query: {kind: "frontier"}})
            if (this.#closed) break
            const requestId = `peer-event:${Date.now()}:${++this.#sequence}`
            try {
              const receipt = await this.#call<MetaFieldValueApplyReceipt>(META_FIELD_VALUE_APPLY_METHOD, {contractVersion: 1, atom: {root: graph.root, ref: provider.ref, meta: provider.meta},
                field: "discoveryRequest", value: JSON.stringify({id: requestId}), expectedFrontier: history.frontier})
              if (receipt.resolution !== "exact" || receipt.atom.root !== graph.root || receipt.atom.ref !== provider.ref || receipt.atom.meta !== provider.meta || receipt.field !== "discoveryRequest" ||
                  receipt.acceptance.cutId !== history.frontier.cutId || receipt.acceptance.sequence !== history.frontier.throughSequence + 1 || receipt.acceptance.id !== `${receipt.acceptance.cutId}:${receipt.acceptance.sequence}`) throw new Error("Discovery admission is uncertain")
              this.#admitted.set(provider.ref, requestId)
            } catch (error) {
              if (!(error instanceof OracleRpcRemoteError && error.code === "admission_refused" && isMetaFieldValueApplyRefusal(error.data))) this.#uncertain.set(provider.ref, requestId)
              throw error
            }
            this.#deferred.delete(provider.ref)
          }
        } catch (error) {
          if (attemptingProvider) this.#deferred.add(attemptingProvider)
          const refusal = error instanceof OracleRpcRemoteError && error.code === "admission_refused" && isMetaFieldValueApplyRefusal(error.data) ? error.data : undefined
          if (refusal?.reason === "frontier_mismatch" && conflictRetries > 0) {conflictRetries--; this.#refreshPending = true}
          else if (!this.#closed) console.warn("[energy] Provider discovery refresh refused", {reason: refusal?.reason ?? "unconfirmed", deferred: [...this.#deferred]})
        }
      }
    })().finally(() => {this.#refreshing = false})
  }

  close(): Promise<void> {
    if (this.#closing) return this.#closing
    this.#closed = true
    this.#controller.abort()
    const leases = [...this.#leases].map(lease => lease.close())
    this.#leases.clear()
    this.#actors.clear()
    this.#worlds.clear()
    return this.#closing = bounded(Promise.allSettled([...leases, ...this.#retired, ...this.#calls, ...[...this.#intents.values()].map(intent => intent.result), this.#photonWork, ...(this.#refreshWork ? [this.#refreshWork] : [])]), new AbortController().signal).then(() => {}, () => {})
  }
}
