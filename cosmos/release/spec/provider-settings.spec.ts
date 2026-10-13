import {expect, test} from "bun:test"
import {createAgentUiBridge} from "../server/agents"
import {agentWorkspaceGraph} from "./agent-graph-fixture"
import {createProviderRegistry} from "@metafor/types/metafor/provider-validation"
import {parseMetaAddress, type RuntimeAtom} from "@metafor/types/metafor/graph"
import {DARK_FORCE_HISTORY_READ_METHOD, ENERGY_MASS_RESULT_READ_METHOD, META_FIELD_VALUE_APPLY_METHOD} from "shared/protocol/metafor/observation"

const origin = "http://127.0.0.1:4444", host = {requestIP: () => ({address: "127.0.0.1"})}
function fixture() {
  const graph = agentWorkspaceGraph(), root = graph.root
  const actor = graph.runtime.roots[0]!.children![0] as RuntimeAtom
  const chat = actor.children![0] as RuntimeAtom
  const owner = graph.runtime.roots[0]!.children![1] as RuntimeAtom
  const binding = {id: "codespace-chatgpt", service: "chatgpt", host: "codespace", remotePeerId: "peer", executorId: "browser"}
  actor.state = "done"
  actor.values.providerBinding = binding.id
  owner.meta = parseMetaAddress("@metafor/provider")!
  owner.values = {registryMode: "owner"}
  const registryMass = {key: "registry", format: "json", ref: "mass:registry", label: null, description: null, content: "lazy"} as const
  owner.mass = [registryMass]
  const executor: RuntimeAtom = {kind: "atom", ref: "atom:5", meta: owner.meta, declaration: "#/template/fixture", state: "ready", mass: [registryMass], values: {registryMode: "executor", ack: true, request: null}}
  chat.children = [executor]
  const registry = createProviderRegistry([{...binding, source: {kind: "native-bootstrap", assignmentId: binding.id, remoteGraph: "unknown"}, resolution: "exact", connection: "connected", capabilities: {modelTurn: true, browserPreview: true, browserControl: true}, checks: {status: "unknown", checkedAt: 1, message: null}}])
  const ledger = {sessionId: "browser-native", binding, requests: [{request: {operation: "settings"}, result: {outcome: "completed", response: JSON.stringify({model: "stale-cache"})}}]}
  const session = {sessionId: "browser-native", binding}
  const writes: Array<{field: string; value: unknown}> = []
  let model = "live-a", reads = 0
  const bridge = createAgentUiBridge({peer: {async call<T>(_to: string, method: string, params: any): Promise<T> {
    if (method === "readGraph") return structuredClone(graph) as T
    if (method === DARK_FORCE_HISTORY_READ_METHOD) return {frontier: {cutId: "cut", throughSequence: 1, retroactiveComplete: false}} as T
    if (method === ENERGY_MASS_RESULT_READ_METHOD) {
      const value = params.key === "registry" ? registry : params.key === "turns" ? ledger : session
      return {atom: params.atom, key: params.key, resolution: "exact", bytes: 100, content: {format: "json", present: true, value: structuredClone(value)}} as T
    }
    if (method === META_FIELD_VALUE_APPLY_METHOD) {
      expect(params.atom).toEqual({root, ref: executor.ref, meta: executor.meta})
      expect(["request", "ack"]).toContain(params.field)
      writes.push({field: params.field, value: params.value})
      executor.values[params.field] = params.value
      if (executor.values.request && executor.values.ack === false) {
        const request = JSON.parse(String(executor.values.request))
        expect(request.operation).toBe("settings")
        expect(request.prompt).toBe("")
        expect(request.sessionId).toBe("browser-native")
        expect(request.expectedBinding).toEqual(binding)
        if (request.selection.model) model = request.selection.model
        reads++
        Object.assign(executor.values, {ack: true, ackId: request.id, error: null, outcome: "completed", response: JSON.stringify({model, reasoning: null, models: [{id: model, label: model}], reasoningLevels: []})})
      }
      return {} as T
    }
    throw new Error(`Unexpected ${method}`)
  }}})
  const request = (selection: object = {}) => new Request(`${origin}/agents/settings`, {method: "POST", headers: {Origin: origin, "Content-Type": "application/json"}, body: JSON.stringify({agentRef: actor.ref, selection})})
  return {bridge, request, ledger, session, registry, writes, reads: () => reads, setModel(value: string) {model = value}}
}

test("browser settings HTTP admits only owned existing session and reads fresh Provider settings instead of a retained catalog receipt", async () => {
  const f = fixture()
  try {
    const first = await f.bridge.fetch(f.request(), host)
    expect(first.status).toBe(200)
    expect(await first.json()).toMatchObject({settings: {model: "live-a"}})
    f.setModel("live-b")
    expect(await (await f.bridge.fetch(f.request(), host)).json()).toMatchObject({settings: {model: "live-b"}})
    expect(await (await f.bridge.fetch(f.request({model: "live-c"}), host)).json()).toMatchObject({settings: {model: "live-c"}})
    expect(f.reads()).toBe(3)
    expect(f.writes.filter(row => row.field === "request")).toHaveLength(3)
    expect(f.writes.every(row => row.field !== "task" && !String(row.value).includes("session/new"))).toBe(true)
  } finally {f.bridge.close()}
})

test("browser settings refuse missing or changed session, retained binding and disconnected assignment before Process admission", async () => {
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => {f.ledger.sessionId = ""},
    (f: ReturnType<typeof fixture>) => {f.session.sessionId = "another-native"},
    (f: ReturnType<typeof fixture>) => {f.ledger.binding = {...f.ledger.binding, executorId: "another"}},
    (f: ReturnType<typeof fixture>) => {f.registry.entries[0]!.connection = "disconnected"},
  ]) {
    const f = fixture()
    try {mutate(f); expect((await f.bridge.fetch(f.request(), host)).status).toBe(409); expect(f.writes).toEqual([]); expect(f.reads()).toBe(0)} finally {f.bridge.close()}
  }
})
