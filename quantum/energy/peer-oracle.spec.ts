import {expect, test} from "bun:test"
import {mkdtempSync} from "node:fs"
import {rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {GRAPH_SCHEMA, parseMetaAddress, type Graph, type RuntimeAtom} from "@metafor/types/metafor/graph"
import {PROVIDER_META} from "@metafor/types/metafor/providers"
import {createProviderRegistry} from "@metafor/types/metafor/provider-validation"
import {PEER_PROVIDER_ORACLE_CHANNEL, PEER_PROVIDER_PHOTON_CHANNEL} from "@metafor/types/metafor/peer-oracle"
import type {PeerData, PeerNetwork, PeerSnapshot} from "@metafor/tech-peer"
import {createPeerNetwork} from "@metafor/tech-peer"
import {createWeriftPeerConnectionFactory} from "@metafor/tech-peer/werift"
import {createRendezvousServer} from "@metafor/tech-peer/rendezvous"
import {connectWebSocketSignaling} from "@metafor/tech-peer/signaling"
import {OracleRpcPeer, OracleRpcAdmissionRefusedError, OracleRpcRemoteError} from "shared/transport/oracle"
import {BOUNDARY_GRAPH_PROJECTION_METHOD} from "shared/protocol/boundary/runtime"
import {DARK_FORCE_HISTORY_READ_METHOD, ENERGY_MASS_RESULT_READ_METHOD, META_FIELD_VALUE_APPLY_METHOD, type DarkForceHistoryPublicEntry} from "shared/protocol/metafor/observation"
import type {SourcedForceMessage} from "shared/protocol/force/message"
import {OracleRouter} from "../dark/oracle/router"
import {createLocalOracleChannelPair} from "../dark/oracle/local"
import {DARK_DECLARATION_PROJECTION_METHOD} from "../dark/graph/declaration"
import {GraphOracle} from "../dark/graph/oracle"
import {EnergyPeerOracleKernel} from "./peer-oracle"
import {installProfileOracle} from "./profile-intent"
import {PROFILE_READ_METHOD, PROFILE_INTENT_METHOD, type ProfileCatalogReceipt, type ProfileIntentRequest, type ProfileIntentReceipt} from "@metafor/types/metafor/profile-intent"
import {createProcessOracleEnvironment, readOracleEnvironmentPeerRoles} from "./environment"

async function until(check: () => boolean) {
  const deadline = Date.now() + 3000
  while (!check()) {if (Date.now() > deadline) throw new Error("Scoped peer condition timed out"); await Bun.sleep(5)}
}

function pair() {
  const data = [new Set<(event: PeerData) => void>(), new Set<(event: PeerData) => void>()]
  const state = [new Set<(snapshot: PeerSnapshot) => void>(), new Set<(snapshot: PeerSnapshot) => void>()]
  const ids = ["mac-peer", "workspace-peer"]
  const alive = [true, true]
  let generation = "epoch-1"
  let drop = false
  const sent: Array<{from: string, channel: string, value: unknown}> = []
  const make = (index: number): PeerNetwork => {
    const remote = 1 - index
    const snapshot = (): PeerSnapshot => ({id: ids[index]!, peers: [ids[remote]!], bootstrap: true,
      links: alive[index] && alive[remote] ? [{peerId: ids[remote]!, generation, state: "open"}] : []})
    return {id: ids[index]!, snapshot, maxMessageBytes: 16 * 1024 * 1024, async connect() {}, async send(_peer, payload, options = {}) {
      const channel = options.channel ?? "app"
      sent.push({from: ids[index]!, channel, value: typeof payload === "string" ? JSON.parse(payload) : payload})
      if (drop && channel === PEER_PROVIDER_PHOTON_CHANNEL) {drop = false; return}
      if (!alive[index] || !alive[remote]) throw new Error("Fixture peer disconnected")
      await Bun.sleep(0)
      for (const listener of data[remote]!) listener({peerId: ids[index]!, channel, data: payload})
    }, onData(listener) {data[index]!.add(listener); return () => {data[index]!.delete(listener)}}, subscribe(listener) {state[index]!.add(listener); return () => {state[index]!.delete(listener)}},
      async disconnect() {}, closeBootstrap() {}, async close() {alive[index] = false; for (const callbacks of state) for (const callback of callbacks) callback(snapshot())}}
  }
  return {a: make(0), b: make(1), sent, dropPhoton() {drop = true}, epoch() {generation = "epoch-2"; for (const callbacks of state) for (const callback of callbacks) callback({} as PeerSnapshot)}}
}

function world(id: string, role: "leader" | "follower", network: PeerNetwork, refreshProviders = false, retainedDirectory?: string, profiles = false, profileRoot = "intel-macos-chrome-studio") {
  const directory = retainedDirectory ?? mkdtempSync(join(tmpdir(), "energy-peer-oracle-"))
  const root = parseMetaAddress(profiles ? profileRoot : role === "leader" ? "intel-macos-chrome-studio" : "workspace-capsule")!
  const peerMeta = parseMetaAddress("@internal/peer")!
  const providerMeta = parseMetaAddress(PROVIDER_META)!
  const ptr = `#/template/${root}` as const
  const provider: RuntimeAtom = {kind: "atom", ref: "atom:3", meta: providerMeta, declaration: `${ptr}/matter/1`, state: "ready",
    values: {discoveryStatus: "observed", discoveryRequest: null, discoveryAckId: "", registryMode: "owner"}, mass: [{ref: "mass:registry", key: "registry", format: "json", label: null, description: null, content: "lazy"}]}
  const peerAtom: RuntimeAtom = {kind: "atom", ref: "atom:2", meta: peerMeta, declaration: `${ptr}/matter/0`, state: "running", values: {role, oracleReady: false}, mass: []}
  const graph: Graph = {schema: GRAPH_SCHEMA, root, template: {
    [root]: {name: "World", fields: [], superposition: [{name: "ready", transitions: null}], mass: [], processes: [], matter: [{kind: "wimp", src: peerMeta}, {kind: "wimp", src: providerMeta}]},
    [peerMeta]: {name: "Peer", fields: [{key: "role", type: "string"}, {key: "oracleReady", type: "boolean"}], superposition: [{name: "running", transitions: null}], mass: [], processes: []},
    [providerMeta]: {name: "Provider", fields: [{key: "discoveryStatus", type: "string"}, {key: "discoveryRequest", type: "string"}, {key: "discoveryAckId", type: "string"}, {key: "registryMode", type: "string"}],
      superposition: [{name: "ready", transitions: null}], mass: [{key: "registry", format: "json"}], processes: []},
  }, runtime: {roots: [{kind: "atom", ref: "atom:1", meta: root, declaration: ptr, state: "ready", values: {}, mass: [], children: [peerAtom, provider]}], reactions: []}}
  if (profiles) {
    graph.template[root]!.fields = ["input", "profileName", "saveId"].map(key => ({key, type: "string"}))
    graph.template[root]!.superposition = [{name: "ready", transitions: {opening: {input: {eq: "open"}}, saving: {input: {eq: "save"}}}}, {name: "opening", transitions: null}, {name: "saving", transitions: null}]
    const owner = graph.runtime.roots[0]
    if (owner?.kind === "atom") owner.values = {input: null, profileName: "assigned-browser", saveId: "immutable-save-1"}
    if (profileRoot === "workspace-capsule" && owner?.kind === "atom") {
      graph.template[root]!.fields.push({key: "capsuleStatus", type: "string"}, {key: "instanceId", type: "string"})
      owner.values.capsuleStatus = "running"
      owner.values.instanceId = "assigned-instance"
    }
  }
  let cutId = `cut-${id}`
  let sequence = 12
  const entries: DarkForceHistoryPublicEntry[] = []
  const writes: Array<{field: string, value: unknown, atom: {ref: string}}> = []
  const attempts: string[] = []
  const conflicts = new Map<string, number>()
  const uncertain = new Set<string>()
  let immediateDiscoveryAck = false
  const registry = createProviderRegistry()
  const locals = ["dark", "energy", "boundary"].map(name => createLocalOracleChannelPair(name, () => peers[name]!.methods()))
  const peers: Record<string, OracleRpcPeer> = Object.fromEntries(locals.map((pair, index) => [["dark", "energy", "boundary"][index]!, new OracleRpcPeer(pair.peer)]))
  peers.boundary!.expose(BOUNDARY_GRAPH_PROJECTION_METHOD, () => ({root, runtime: graph.runtime}))
  peers.dark!.expose(DARK_DECLARATION_PROJECTION_METHOD, () => ({root, template: graph.template}))
  peers.dark!.expose(DARK_FORCE_HISTORY_READ_METHOD, params => ({contractVersion: 1, resolution: "exact", frontier: {cutId, throughSequence: sequence, retroactiveComplete: false}, range: null,
    entries: (params as {query: {kind: string}}).query.kind === "range" ? entries : []}))
  peers.dark!.expose(META_FIELD_VALUE_APPLY_METHOD, params => {
    const request = params as {field: string, value: unknown, atom: {ref: string}}
    attempts.push(request.field)
    const remaining = conflicts.get(request.field) ?? 0
    if (remaining > 0) {
      conflicts.set(request.field, remaining - 1)
      sequence++
      throw new OracleRpcAdmissionRefusedError("Fixture frontier changed before acceptance", {schema: "metafor/field-admission-refusal/v1", contractVersion: 1, reason: "frontier_mismatch"})
    }
    writes.push(structuredClone(request))
    const target = request.atom.ref === provider.ref ? provider : request.atom.ref === peerAtom.ref ? peerAtom : graph.runtime.roots[0]
    if (!target || target.kind !== "atom" || target.ref !== request.atom.ref) throw new Error("Fixture target absent")
    target.values[request.field] = request.value as string | boolean
    if (uncertain.delete(request.field)) throw new Error("Fixture response lost after Field effect")
    if (immediateDiscoveryAck && request.field === "discoveryRequest") {
      provider.values.discoveryAckId = JSON.parse(String(request.value)).id
      provider.values.discoveryRequest = null
      kernel.observe({parts: [{part: "photon", op: "replace", path: 3, by: "matrix", ts: sequence, from: `immediate-ready-${sequence}`, value: "ready"}]})
    }
    return {contractVersion: 1, resolution: "exact", atom: {root, ref: target.ref, meta: target.meta}, field: request.field,
      acceptance: {cutId, sequence: ++sequence, id: `${cutId}:${sequence}`}, frontier: {cutId, throughSequence: sequence, retroactiveComplete: false}}
  })
  peers.energy!.expose(ENERGY_MASS_RESULT_READ_METHOD, () => ({contractVersion: 1, resolution: "exact", atom: {root, ref: provider.ref, meta: provider.meta}, key: "registry",
    bytes: JSON.stringify(registry).length, content: {format: "json", present: true, value: registry}}))
  new GraphOracle().onServerStarted(peers.dark!)
  const router = new OracleRouter()
  const kernel = new EnergyPeerOracleKernel({peer: peers.energy!, refreshProviders, profileControl: profiles})
  installProfileOracle(peers.energy!, () => kernel)
  for (const local of locals) router.attach(local.router)
  const controller = new AbortController()
  return {kernel, registry, graph, provider, peerAtom, writes, attempts, conflicts, uncertain, controller, directory, lease: {path: directory, signal: controller.signal, async release() {controller.abort()}}, rpc: peers.energy!, client: peers.dark!,
    completeDiscoveryImmediately() {immediateDiscoveryAck = true},
    open: () => kernel.open({ref: "atom:2", meta: "@internal/peer"}, {network, allowedPeers: [role === "leader" ? "workspace-peer" : "mac-peer"], role, lease: {path: directory, signal: controller.signal, async release() {controller.abort()}}}),
    photon(proven = true): SourcedForceMessage {
      const message: SourcedForceMessage = {parts: [{part: "photon", op: "test", path: 3, ts: ++sequence, by: "matrix", from: `execution-${sequence}`, value: "ready"}]}
      if (proven) entries.push({id: `${cutId}:${sequence}`, sequence, acceptedAt: new Date().toISOString(), particle: message.parts[0]})
      return message
    }, resetCut() {cutId = `replacement-${id}`},
    async close(preserveDirectory = false) {await kernel.close(); for (const peer of Object.values(peers)) peer.close(); await Promise.all(locals.map(local => local.peer.close())); if (!preserveDirectory) await rm(directory, {recursive: true, force: true})},
  }
}

test("opaque Meta network ports are narrowed by native Energy before any Oracle or transport effect", async () => {
  const p = pair()
  const a = world("mac", "leader", p.a)
  try {
    for (const network of [{id: "mac-peer"}, {...p.a, snapshot: null}]) await expect(a.kernel.open({ref: "atom:2", meta: "@internal/peer"},
      {network, allowedPeers: ["workspace-peer"], role: "leader", lease: a.lease})).rejects.toThrow("public PeerNetwork port")
    expect(p.sent).toEqual([])
    expect(a.writes).toEqual([])
  } finally {await a.close(); await p.a.close(); await p.b.close()}
})

test("two admitted worlds reuse one public peer network and existing Oracle RPC for scoped catalogs; lease survives action but not Mass lifetime", async () => {
  const p = pair()
  const a = world("mac", "leader", p.a)
  const b = world("workspace", "follower", p.b)
  try {
    const [left, right] = await Promise.all([a.open(), b.open()])
    await until(() => left.ready && right.ready)
    expect(left.ready).toBeTrue()
    expect(right.ready).toBeTrue()
    const observed = await a.kernel.read(new AbortController().signal)
    expect(observed.peers[0]).toMatchObject({connection: "connected", observation: "current", world: {worldIdentity: {peerId: "workspace-peer", cutId: "cut-workspace", root: "workspace-capsule"}}})
    expect(observed.peers[0]?.bindings[0]).toMatchObject({atomRef: "atom:3", grants: ["provider.registry.read", "photon.observe"], connectionEpoch: "epoch-1", photonCursor: null})
    a.controller.abort()
    await until(() => !left.ready)
    expect((await a.kernel.read(new AbortController().signal)).resolution).toBe("unknown")
    expect(p.a.snapshot().links).toHaveLength(1)
  } finally {await a.close(); await b.close(); await p.a.close(); await p.b.close()}
}, 15_000)

test("actual scoped Photons preserve provenance, prove cursor only from an exact history record and recover ordinary observation after gaps", async () => {
  const p = pair()
  const a = world("mac", "leader", p.a)
  const b = world("workspace", "follower", p.b)
  try {
    await Promise.all([a.open(), b.open()])
    await until(() => a.kernel.snapshot().peers[0]?.observation === "current" && b.kernel.snapshot().peers[0]?.observation === "current")
    // Finish the finite reciprocal handshake refresh before testing an unrefreshed notice.
    await Bun.sleep(30)
    a.kernel.observe(a.photon())
    await until(() => b.kernel.snapshot().peers[0]?.observation === "stale")
    const first = p.sent.filter(frame => frame.channel === PEER_PROVIDER_PHOTON_CHANNEL).at(-1)!.value as {binding: {photonCursor: unknown}, latestObservedFrontier: unknown, message: SourcedForceMessage}
    expect(first.binding.photonCursor).not.toBeNull()
    expect(first.message.parts[0].by).toBe("matrix")
    expect(first.latestObservedFrontier).toBeDefined()
    expect((await b.kernel.read(new AbortController().signal)).peers[0]?.observation).toBe("current")
    a.registry.discovery.issues.push("different metadata is not a capability change")
    a.registry.settings.selectedId = null
    a.registry.observations.push({source: {kind: "atom", root: a.graph.root, ref: "atom:90", meta: "chrome-studio"}, state: "running", status: "running", resolution: "unknown", bindingIds: [], issues: []})
    p.dropPhoton()
    a.kernel.observe(a.photon(false))
    await until(() => p.sent.filter(frame => frame.channel === PEER_PROVIDER_PHOTON_CHANNEL).length === 2)
    a.registry.observations[0]!.status = "stopped"
    a.kernel.observe(a.photon(false))
    await until(() => b.kernel.snapshot().peers[0]?.observation === "gap")
    const last = p.sent.filter(frame => frame.channel === PEER_PROVIDER_PHOTON_CHANNEL).at(-1)!.value as {binding: {photonCursor: unknown}}
    expect(last.binding.photonCursor).toBeNull()
    expect((await b.kernel.read(new AbortController().signal)).peers[0]?.observation).toBe("current")
    const count = p.sent.filter(frame => frame.channel === PEER_PROVIDER_PHOTON_CHANNEL).length
    a.registry.revision++
    a.kernel.observe(a.photon())
    await Bun.sleep(30)
    expect(p.sent.filter(frame => frame.channel === PEER_PROVIDER_PHOTON_CHANNEL)).toHaveLength(count)
  } finally {await a.close(); await b.close(); await p.a.close(); await p.b.close()}
})

test("durable native lease requires the exact peer role; execution revocation does not revoke its Mass lifetime", async () => {
  expect(readOracleEnvironmentPeerRoles({})).toEqual({peerScopes: [], providerDiscoveryScopes: []})
  expect(() => readOracleEnvironmentPeerRoles({ORACLE_ENVIRONMENT_PEER_SCOPES: "*"})).toThrow("exact Meta")
  const p = pair()
  const a = world("mac", "leader", p.a)
  const b = world("workspace", "follower", p.b)
  const execution = new AbortController()
  const access = createProcessOracleEnvironment({peer: a.rpc, graphScopes: [], peerScopes: ["@internal/peer"], atomId: 2, wimp: "@internal/peer", signal: execution.signal, peerKernel: a.kernel})!
  try {
    expect(access.environment.openPeerOracle).toBeDefined()
    expect(createProcessOracleEnvironment({peer: a.rpc, graphScopes: [], peerScopes: ["@internal/peer"], atomId: 3, wimp: PROVIDER_META, signal: execution.signal, peerKernel: a.kernel})).toBeUndefined()
    const [lease] = await Promise.all([access.environment.openPeerOracle!({network: p.a, allowedPeers: [p.b.id], role: "leader", lease: a.lease}), b.open()])
    access.close()
    await expect(access.environment.read()).rejects.toThrow("ended")
    expect(lease.ready).toBeTrue()
    a.controller.abort()
    await until(() => !lease.ready)
    expect(p.a.snapshot().links).toHaveLength(1)
  } finally {access.close(); await a.close(); await b.close(); await p.a.close(); await p.b.close()}
})

test("Photon invalidation writes only fixed ordinary discovery Fields and ignores executor registry aliases", async () => {
  const p = pair()
  const a = world("mac", "leader", p.a)
  const b = world("workspace", "follower", p.b, true)
  try {
    await Promise.all([a.open(), b.open()])
    await until(() => b.writes.some(write => write.field === "discoveryRequest"))
    const initial = b.writes.filter(write => write.field === "discoveryRequest").at(-1)!
    b.provider.values.discoveryAckId = JSON.parse(String(initial.value)).id
    b.provider.values.discoveryRequest = null
    const count = b.writes.length
    a.kernel.observe(a.photon())
    await until(() => b.writes.slice(count).some(write => write.field === "discoveryRequest"))
    expect(b.writes.slice(count).filter(write => write.atom.ref === b.provider.ref).map(write => write.field)).toEqual(["discoveryStatus", "discoveryRequest"])
    expect(b.writes.slice(count).some(write => write.field === "request" || write.field === "bootstrap")).toBeFalse()
    const executor = structuredClone(b.provider)
    executor.ref = "atom:4"
    executor.declaration = `#/template/${b.graph.root}/matter/2`
    executor.values.registryMode = "executor"
    const root = b.graph.runtime.roots[0]
    if (root?.kind !== "atom") throw new Error("Expected world root")
    root.children?.push(executor)
    b.graph.template[b.graph.root]!.matter!.push({kind: "wimp", src: parseMetaAddress(PROVIDER_META)!})
    const next = b.writes.length
    a.registry.observations.push({source: {kind: "atom", root: a.graph.root, ref: "atom:90", meta: "chrome-studio"}, state: "running", status: null, resolution: "unknown", bindingIds: [], issues: []})
    a.kernel.observe(a.photon())
    await until(() => b.kernel.snapshot().peers[0]?.observation === "stale")
    await Bun.sleep(20)
    expect(b.writes.slice(next).some(write => write.atom.ref === executor.ref)).toBeFalse()
  } finally {await a.close(); await b.close(); await p.a.close(); await p.b.close()}
})

test("startup discovery retries one proven frontier refusal and waits only for the actually admitted request ACK", async () => {
  const p = pair()
  const a = world("mac", "leader", p.a)
  const b = world("workspace", "follower", p.b, true)
  b.conflicts.set("discoveryRequest", 1)
  try {
    await Promise.all([a.open(), b.open()])
    await until(() => b.writes.some(write => write.field === "discoveryRequest"))
    expect(b.attempts.filter(field => field === "discoveryRequest")).toHaveLength(2)
    const admitted = b.writes.find(write => write.field === "discoveryRequest")!
    b.provider.values.discoveryAckId = JSON.parse(String(admitted.value)).id
    b.provider.values.discoveryRequest = null
    b.kernel.observe({parts: [{part: "photon", op: "replace", path: 2, by: "matrix", ts: 100, from: "peer-observed-after-ack", value: "running"}]})
    await until(() => b.writes.filter(write => write.field === "discoveryRequest").length === 2)
    expect(b.attempts.filter(field => field === "discoveryRequest")).toHaveLength(3)
  } finally {await a.close(); await b.close(); await p.a.close(); await p.b.close()}
})

test("an immediate discovery ACK Photon does not turn successful finite refresh into a self-triggered loop", async () => {
  const p = pair()
  const a = world("mac", "leader", p.a)
  const b = world("workspace", "follower", p.b, true)
  try {
    await Promise.all([a.open(), b.open()])
    await until(() => b.writes.some(write => write.field === "discoveryRequest"))
    await Bun.sleep(30)
    const initial = b.writes.filter(write => write.field === "discoveryRequest").at(-1)!
    b.provider.values.discoveryAckId = JSON.parse(String(initial.value)).id
    b.provider.values.discoveryRequest = null
    b.completeDiscoveryImmediately()
    const baseline = b.attempts.filter(field => field === "discoveryRequest").length
    b.kernel.observe({parts: [{part: "photon", op: "replace", path: 2, by: "matrix", ts: 103, from: "external-peer-ready", value: "running"}]})
    await until(() => b.attempts.filter(field => field === "discoveryRequest").length === baseline + 1)
    await Bun.sleep(40)
    expect(b.attempts.filter(field => field === "discoveryRequest")).toHaveLength(baseline + 1)
  } finally {await a.close(); await b.close(); await p.a.close(); await p.b.close()}
})

test("repeated known refusal remains deferred until a real Force hint; uncertain discovery never resends automatically", async () => {
  const p = pair()
  const a = world("mac", "leader", p.a)
  const b = world("workspace", "follower", p.b, true)
  try {
    await Promise.all([a.open(), b.open()])
    await until(() => b.writes.some(write => write.field === "discoveryRequest"))
    await Bun.sleep(30)
    const initial = b.writes.filter(write => write.field === "discoveryRequest").at(-1)!
    b.provider.values.discoveryAckId = JSON.parse(String(initial.value)).id
    b.provider.values.discoveryRequest = null
    const baseline = b.attempts.filter(field => field === "discoveryRequest").length
    const priorWrites = b.writes.filter(write => write.field === "discoveryRequest").length
    b.conflicts.set("discoveryRequest", 2)
    const notice: SourcedForceMessage = {parts: [{part: "photon", op: "replace", path: 2, by: "matrix", ts: 101, from: "peer-ready", value: "running"}]}
    b.kernel.observe(notice)
    await until(() => b.attempts.filter(field => field === "discoveryRequest").length === baseline + 2)
    await Bun.sleep(30)
    expect(b.attempts.filter(field => field === "discoveryRequest")).toHaveLength(baseline + 2)
    expect(b.writes.filter(write => write.field === "discoveryRequest")).toHaveLength(priorWrites)
    b.uncertain.add("discoveryRequest")
    b.kernel.observe(notice)
    await until(() => b.writes.filter(write => write.field === "discoveryRequest").length === priorWrites + 1)
    b.kernel.observe(notice)
    await Bun.sleep(30)
    expect(b.attempts.filter(field => field === "discoveryRequest")).toHaveLength(baseline + 3)
    expect(b.writes.filter(write => write.field === "discoveryRequest")).toHaveLength(priorWrites + 1)
  } finally {await a.close(); await b.close(); await p.a.close(); await p.b.close()}
})

test("a pending bootstrap is never overwritten and real Provider ready Photon releases deferred discovery", async () => {
  const p = pair()
  const a = world("mac", "leader", p.a)
  const b = world("workspace", "follower", p.b, true)
  b.provider.values.discoveryRequest = '{"id":"bootstrap"}'
  try {
    await Promise.all([a.open(), b.open()])
    await Bun.sleep(30)
    expect(b.writes.some(write => write.field === "discoveryRequest")).toBeFalse()
    b.provider.values.discoveryRequest = null
    b.provider.values.discoveryAckId = "bootstrap"
    b.kernel.observe({parts: [{part: "photon", op: "replace", path: 3, by: "matrix", ts: 102, from: "bootstrap-completed", value: "ready"}]})
    await until(() => b.writes.some(write => write.field === "discoveryRequest"))
    expect(b.writes.filter(write => write.field === "discoveryRequest")).toHaveLength(1)
  } finally {await a.close(); await b.close(); await p.a.close(); await p.b.close()}
})

test("public profile refusal proves no Field effect and a new explicit intent may be admitted after refresh", async () => {
  const p = pair()
  const a = world("mac", "leader", p.a, false, undefined, true)
  const b = world("workspace", "follower", p.b)
  try {
    await Promise.all([a.open(), b.open()])
    const target = (await a.client.call<ProfileCatalogReceipt>("energy", PROFILE_READ_METHOD, {})).targets[0]!
    const request: ProfileIntentRequest = {id: "refused-open", operation: "profile.open", target: {worldIdentity: target.worldIdentity, atomRef: target.atomRef}, expectedProfile: target.expectedProfile}
    a.conflicts.set("input", 1)
    const error = await a.client.call("energy", PROFILE_INTENT_METHOD, request).catch(error => error)
    expect(error).toBeInstanceOf(OracleRpcRemoteError)
    expect(error).toMatchObject({code: "admission_refused", data: {schema: "metafor/profile-intent-refusal/v1", reason: "frontier_mismatch", id: request.id}})
    expect(a.writes.filter(write => write.field === "input")).toHaveLength(0)
    await expect(a.client.call("energy", PROFILE_INTENT_METHOD, request)).rejects.toMatchObject({code: "admission_refused"})
    expect(a.attempts.filter(field => field === "input")).toHaveLength(1)
    await a.client.call("energy", PROFILE_READ_METHOD, {})
    await expect(a.client.call("energy", PROFILE_INTENT_METHOD, {...request, id: "explicit-open-after-refresh"})).resolves.toMatchObject({admission: {field: "input"}})
    expect(a.writes.filter(write => write.field === "input")).toHaveLength(1)
  } finally {await a.close(); await b.close(); await p.a.close(); await p.b.close()}
})

test("connection loss/epoch and world erasure invalidate old bindings; arbitrary Oracle methods are never relayed", async () => {
  const p = pair()
  const a = world("mac", "leader", p.a)
  const b = world("workspace", "follower", p.b)
  try {
    await Promise.all([a.open(), b.open()])
    await p.a.send("workspace-peer", JSON.stringify({version: 1, id: "forbidden", target: "workspace-peer", method: META_FIELD_VALUE_APPLY_METHOD, params: {field: "secret"}}), {channel: PEER_PROVIDER_ORACLE_CHANNEL})
    await Bun.sleep(10)
    expect(b.writes.some(write => write.field === "secret")).toBeFalse()
    await Promise.all([a.kernel.read(new AbortController().signal), b.kernel.read(new AbortController().signal)])
    p.epoch()
    expect((await a.kernel.read(new AbortController().signal)).peers[0]?.bindings[0]?.connectionEpoch).toBe("epoch-2")
    b.provider.ref = "atom:99"
    expect((await a.kernel.read(new AbortController().signal)).peers[0]?.connection).toBe("unknown")
    b.provider.ref = "atom:3"
    expect((await a.kernel.read(new AbortController().signal)).peers[0]?.connection).toBe("connected")
    b.resetCut()
    const reset = await a.kernel.read(new AbortController().signal)
    expect(reset.peers[0]).toMatchObject({connection: "unknown", world: null, bindings: []})
    await p.b.close()
    expect((await a.kernel.read(new AbortController().signal)).peers[0]?.connection).toBe("disconnected")
  } finally {await a.close(); await b.close(); await p.a.close(); await p.b.close()}
})

test("Capsule child Photons and committed Field Gluons invalidate the owning browser observation without forwarding a synthetic Photon", async () => {
  const p = pair()
  const a = world("mac", "leader", p.a)
  const b = world("workspace", "follower", p.b, true)
  const root = b.graph.runtime.roots[0]
  if (root?.kind !== "atom") throw new Error("Expected world root")
  const capsule = parseMetaAddress("capsule")!
  const runtime = parseMetaAddress("@capsule/runtime")!
  b.graph.template[b.graph.root]!.matter!.push({kind: "wimp", src: capsule})
  b.graph.template[capsule] = {name: "Capsule", fields: [], superposition: [{name: "waiting", transitions: null}], mass: [], processes: [], matter: [{kind: "wimp", src: runtime}]}
  b.graph.template[runtime] = {name: "Runtime", fields: [{key: "status", type: "string"}], superposition: [{name: "running", transitions: null}], mass: [], processes: []}
  root.children?.push({kind: "atom", ref: "atom:4", meta: capsule, declaration: `#/template/${b.graph.root}/matter/2`, state: "waiting", values: {}, mass: [], children: [
    {kind: "atom", ref: "atom:5", meta: runtime, declaration: "#/template/capsule/matter/0", state: "running", values: {status: "running"}, mass: []},
  ]})
  try {
    await Promise.all([a.open(), b.open()])
    await until(() => b.writes.some(write => write.field === "discoveryRequest"))
    await Bun.sleep(30)
    const acknowledge = () => {
      const request = b.writes.filter(write => write.field === "discoveryRequest").at(-1)!
      b.provider.values.discoveryAckId = JSON.parse(String(request.value)).id
      b.provider.values.discoveryRequest = null
    }
    acknowledge()
    let count = b.writes.length
    b.kernel.observe({parts: [{part: "photon", op: "test", path: 5, ts: 50, by: "matrix", value: "running"}]})
    await until(() => b.writes.slice(count).some(write => write.field === "discoveryRequest"))
    await Bun.sleep(30)
    acknowledge()
    count = b.writes.length
    b.kernel.observe({parts: [{part: "gluon", op: "replace", path: 5, ts: 51, by: "dark", value: {fields: {status: "stopped"}}}]})
    await Bun.sleep(20)
    expect(b.writes).toHaveLength(count)
    b.kernel.observe({parts: [{part: "gluon", op: "replace", path: 5, ts: 52, by: "boundary", value: {fields: {"1": {valueId: 8, value: "stopped"}}}}]})
    await until(() => b.writes.slice(count).some(write => write.field === "discoveryRequest"))
    expect(p.sent.filter(frame => frame.from === "workspace-peer" && frame.channel === PEER_PROVIDER_PHOTON_CHANNEL)).toEqual([])
  } finally {await a.close(); await b.close(); await p.a.close(); await p.b.close()}
})

test("cold Kernel restoration retains directory Mass world/Atom grants and refuses a new cut under the same peer ID", async () => {
  const p = pair()
  const a = world("mac", "leader", p.a)
  const b = world("workspace", "follower", p.b)
  let restored: ReturnType<typeof world> | undefined
  let replacement: ReturnType<typeof world> | undefined
  try {
    await Promise.all([a.open(), b.open()])
    await Promise.all([a.kernel.read(new AbortController().signal), b.kernel.read(new AbortController().signal)])
    const path = join(a.directory, "oracle-world-pins.json")
    const before = await Bun.file(path).text()
    await a.close(true)
    await b.close()
    replacement = world("workspace", "follower", p.b)
    replacement.resetCut()
    restored = world("mac", "leader", p.a, false, a.directory)
    const [lease] = await Promise.all([restored.open(), replacement.open()])
    expect(lease.ready).toBeTrue()
    expect((await restored.kernel.read(new AbortController().signal)).peers[0]).toMatchObject({connection: "unknown", bindings: [], world: null})
    expect(await Bun.file(path).text()).toBe(before)
  } finally {await a.close(true); await restored?.close(); await b.close(); await replacement?.close(); await p.a.close(); await p.b.close()}
}, 20_000)

test("public TechPeer with real loopback WebRTC carries the same scoped Oracle service without another network", async () => {
  const token = "test-only-energy-peer-oracle"
  const broker = createRendezvousServer({token})
  const rtc = createWeriftPeerConnectionFactory({iceAdditionalHostAddresses: ["127.0.0.1"], iceUseIpv4: true, iceUseIpv6: false,
    iceInterfaceAddresses: {udp4: "127.0.0.1"}, iceFilterCandidatePair: candidate => candidate.localCandidate.host === "127.0.0.1" && candidate.remoteCandidate.host === "127.0.0.1"})
  const aNet = createPeerNetwork({id: "mac-peer", rtc, bootstrap: await connectWebSocketSignaling({url: broker.url, id: "mac-peer", token})})
  const bNet = createPeerNetwork({id: "workspace-peer", rtc, bootstrap: await connectWebSocketSignaling({url: broker.url, id: "workspace-peer", token})})
  const a = world("mac", "leader", aNet)
  const b = world("workspace", "follower", bNet)
  try {
    await aNet.connect("workspace-peer")
    const [left, right] = await Promise.all([a.open(), b.open()])
    expect(left.ready && right.ready).toBeTrue()
    expect((await a.kernel.read(new AbortController().signal)).peers[0]?.catalog?.root).toBe(parseMetaAddress("workspace-capsule")!)
    expect(aNet.snapshot().links).toHaveLength(1)
  } finally {await a.close(); await b.close(); await Promise.allSettled([aNet.close(), bNet.close(), broker.close()])}
}, 30_000)

test("public local profile Oracle saves the assigned existing instance through only Root.input and refuses changed assignment/world or arbitrary commands", async () => {
  const p = pair()
  const a = world("mac", "leader", p.a, false, undefined, true)
  const b = world("workspace", "follower", p.b)
  try {
    await Promise.all([a.open(), b.open()])
    const catalog = await a.client.call<ProfileCatalogReceipt>("energy", PROFILE_READ_METHOD, {})
    expect(catalog.targets).toHaveLength(1)
    const target = catalog.targets[0]!
    expect(target).toMatchObject({atomRef: "atom:1", meta: "intel-macos-chrome-studio", expectedProfile: {name: "assigned-browser", saveId: "immutable-save-1"}, supportedOperations: ["profile.open", "profile.save"], available: true})
    const request: ProfileIntentRequest = {id: "manual-save-1", operation: "profile.save", target: {worldIdentity: target.worldIdentity, atomRef: target.atomRef}, expectedProfile: target.expectedProfile}
    const receipt = await a.client.call<ProfileIntentReceipt>("energy", PROFILE_INTENT_METHOD, request)
    expect(receipt).toMatchObject({id: request.id, operation: "profile.save", admission: {field: "input", atom: {ref: "atom:1"}}})
    expect(a.writes.filter(write => write.atom.ref === "atom:1")).toEqual([expect.objectContaining({field: "input", value: "save"})])
    await expect(a.client.call("energy", PROFILE_INTENT_METHOD, request)).resolves.toEqual(receipt)
    expect(a.writes.filter(write => write.atom.ref === "atom:1")).toHaveLength(1)
    await expect(a.client.call("energy", PROFILE_INTENT_METHOD, {...request, operation: "profile.open"})).rejects.toThrow("conflicts")
    await expect(a.client.call("energy", PROFILE_INTENT_METHOD, {...request, id: "arbitrary", field: "templatePath"})).rejects.toThrow("Invalid")
    const owner = a.graph.runtime.roots[0]
    if (owner?.kind !== "atom") throw new Error("Expected world root")
    owner.values.input = null
    await expect(a.client.call("energy", PROFILE_INTENT_METHOD, {...request, id: "wrong-assignment", expectedProfile: {...target.expectedProfile, name: "other"}})).rejects.toThrow("profile changed")
    await expect(a.client.call("energy", PROFILE_INTENT_METHOD, {...request, id: "wrong-cut", target: {...request.target, worldIdentity: {...target.worldIdentity, cutId: "other-cut"}}})).rejects.toThrow("scope changed")
    await expect(b.client.call("energy", PROFILE_READ_METHOD, {})).rejects.toThrow("not assigned")
    await expect(a.client.call("energy", PROFILE_READ_METHOD, {path: "/private"})).rejects.toThrow("empty arguments")
  } finally {await a.close(); await b.close(); await p.a.close(); await p.b.close()}
}, 15_000)

test("remote profile intent requires pinned leader to follower scope on the same existing peer Oracle channel", async () => {
  const p = pair()
  const a = world("mac", "leader", p.a, false, undefined, true)
  const b = world("workspace", "follower", p.b, false, undefined, true)
  try {
    await Promise.all([a.open(), b.open()])
    const catalog = await a.client.call<ProfileCatalogReceipt>("energy", PROFILE_READ_METHOD, {})
    const target = catalog.targets.find(target => target.worldIdentity.peerId === "workspace-peer")
    if (!target) throw new Error("Expected admitted follower profile")
    const request: ProfileIntentRequest = {id: "remote-save-1", operation: "profile.save", target: {worldIdentity: target.worldIdentity, atomRef: target.atomRef}, expectedProfile: target.expectedProfile}
    const result = await a.client.call<ProfileIntentReceipt>("energy", PROFILE_INTENT_METHOD, request)
    expect(result.target).toEqual(request.target)
    expect(b.writes.filter(write => write.atom.ref === "atom:1")).toEqual([expect.objectContaining({field: "input", value: "save"})])
    expect(p.sent.some(frame => frame.channel === PEER_PROVIDER_ORACLE_CHANNEL && (frame.value as {method?: string}).method === PROFILE_INTENT_METHOD)).toBeTrue()
    const leaderTarget = (await a.client.call<ProfileCatalogReceipt>("energy", PROFILE_READ_METHOD, {})).targets.find(target => target.worldIdentity.peerId === "mac-peer")!
    await expect(b.client.call("energy", PROFILE_INTENT_METHOD, {...request, id: "reverse", target: {worldIdentity: leaderTarget.worldIdentity, atomRef: leaderTarget.atomRef}, expectedProfile: leaderTarget.expectedProfile})).rejects.toThrow("unavailable")
  } finally {await a.close(); await b.close(); await p.a.close(); await p.b.close()}
}, 15_000)

test("Mac leader admits the workspace Capsule save only at its pinned owning root and observes closed-profile capability afterward", async () => {
  const p = pair()
  const a = world("mac", "leader", p.a, false, undefined, true)
  const b = world("workspace", "follower", p.b, false, undefined, true, "workspace-capsule")
  try {
    await Promise.all([a.open(), b.open()])
    const catalog = await a.client.call<ProfileCatalogReceipt>("energy", PROFILE_READ_METHOD, {})
    const descriptor = catalog.targets.find(target => target.worldIdentity.peerId === "workspace-peer")!
    expect(descriptor).toMatchObject({meta: "workspace-capsule", available: true, supportedOperations: ["profile.open", "profile.save"]})
    const request: ProfileIntentRequest = {id: "capsule-save-1", operation: "profile.save", target: {worldIdentity: descriptor.worldIdentity, atomRef: descriptor.atomRef}, expectedProfile: descriptor.expectedProfile}
    const admission = await a.client.call<ProfileIntentReceipt>("energy", PROFILE_INTENT_METHOD, request)
    expect(admission).toMatchObject({id: request.id, admission: {field: "input", atom: {root: "workspace-capsule", ref: "atom:1"}}})
    expect(b.writes.filter(write => write.atom.ref === "atom:1")).toEqual([expect.objectContaining({field: "input", value: "save"})])
    const owner = b.graph.runtime.roots[0]
    if (owner?.kind !== "atom") throw new Error("Missing Capsule root")
    owner.state = "saving"
    expect((await b.client.call<ProfileCatalogReceipt>("energy", PROFILE_READ_METHOD, {})).targets.find(target => target.meta === "workspace-capsule")?.available).toBe(false)
    owner.state = "ready"
    owner.values.input = null
    owner.values.saveId = "new-immutable-save"
    owner.values.capsuleStatus = "saved"
    const completed = (await b.client.call<ProfileCatalogReceipt>("energy", PROFILE_READ_METHOD, {})).targets.find(target => target.meta === "workspace-capsule")!
    expect(completed.expectedProfile.saveId).toBe("new-immutable-save")
    expect(completed.supportedOperations).toEqual(["profile.open"])
    await expect(b.client.call("energy", PROFILE_INTENT_METHOD, {...request, id: "repeat-after-close", expectedProfile: completed.expectedProfile})).rejects.toThrow("unsupported")
    expect(b.writes.filter(write => write.atom.ref === "atom:1")).toHaveLength(1)
  } finally {await a.close(); await b.close(); await p.a.close(); await p.b.close()}
}, 15_000)

test("an offline configured follower never blocks local Mac Oracle/profile readiness or gains remote capabilities", async () => {
  const p = pair()
  await p.b.close()
  const a = world("mac", "leader", p.a, false, undefined, true)
  try {
    const lease = await a.open()
    expect(lease.ready).toBe(true)
    const peers = await a.kernel.read(new AbortController().signal)
    expect(peers.peers[0]).toMatchObject({peerId: "workspace-peer", connection: "disconnected", world: null, catalog: null, bindings: [], observation: "unknown"})
    const catalog = await a.client.call<ProfileCatalogReceipt>("energy", PROFILE_READ_METHOD, {})
    const own = catalog.targets.find(target => target.worldIdentity.peerId === "mac-peer")!
    expect(own.available).toBe(true)
    const local: ProfileIntentRequest = {id: "offline-local-save", operation: "profile.save", target: {worldIdentity: own.worldIdentity, atomRef: own.atomRef}, expectedProfile: own.expectedProfile}
    await expect(a.client.call("energy", PROFILE_INTENT_METHOD, local)).resolves.toMatchObject({id: local.id, admission: {field: "input"}})
    await expect(a.client.call("energy", PROFILE_INTENT_METHOD, {...local, id: "offline-remote-save", target: {worldIdentity: {peerId: "workspace-peer", root: "workspace-capsule", cutId: "unobserved"}, atomRef: "atom:1"}})).rejects.toThrow()
    expect(a.writes.filter(write => write.atom.ref === "atom:1")).toHaveLength(1)
    a.controller.abort()
    expect(lease.ready).toBe(false)
  } finally {await a.close(); await p.a.close()}
}, 15_000)


test("workspace reconfiguration admits one correlated Root input and rejects unsupported targets or caller paths", async () => {
  const p = pair()
  const leader = world("mac", "leader", p.a, false, undefined, true)
  const a = world("workspace", "follower", p.b, false, undefined, true, "workspace-capsule")
  const owner = a.graph.runtime.roots[0]!
  a.graph.template[parseMetaAddress("workspace-capsule")!]!.superposition.push({name: "reconfiguring", transitions: null})
  a.graph.template[parseMetaAddress("workspace-capsule")!]!.fields.push({key: "reconfigureTemplatePath", type: "string"})
  a.graph.template[parseMetaAddress("workspace-capsule")!]!.superposition.find(state => state.name === "ready")!.transitions!.reconfiguring = {input: {startsWith: "profile.reconfigure:"}}
  try {
    await Promise.all([leader.open(), a.open()])
    const target = (await leader.client.call<ProfileCatalogReceipt>("energy", PROFILE_READ_METHOD, {})).targets.find(target => target.meta === "workspace-capsule")!
    expect(target.supportedOperations).toContain("profile.reconfigure")
    const request: ProfileIntentRequest = {id: "reconfigure-public-1", operation: "profile.reconfigure", target: {worldIdentity: target.worldIdentity, atomRef: target.atomRef}, expectedProfile: target.expectedProfile, templatePath: "browser-agent/08-codespace-audio-microphone-cdp.yaml"}
    await expect(leader.client.call("energy", PROFILE_INTENT_METHOD, {...request, templatePath: "../outside.yaml"})).rejects.toThrow("Invalid")
    expect(a.writes.filter(write => write.field === "input")).toHaveLength(0)
    const receipt = await leader.client.call<ProfileIntentReceipt>("energy", PROFILE_INTENT_METHOD, request)
    expect(receipt.operation).toBe("profile.reconfigure")
    expect(a.writes.filter(write => write.field === "input")).toHaveLength(1)
    expect(a.writes.find(write => write.field === "input")).toMatchObject({field: "input", value: "profile.reconfigure:" + JSON.stringify({id: request.id, templatePath: request.templatePath})})
    await expect(leader.client.call("energy", PROFILE_INTENT_METHOD, request)).resolves.toEqual(receipt)
    expect(a.writes.filter(write => write.field === "input")).toHaveLength(1)
    expect(owner.kind).toBe("atom")
  } finally {await leader.close(); await a.close(); await p.a.close(); await p.b.close()}
}, 15_000)
