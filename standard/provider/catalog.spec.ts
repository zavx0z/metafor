import {expect, test} from "bun:test"
import {GRAPH_SCHEMA, parseMetaAddress, validateGraph, type Graph, type RuntimeAtom} from "@metafor/types/metafor/graph"
import {PROVIDER_DESCRIPTOR_SCHEMA, type ProviderCatalogEntry, type ProviderPeerObservation} from "@metafor/types/metafor/providers"
import {createProviderRegistry, parseProviderDescriptor, parseProviderRegistry, reconcileProviderRegistry, resolveProviderBinding, scanProviderGraph} from "./catalog"
import discoverProviders, {bootstrap} from "./discover"
import {evaluateMetaSource} from "../../quantum/dark/load"

const ROOT = parseMetaAddress("capsule")!
const CAPSULE = parseMetaAddress("capsule")!
const RUNTIME = parseMetaAddress("@capsule/runtime")!
const STUDIO = parseMetaAddress("chrome-studio")!
const publicBinding = {id: "browser-main", service: "chatgpt", host: "mac", remotePeerId: "native-browser", executorId: "chatgpt", assignmentId: "mac-chatgpt"}
const capabilities = {modelTurn: true, browserPreview: true, browserControl: false}
const descriptor = () => ({schema: PROVIDER_DESCRIPTOR_SCHEMA, version: 1 as const, bindings: [{...publicBinding, capabilities}]})
const seed = (): ProviderCatalogEntry => ({...publicBinding, source: {kind: "native-bootstrap", assignmentId: "mac-chatgpt", remoteGraph: "unknown"},
  resolution: "exact", connection: "connected", capabilities, checks: {status: "passed", checkedAt: 1000, message: "Explicit host check"}})

function graph() {
  const child: RuntimeAtom = {kind: "atom", ref: "atom:3", meta: RUNTIME, declaration: "#/template/capsule/matter/0", state: "running", values: {providerCapabilities: JSON.stringify(descriptor())}, mass: []}
  const owner: RuntimeAtom = {kind: "atom", ref: "atom:2", meta: CAPSULE, declaration: "#/template/capsule", state: "running", values: {status: "running", providerCapabilities: JSON.stringify(descriptor())}, mass: [], children: [child]}
  const result: Graph = {schema: GRAPH_SCHEMA, root: ROOT, template: {
    [CAPSULE]: {name: "Capsule", fields: [{key: "providerCapabilities", type: "string"}, {key: "status", type: "string"}], superposition: [{name: "running", transitions: null}], processes: [], mass: [], matter: [{kind: "wimp", src: RUNTIME}]},
    [RUNTIME]: {name: "Runtime", fields: [{key: "providerCapabilities", type: "string"}], superposition: [{name: "running", transitions: null}], processes: [], mass: []},
  }, runtime: {roots: [owner], reactions: []}}
  return {result, owner, child}
}

test("exact browser owner Atom is discovered once; child runtime and running state grant no connection", () => {
  const f = graph()
  const snapshot = scanProviderGraph(f.result)
  expect(snapshot.observations).toHaveLength(1)
  expect(snapshot.observations[0]).toMatchObject({source: {ref: "atom:2", meta: "capsule"}, state: "running", status: "running", resolution: "exact"})
  expect(snapshot.entries).toHaveLength(1)
  expect(snapshot.entries[0]).toMatchObject({resolution: "exact", connection: "unknown", checks: {status: "unknown"}})
  expect(() => resolveProviderBinding(reconcileProviderRegistry({registry: createProviderRegistry(), graph: f.result, now: 1000}), publicBinding.id)).toThrow("unknown")
})

test("Chrome Studio is exact identity; a missing or malformed descriptor stays explicit unknown", () => {
  const f = graph()
  f.result.template[STUDIO] = {...f.result.template[CAPSULE]!, name: "Studio"}
  f.owner.meta = STUDIO
  f.owner.declaration = "#/template/chrome-studio"
  f.owner.values.providerCapabilities = "{}"
  const invalid = scanProviderGraph(f.result)
  expect(invalid.entries).toEqual([])
  expect(invalid.observations[0]).toMatchObject({source: {meta: "chrome-studio"}, resolution: "unknown"})
  delete f.owner.values.providerCapabilities
  expect(scanProviderGraph(f.result).observations[0]?.issues).toHaveLength(1)
})

test("verified native bootstrap stays canonical with unknown remote Graph and does not create a phantom Atom", () => {
  const registry = reconcileProviderRegistry({registry: createProviderRegistry([seed()]), graph: graph().result, now: 1100})
  expect(registry.entries).toHaveLength(1)
  expect(registry.entries[0]?.source).toEqual(seed().source)
  expect(registry.discovery.admittedPeers).toBe("unknown")
  expect(resolveProviderBinding(registry, publicBinding.id)).toEqual(publicBinding)
  expect(registry.observations.map(item => item.source.ref)).toEqual(["atom:2"])
  const nativeOnly = reconcileProviderRegistry({registry: createProviderRegistry([seed()]), now: 1100})
  expect(nativeOnly.observations).toEqual([])
  expect(nativeOnly.discovery.localGraph).toBe("unknown")
})

test("stale checks and disconnected admitted peers stop model resolution without deleting settings", () => {
  const registry = createProviderRegistry([seed()])
  registry.settings.selectedId = publicBinding.id
  const stale = reconcileProviderRegistry({registry, now: 70_000})
  expect(stale.entries[0]?.connection).toBe("stale")
  expect(stale.settings.selectedId).toBe(publicBinding.id)
  expect(() => resolveProviderBinding(stale, publicBinding.id)).toThrow("stale")
  const peer: ProviderPeerObservation = {peerId: publicBinding.remotePeerId, connection: "connected", universeRoot: null, descriptor: descriptor(), checkedAt: 1000}
  const connected = reconcileProviderRegistry({registry: createProviderRegistry(), peers: [peer], now: 1000})
  expect(connected.entries[0]?.source).toMatchObject({kind: "peer", universeRoot: null})
  expect(connected.discovery.remoteGraphs).toEqual([{peerId: publicBinding.remotePeerId, root: null, resolution: "unknown"}])
  const disconnected = reconcileProviderRegistry({registry: connected, peers: [], now: 1100})
  expect(disconnected.entries[0]?.connection).toBe("disconnected")
  expect(() => resolveProviderBinding(disconnected, publicBinding.id)).toThrow()
})

test("remote Graph discovery uses admitted world identity and never accepts another peer's descriptor", () => {
  const validation = validateGraph(graph().result)
  if (!validation.ok) throw new Error(JSON.stringify(validation.issues))
  const peer: ProviderPeerObservation = {peerId: "native-browser", connection: "connected", universeRoot: ROOT, descriptor: null, checkedAt: 1000}
  const registry = reconcileProviderRegistry({registry: createProviderRegistry(), peers: [peer], remoteGraphs: [{peerId: "native-browser", graph: graph().result}], now: 1000})
  expect(registry.entries[0]?.source).toMatchObject({kind: "atom", root: ROOT, peerId: "native-browser"})
  expect(registry.discovery.remoteGraphs[0]?.resolution).toBe("exact")
  expect(() => reconcileProviderRegistry({registry, remoteGraphs: [{peerId: "not-admitted", graph: graph().result}], now: 1100})).toThrow("exact admitted")
  const changed = reconcileProviderRegistry({registry: reconcileProviderRegistry({registry: createProviderRegistry(), peers: [{...peer, descriptor: descriptor()}], now: 1000}), peers: [{...peer, peerId: "other", descriptor: descriptor()}], now: 1100})
  expect(changed.entries[0]?.resolution).toBe("unknown")
})

test("malformed registry and arbitrary descriptor operations are refused without replacing Mass", () => {
  expect(() => parseProviderRegistry({entries: [seed()]})).toThrow("registry Mass")
  expect(() => parseProviderDescriptor({...descriptor(), shell: "run"})).toThrow("descriptor")
  expect(() => parseProviderDescriptor({...descriptor(), bindings: [{...publicBinding, capabilities: {...capabilities, browserControl: true, browserPreview: false}}]})).toThrow()
  const registry = createProviderRegistry([seed()])
  expect(() => parseProviderRegistry({...registry, entries: [seed(), seed()]})).toThrow()
  registry.entries[0]!.checks.status = "failed"
  expect(() => resolveProviderBinding(registry, publicBinding.id)).toThrow()
})

test("lost Graph and peer observations retain identity but never preserve current capability readiness", () => {
  const discovered = reconcileProviderRegistry({registry: createProviderRegistry(), graph: graph().result, now: 1000})
  discovered.entries[0]!.connection = "connected"
  discovered.entries[0]!.checks = {status: "unknown", checkedAt: 1000, message: "Finite admission confirmed"}
  const lostGraph = reconcileProviderRegistry({registry: discovered, now: 1100})
  expect(lostGraph.entries[0]).toMatchObject({resolution: "unknown", connection: "unknown"})
  const first: ProviderPeerObservation = {peerId: "workspace-peer", connection: "connected", universeRoot: ROOT, descriptor: descriptor(), checkedAt: 1000,
    worldIdentity: {peerId: "workspace-peer", root: ROOT, cutId: "original-cut"}, atomBindings: [], observation: "current"}
  const admitted = reconcileProviderRegistry({registry: createProviderRegistry(), peers: [first], now: 1000})
  const lostObservation: ProviderPeerObservation = {...first, connection: "unknown", descriptor: null, checkedAt: 1100}
  delete lostObservation.worldIdentity
  const lost = reconcileProviderRegistry({registry: admitted, peers: [lostObservation], now: 1100})
  expect(lost.members[0]?.worldIdentity?.cutId).toBe("original-cut")
  const changed = reconcileProviderRegistry({registry: lost, peers: [{...first, worldIdentity: {...first.worldIdentity!, cutId: "new-cut"}, checkedAt: 1200}], now: 1200})
  expect(changed.members[0]).toMatchObject({worldIdentity: {cutId: "original-cut"}, connection: "unknown", observation: "gap"})
})

test("autonomous discovery initializes own Mass once, retains seed and replays identity without an observation", async () => {
  let bytes = ""
  const writes: unknown[] = []
  const mass = {registry: {async readText() {return bytes}, async write(value: unknown) {writes.push(structuredClone(value)); bytes = JSON.stringify(value)}}}
  let checks = 0
  const first = await discoverProviders({request: '{"id":"bootstrap"}', bootstrap: JSON.stringify([seed()]), mass, signal: new AbortController().signal, now: () => 1100, self: {atom: "7"},
    check: async () => {checks++; return {connection: "connected", checks: {status: "unknown", checkedAt: 1100, message: "Fixture admission only"}}}})
  expect(first).toMatchObject({discoveryAck: true, discoveryAckId: "bootstrap", discoveryError: null, discoveryStatus: "partial"})
  expect(parseProviderRegistry(JSON.parse(bytes)).entries).toMatchObject([{source: seed().source, connection: "connected", checks: {status: "unknown", checkedAt: 1100}}])
  expect(first).toMatchObject({discoveryRequest: null, providerRef: "atom:7"})
  const replay = await discoverProviders({request: '{"id":"bootstrap"}', bootstrap: "invalid new seed", mass, signal: new AbortController().signal, now: () => 2000})
  expect(replay.discoveryResponse).toBe(first.discoveryResponse)
  expect(writes).toHaveLength(1)
  expect(checks).toBe(1)
  const malformed = await discoverProviders({request: '{"id":"another"}', mass: {registry: {async readText() {return "bad bytes"}, async write() {throw new Error("must not overwrite")}}}, signal: new AbortController().signal})
  expect(malformed.discoveryError).not.toBeNull()
})

test("executor Provider observes the shared owner registry without seeding, checking, discovery or writing", async () => {
  const registry = createProviderRegistry([seed()])
  const result = await discoverProviders({request: '{"id":"executor-bootstrap"}', registryMode: "executor", bootstrap: "invalid-must-not-read", self: {atom: "8"},
    mass: {registry: {async readText() {return JSON.stringify(registry)}, async write() {throw new Error("Executor must never write shared registry")}}},
    signal: new AbortController().signal, check: async () => {throw new Error("Executor must never check native resources")}})
  expect(result).toMatchObject({discoveryAck: true, discoveryRequest: null, providerRef: "atom:8", discoveryError: null, registryRevision: 0})
  expect(registry.entries).toEqual([seed()])
})

test("late root bootstrap seeds an empty discovered registry once and schedules a finite admission check", async () => {
  let bytes = ""
  let writes = 0
  let checks = 0
  const mass = {registry: {async readText() {return bytes}, async write(value: unknown) {writes++; bytes = JSON.stringify(value)}}}
  const signal = new AbortController().signal
  await discoverProviders({request: '{"id":"bootstrap"}', mass, signal})
  expect(parseProviderRegistry(JSON.parse(bytes)).entries).toEqual([])
  const applied = await bootstrap({bootstrap: JSON.stringify([seed()]), mass, signal, self: {atom: "7"}})
  expect(applied).toMatchObject({bootstrapApplied: true, bootstrapError: null, discoveryAck: false, discoveryRequest: '{"id":"bootstrap-native"}', providerRef: "atom:7"})
  const checked = await discoverProviders({request: applied.discoveryRequest, mass, signal, check: async () => {
    checks++
    return {connection: "connected", checks: {status: "unknown", checkedAt: 1100, message: "Fixture admission only"}}
  }})
  expect(checked.discoveryError).toBeNull()
  expect(checks).toBe(1)
  const count = writes
  expect((await bootstrap({bootstrap: "invalid replacement", mass, signal})).bootstrapApplied).toBe(true)
  expect(writes).toBe(count)
  expect(parseProviderRegistry(JSON.parse(bytes)).entries[0]?.id).toBe(publicBinding.id)
})

test("late bootstrap refuses established catalog and executor bootstrap performs no registry access", async () => {
  const signal = new AbortController().signal
  const conflict = await bootstrap({bootstrap: JSON.stringify([seed()]), signal, mass: {registry: {
    async readText() {return JSON.stringify(createProviderRegistry([seed()]))}, async write() {throw new Error("must not replace established registry")},
  }}})
  expect(conflict.bootstrapApplied).toBe(false)
  expect(conflict.bootstrapError).toContain("established registry")
  const executor = await bootstrap({registryMode: "executor", bootstrap: "invalid", signal, mass: {registry: {
    async readText() {throw new Error("must not read bootstrap")}, async write() {throw new Error("must not write bootstrap")},
  }}})
  expect(executor).toMatchObject({bootstrapApplied: true, bootstrapError: null, discoveryRequest: null})
})

test("explicit native Codex registration appends after one host admission check and replays without another native call", async () => {
  const binding = {id: "legacy-codex", service: "codex", host: "native", remotePeerId: "native", executorId: "codex"}
  const original = createProviderRegistry([seed()])
  original.settings.selectedId = seed().id
  let bytes = JSON.stringify(original), checks = 0, writes = 0
  const mass = {registry: {async readText() {return bytes}, async write(value: unknown) {writes++; bytes = JSON.stringify(value)}}}
  const request = JSON.stringify({id: "register-local-codex", register: binding})
  const check = async (actual: typeof binding) => {checks++; expect(actual).toEqual(binding); return {connection: "connected" as const, checks: {status: "unknown" as const, checkedAt: 1200, message: "Native ACP initialized; no session or prompt"}}}
  const result = await discoverProviders({request, mass, signal: new AbortController().signal, check})
  expect(result.discoveryError).toBeNull()
  const registered = parseProviderRegistry(JSON.parse(bytes))
  expect(registered.entries).toHaveLength(2)
  expect(registered.entries[0]).toEqual(original.entries[0])
  expect(registered.settings).toEqual(original.settings)
  expect(registered.entries[1]).toMatchObject({...binding, capabilities: {modelTurn: true, browserPreview: false, browserControl: false}, connection: "connected", checks: {status: "unknown", checkedAt: 1200}, source: {kind: "native-bootstrap", assignmentId: "legacy-codex", remoteGraph: "unknown"}})
  expect(registered.requests).toEqual([{id: "register-local-codex", revision: 1, register: binding}])
  expect((await discoverProviders({request, mass, signal: new AbortController().signal, check})).discoveryResponse).toBe(result.discoveryResponse)
  expect(checks).toBe(1); expect(writes).toBe(1)
  for (const changed of [{id: "register-local-codex"}, {id: "register-local-codex", register: {...binding, executorId: "foreign"}}, {id: "different-request", register: {...binding, executorId: "foreign"}}]) {
    expect((await discoverProviders({request: JSON.stringify(changed), mass, signal: new AbortController().signal, check})).discoveryError).toContain("conflicts")
  }
  expect(checks).toBe(1); expect(writes).toBe(1)
})

test("native registration refuses missing host assignment, checked-entry injection, executor writes and legacy request conflicts", async () => {
  const binding = {id: "legacy-codex", service: "codex", host: "native", remotePeerId: "native", executorId: "codex"}
  const original = createProviderRegistry([seed()]); original.revision = 1; original.requests.push({id: "old-discovery", revision: 1})
  const bytes = JSON.stringify(original)
  let writes = 0, checks = 0
  const mass = {registry: {async readText() {return bytes}, async write() {writes++}}}
  const check = async () => {checks++; throw new Error("Host has not assigned native Codex")}
  const failed = await discoverProviders({request: JSON.stringify({id: "register-failed", register: binding}), mass, signal: new AbortController().signal, check})
  expect(failed.discoveryError).toContain("not assigned")
  for (const request of [{id: "inject", register: {...binding, capabilities}}, {id: "old-discovery", register: binding}]) {
    expect((await discoverProviders({request: JSON.stringify(request), mass, signal: new AbortController().signal, check})).discoveryError).not.toBeNull()
  }
  expect((await discoverProviders({request: JSON.stringify({id: "executor-register", register: binding}), registryMode: "executor", mass, signal: new AbortController().signal, check})).discoveryError).toContain("Executor")
  expect(writes).toBe(0); expect(checks).toBe(1)
  expect(parseProviderRegistry(JSON.parse(bytes))).toEqual(original)
  expect((await discoverProviders({request: '{"id":"old-discovery"}', mass, signal: new AbortController().signal, check})).discoveryError).toBeNull()
})

test("explicit browser registration retains preview without model admission and preserves registry identities", async () => {
  const binding={id:"codespace-chatgpt",service:"chatgpt",host:"codespace",remotePeerId:"provider-codespace",executorId:"chatgpt"}
  const original=createProviderRegistry([seed()]);original.settings.selectedId=seed().id
  let bytes=JSON.stringify(original),writes=0,checks=0
  const mass={registry:{async readText(){return bytes},async write(value:unknown){writes++;bytes=JSON.stringify(value)}}}
  const registrationCheck=async(actual:typeof binding)=>{checks++;expect(actual).toEqual(binding);return {connection:"connected" as const,capabilities:{modelTurn:false,browserPreview:true,browserControl:true},checks:{status:"unknown" as const,checkedAt:1300,message:"Preview described; no login/model proof"}}}
  const request=JSON.stringify({id:"register-codespace-chatgpt",register:binding})
  const first=await discoverProviders({request,mass,signal:new AbortController().signal,registrationCheck})
  expect(first.discoveryError).toBeNull()
  const registry=parseProviderRegistry(JSON.parse(bytes))
  expect(registry.entries[0]).toEqual(original.entries[0]);expect(registry.settings).toEqual(original.settings)
  expect(registry.entries[1]).toMatchObject({...binding,capabilities:{modelTurn:false,browserPreview:true,browserControl:true},checks:{status:"unknown"}})
  expect(()=>resolveProviderBinding(registry,binding.id)).toThrow("not model-capable")
  expect((await discoverProviders({request,mass,signal:new AbortController().signal,registrationCheck})).discoveryResponse).toBe(first.discoveryResponse)
  for(const changed of [{id:"register-codespace-chatgpt",register:{...binding,executorId:"foreign"}},{id:"new-request",register:{...binding,remotePeerId:"foreign"}}])expect((await discoverProviders({request:JSON.stringify(changed),mass,signal:new AbortController().signal,registrationCheck})).discoveryError).toContain("conflicts")
  expect(checks).toBe(1);expect(writes).toBe(1)
  const refresh=await discoverProviders({request:'{"id":"refresh-preview-only"}',mass,signal:new AbortController().signal,
    check:async()=>({connection:"connected" as const,checks:{status:"unknown" as const,checkedAt:1400,message:"Native model admission"}}),
    registrationCheck:async actual=>{if(actual.id===binding.id){checks++;expect(actual).toEqual(binding)}return {connection:"connected" as const,capabilities:{modelTurn:true,browserPreview:true,browserControl:true},checks:{status:"unknown" as const,checkedAt:1400,message:"Browser described; lazy ACP admission, no login/model proof"}}},now:()=>1400})
  expect(refresh.discoveryError).toBeNull()
  expect(parseProviderRegistry(JSON.parse(bytes)).entries.find(entry=>entry.id===binding.id)).toMatchObject({capabilities:{modelTurn:true,browserPreview:true,browserControl:true},checks:{status:"unknown"}})
  expect(checks).toBe(2);expect(writes).toBe(2)
})

test("compiled Provider Meta separates autonomous discovery and explicit model turns with exact write sets", async () => {
  const sourcePath = `${import.meta.dir}/meta.ts`
  const meta = await evaluateMetaSource(await Bun.file(sourcePath).text(), {sourcePath})
  expect(meta.mass?.map(item => item.key)).toEqual(["registry", "turns"])
  const discovery = meta.processes?.find(item => item.key === "discovering")?.declaration
  const turn = meta.processes?.find(item => item.key === "turning")?.declaration
  if (discovery?.type !== "action" || turn?.type !== "action") throw new Error("Expected Provider actions")
  expect(discovery.action.src).toBe("./discover.ts")
  expect(discovery.success?.write).toContain("registryRevision")
  expect(turn.action.src).toBe("./turn.ts")
  expect(turn.success?.write).toContain("bindingDescriptor")
  expect(turn.success?.write).toContain("providerRef")
})
