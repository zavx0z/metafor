import {OracleRpcRemoteError} from "shared/transport/oracle"
import {expect, test} from "bun:test"
import {parseMetaAddress, type Graph, type RuntimeAtom} from "@metafor/types/metafor/graph"
import {createProviderRegistry, parseProviderRegistry} from "@metafor/types/metafor/provider-validation"
import {PROVIDER_META, type ProviderDiscoveryRequest} from "@metafor/types/metafor/providers"
import {DARK_FORCE_HISTORY_READ_METHOD, ENERGY_MASS_RESULT_READ_METHOD, META_FIELD_VALUE_APPLY_METHOD} from "shared/protocol/metafor/observation"
import {createAgentUiBridge} from "../server/agents"
import discover from "../../../standard/provider/discover"
import {agentWorkspaceGraph} from "./agent-graph-fixture"

const origin = "http://127.0.0.1:4444", host = {requestIP: () => ({address: "127.0.0.1"})}
function fixture() {
  const graph: Graph = agentWorkspaceGraph()
  const owner = graph.runtime.roots[0]!.children![1] as RuntimeAtom
  owner.meta = parseMetaAddress(PROVIDER_META)!
  owner.state = "ready"
  owner.values = {registryMode: "owner", discoveryRequest: null}
  owner.mass = [{key: "registry", ref: "mass:1" as never, format: "json", size: 0} as never]
  graph.template[owner.meta] = {name: "Provider", fields: [{key: "discoveryRequest", type: "string"}], superposition: [], processes: [], mass: [{key: "registry", format: "json"}] as never}
  let bytes = JSON.stringify(createProviderRegistry()), writes = 0, applied = 0, check = 0
  const attempts: Array<{value: string; expectedFrontier: unknown}> = []
  const failures: Array<{error: unknown; afterEffect?: boolean; mutate?: () => void}> = []
  let gate: Promise<void> | undefined
  const frontier = {cutId: "cut", throughSequence: 1, retroactiveComplete: false}
  const bridge = createAgentUiBridge({peer: {async call<T>(_to: string, method: string, input: any): Promise<T> {
    if (method === "readGraph") return structuredClone(graph) as T
    if (method === DARK_FORCE_HISTORY_READ_METHOD) return {frontier: structuredClone(frontier)} as T
    if (method === ENERGY_MASS_RESULT_READ_METHOD) return {atom: {root: graph.root, ref: owner.ref, meta: owner.meta}, key: "registry", resolution: "exact", bytes: bytes.length,
      content: {format: "json", present: true, value: JSON.parse(bytes)}} as T
    if (method === META_FIELD_VALUE_APPLY_METHOD) {
      expect(input.atom).toEqual({root: graph.root, ref: owner.ref, meta: PROVIDER_META})
      expect(input.field).toBe("discoveryRequest")
      expect(input.expectedFrontier).toEqual(frontier)
      attempts.push({value: input.value, expectedFrontier: structuredClone(input.expectedFrontier)})
      const failure = failures.shift()
      if (failure && !failure.afterEffect) {failure.mutate?.(); throw failure.error}
      applied++
      const request = JSON.parse(input.value) as ProviderDiscoveryRequest
      await gate
      const result = await discover({request: JSON.stringify(request), signal: new AbortController().signal,
        mass: {registry: {async readText() {return bytes}, async write(value) {writes++; bytes = JSON.stringify(value)}}},
        resolveConnection: async () => ({id: "native", service: "codex", host: "server", remotePeerId: "peer", executorId: "codex"}),
        registrationCheck: async () => {check++; return {connection: "connected", capabilities: {modelTurn: true, browserPreview: false, browserControl: false}, checks: {status: "unknown", checkedAt: 1, message: "No prompt"}}}})
      Object.assign(owner.values, result)
      if (failure) {failure.mutate?.(); throw failure.error}
      return {} as T
    }
    throw new Error(`Unexpected ${method}`)
  }}})
  const request = (value: object, source = origin) => new Request(`${origin}/agents/connections`, {method: "POST", headers: {Origin: source, "Content-Type": "application/json"}, body: JSON.stringify(value)})
  const configure = {schemaVersion: 1, revision: 0, connections: [{id: "connection", provider: "codex", label: "Codex", enabled: true, peer: {peerId: "peer", executorId: "codex"}}], general: {}, types: {}}
  return {bridge, graph, owner, request, configure, attempts, frontier,
    fail(error: unknown, options: {afterEffect?: boolean; mutate?: () => void} = {}) {failures.push({error, ...options})},
    changeConfiguration() {
      const registry = parseProviderRegistry(JSON.parse(bytes))
      registry.revision++
      registry.settings = {selectedId: null, configuration: {...configure, schemaVersion: 1, revision: (registry.settings.configuration?.revision ?? 0) + 1, connections: []}, connectionBindings: {}, connectionChecks: {}}
      bytes = JSON.stringify(registry)
    }, read: () => parseProviderRegistry(JSON.parse(bytes)), counts: () => ({writes, applied, check}), hold(value: Promise<void>) {gate = value}}
}

test("connection HTTP writes only the owner's ordinary discovery Field, returns committed Mass and checks separately without model turns", async () => {
  const f = fixture()
  try {
    const response = await f.bridge.fetch(f.request({providerRef: f.owner.ref, configure: f.configure}), host)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ref: f.owner.ref, registry: {settings: {configuration: {...f.configure, revision: 1}}}})
    expect(f.counts()).toEqual({applied: 1, writes: 1, check: 0})
    const checked = await f.bridge.fetch(f.request({providerRef: f.owner.ref, check: "connection"}), host)
    expect(checked.status).toBe(200)
    expect(await checked.json()).toMatchObject({registry: {settings: {configuration: {revision: 1}, connectionBindings: {connection: "native"}}}})
    expect(f.counts()).toEqual({applied: 2, writes: 2, check: 1})
  } finally {f.bridge.close()}
})

test("connection HTTP rejects stale configuration, non-owner scopes, unknown keys, wrong origin and concurrent duplicate saves", async () => {
  const f = fixture()
  try {
    for (const value of [{providerRef: f.owner.ref, configure: {...f.configure, token: "private"}}, {providerRef: f.owner.ref, configure: f.configure, check: "connection"}, {providerRef: f.owner.ref, check: 1}]) {
      expect((await f.bridge.fetch(f.request(value), host)).status).toBe(400)
    }
    expect((await f.bridge.fetch(f.request({providerRef: f.owner.ref, configure: f.configure}, "https://outsider.example"), host)).status).toBe(403)
    expect((await f.bridge.fetch(f.request({providerRef: "atom:1", configure: f.configure}), host)).status).toBe(409)
    const gate = Promise.withResolvers<void>()
    f.hold(gate.promise)
    const first = f.bridge.fetch(f.request({providerRef: f.owner.ref, configure: f.configure}), host)
    await Bun.sleep(0)
    expect((await f.bridge.fetch(f.request({providerRef: f.owner.ref, configure: f.configure}), host)).status).toBe(409)
    gate.resolve()
    expect((await first).status).toBe(200)
    expect((await f.bridge.fetch(f.request({providerRef: f.owner.ref, configure: f.configure}), host)).status).toBe(409)
    expect(f.counts().applied).toBe(1)
  } finally {f.bridge.close()}
})


const mismatch = () => new OracleRpcRemoteError("admission_refused", "The frontier changed before admission", {schema: "metafor/field-admission-refusal/v1", contractVersion: 1, reason: "frontier_mismatch"})

test("typed frontier refusal retries the same intent identity once at a fresh frontier and commits only one effect", async () => {
  const f = fixture()
  try {
    f.fail(mismatch(), {mutate() {f.frontier.throughSequence++}})
    expect((await f.bridge.fetch(f.request({providerRef: f.owner.ref, configure: f.configure}), host)).status).toBe(200)
    expect(f.attempts).toHaveLength(2)
    expect(f.attempts[1]!.value).toBe(f.attempts[0]!.value)
    expect(f.attempts.map(row => row.expectedFrontier)).toEqual([
      {cutId: "cut", throughSequence: 1, retroactiveComplete: false}, {cutId: "cut", throughSequence: 2, retroactiveComplete: false},
    ])
    expect(f.counts()).toEqual({writes: 1, applied: 1, check: 0})
  } finally {f.bridge.close()}
})

test("unknown admission outcome is never resent, including after an actual committed effect", async () => {
  for (const afterEffect of [false, true]) {
    const f = fixture()
    try {
      f.fail(new Error("Transport outcome is unknown"), {afterEffect})
      expect((await f.bridge.fetch(f.request({providerRef: f.owner.ref, configure: f.configure}), host)).status).toBe(409)
      expect(f.attempts).toHaveLength(1)
      expect(f.counts()).toEqual({writes: afterEffect ? 1 : 0, applied: afterEffect ? 1 : 0, check: 0})
    } finally {f.bridge.close()}
  }
})

test("typed refusal cannot retry into a different owner, Mass identity, busy state or configuration revision", async () => {
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => {f.owner.values.registryMode = "executor"},
    (f: ReturnType<typeof fixture>) => {f.graph.root = parseMetaAddress("@changed/world")!},
    (f: ReturnType<typeof fixture>) => {f.owner.mass[0]!.ref = "mass:changed" as never},
    (f: ReturnType<typeof fixture>) => {f.owner.values.discoveryRequest = '{"id":"another-request"}'},
    (f: ReturnType<typeof fixture>) => {f.changeConfiguration()},
  ]) {
    const f = fixture()
    try {
      f.fail(mismatch(), {mutate() {mutate(f)}})
      expect((await f.bridge.fetch(f.request({providerRef: f.owner.ref, configure: f.configure}), host)).status).toBe(409)
      expect(f.attempts).toHaveLength(1)
      expect(f.counts().applied).toBe(0)
    } finally {f.bridge.close()}
  }
})

test("admission retries stop after four sends and other typed failures never authorize replay", async () => {
  const f = fixture()
  try {
    for (let count = 0; count < 4; count++) f.fail(mismatch())
    expect((await f.bridge.fetch(f.request({providerRef: f.owner.ref, configure: f.configure}), host)).status).toBe(409)
    expect(f.attempts).toHaveLength(4)
    expect(new Set(f.attempts.map(row => row.value)).size).toBe(1)
    expect(f.counts().applied).toBe(0)
  } finally {f.bridge.close()}
  for (const error of [
    new OracleRpcRemoteError("transport_error", "Unknown outcome", {schema: "metafor/field-admission-refusal/v1", contractVersion: 1, reason: "frontier_mismatch"}),
    new OracleRpcRemoteError("admission_refused", "Closed admission", {schema: "metafor/field-admission-refusal/v1", contractVersion: 1, reason: "admission_closed"}),
    new OracleRpcRemoteError("admission_refused", "Unverified refusal", {reason: "frontier_mismatch"}),
    Object.assign(new Error("Unverified transport exception"), {code: "admission_refused", data: {schema: "metafor/field-admission-refusal/v1", contractVersion: 1, reason: "frontier_mismatch"}}),
  ]) {
    const f = fixture()
    try {
      f.fail(error)
      expect((await f.bridge.fetch(f.request({providerRef: f.owner.ref, configure: f.configure}), host)).status).toBe(409)
      expect(f.attempts).toHaveLength(1)
    } finally {f.bridge.close()}
  }
})


test("resource check retries a proven frontier refusal once but stops if the saved configuration changes", async () => {
  for (const changeConfiguration of [false, true]) {
    const f = fixture()
    try {
      expect((await f.bridge.fetch(f.request({providerRef: f.owner.ref, configure: f.configure}), host)).status).toBe(200)
      f.fail(mismatch(), {mutate() {if (changeConfiguration) f.changeConfiguration(); else f.frontier.throughSequence++}})
      const response = await f.bridge.fetch(f.request({providerRef: f.owner.ref, check: "connection"}), host)
      expect(response.status).toBe(changeConfiguration ? 409 : 200)
      if (changeConfiguration) {
        expect(f.attempts).toHaveLength(2)
        expect(f.counts()).toEqual({applied: 1, writes: 1, check: 0})
      } else {
        expect(f.attempts).toHaveLength(3)
        expect(f.attempts[2]!.value).toBe(f.attempts[1]!.value)
        expect(f.counts()).toEqual({applied: 2, writes: 2, check: 1})
      }
    } finally {f.bridge.close()}
  }
})
