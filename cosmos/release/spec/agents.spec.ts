import {expect, test} from "bun:test"
import {GRAPH_SCHEMA, parseMetaAddress, type Graph, type RuntimeAtom} from "@metafor/types/metafor/graph"
import {AGENT_OBSERVATION_SCHEMA, READ_AGENTS_METHOD, type ReadAgentsReceipt} from "@metafor/types/metafor/agent-observation"
import {DARK_FORCE_HISTORY_READ_METHOD, ENERGY_MASS_RESULT_READ_METHOD, META_FIELD_VALUE_APPLY_METHOD, type EnergyMassResultReadReceipt, type MetaFieldValueApplyReceipt} from "shared/protocol/metafor/observation"
import {createAgentUiBridge} from "../server/agents"
import {AGENT_UI_SCHEMA, type AgentUiSnapshot, type AgentUiTaskRequest} from "../shared/agents"
import {createProviderRegistry} from "@metafor/provider/catalog"
import {PROFILE_READ_METHOD} from "@metafor/types/metafor/profile-intent"

const ROOT = parseMetaAddress("@metafor/environment")!
const AGENT = parseMetaAddress("@metafor/agent")!
const CHAT = parseMetaAddress("@metafor/chat")!
const ORIGIN = "http://127.0.0.1:4444"
const local = {requestIP: () => ({address: "127.0.0.1"})}
const task: AgentUiTaskRequest = {agentRef: "atom:2", task: {id: "conversation-1", text: "Привет", mode: "conversation"}}

function fixture(verseId?: string | null) {
  const actor: RuntimeAtom = {ref: "atom:2", kind: "atom", meta: AGENT, declaration: "#/template/@metafor~1environment/matter/0", state: "idle",
    values: {task: null, status: "idle", error: null, activeTaskId: null}, mass: []}
  const graph: Graph = {schema: GRAPH_SCHEMA, root: ROOT, template: {
    [ROOT]: {name: "Environment", fields: [], superposition: [], mass: [], processes: [], matter: [{kind: "wimp", src: AGENT}]},
    [AGENT]: {name: "Agent", fields: ["task", "status", "error", "activeTaskId"].map(key => ({key, type: "string"})), superposition: [{name: "idle", transitions: null}], mass: [], processes: []},
  }, runtime: {roots: [{kind: "atom", ref: "atom:1", meta: ROOT, declaration: "#/template/@metafor~1environment", state: null, values: {}, mass: [], children: [actor]}], reactions: []}}
  const observation: ReadAgentsReceipt = {schema: AGENT_OBSERVATION_SCHEMA, version: 1, root: ROOT, agents: [{ref: actor.ref, meta: AGENT,
    owner: {ref: "atom:1", meta: ROOT}, state: "idle", status: "idle", configuration: {resolution: "unknown", value: null, issues: []},
    chat: {ref: "atom:3", meta: CHAT, session: {ref: "mass:session", key: "session", format: "json", label: null, description: null, content: "lazy"}}, issues: []}]}
  const frontier = {cutId: "agents-fixture", throughSequence: 7, retroactiveComplete: false as const}
  const calls: Array<{target: string, method: string, params: unknown}> = []
  let gate: Promise<void> | undefined
  let massFailure = false
  let mutationFailure = false
  let admitted = true
  const registry = createProviderRegistry([{id: "chatgpt", service: "chatgpt", host: "codespace", remotePeerId: "remote", executorId: "browser",
    source: {kind: "native-bootstrap", assignmentId: "assigned", remoteGraph: "unknown"}, resolution: "exact", connection: "connected",
    capabilities: {modelTurn: true, browserPreview: true, browserControl: true}, checks: {status: "unknown", checkedAt: 1, message: null}}])
  const session: EnergyMassResultReadReceipt = {contractVersion: 1, resolution: "exact", frontier, atom: {root: ROOT, ref: "atom:3", meta: CHAT}, key: "session",
    digest: `sha256:${"a".repeat(64)}`, bytes: 32, content: {format: "json", present: true, value: {version: 1, messages: []}}}
  const receipt: MetaFieldValueApplyReceipt = {contractVersion: 1, resolution: "exact", atom: {root: ROOT, ref: actor.ref, meta: AGENT}, field: "task",
    acceptance: {cutId: frontier.cutId, sequence: 8, id: `${frontier.cutId}:8`}, frontier: {...frontier, throughSequence: 8}}
  const peer = {async call<T>(target: string, method: string, params: unknown): Promise<T> {
    calls.push({target, method, params})
    if (method === READ_AGENTS_METHOD) {await gate; return structuredClone(observation) as T}
    if (method === "readGraph") return structuredClone(graph) as T
    if (method === DARK_FORCE_HISTORY_READ_METHOD) return {frontier} as T
    if (method === ENERGY_MASS_RESULT_READ_METHOD) {
      if (massFailure) throw new Error("private host diagnostic")
      if ((params as {key: string}).key === "registry") return {...session, atom: {root: ROOT, ref: "atom:4", meta: "@metafor/provider"}, key: "registry", content: {format: "json", present: true, value: registry}} as T
      return structuredClone(session) as T
    }
    if (method === META_FIELD_VALUE_APPLY_METHOD) {
      if (mutationFailure) throw new Error("private host diagnostic")
      return structuredClone(receipt) as T
    }
    throw new Error("Unexpected operation")
  }}
  const bridge = createAgentUiBridge({peer, admitted: () => admitted, verseId})
  return {bridge, actor, graph, observation, session, calls, setGate(value: Promise<void>) {gate = value},
    enableProviders() {
      actor.values.providerBinding = null
      const provider = {ref: "atom:4", kind: "atom", meta: parseMetaAddress("@metafor/provider")!, declaration: "#/template/x", state: "ready", values: {registryMode: "owner"},
        mass: [{ref: "mass:registry", key: "registry", format: "json", label: null, description: null, content: "lazy"}]} as RuntimeAtom
      actor.children = [{ref: "atom:3", kind: "atom", meta: CHAT, declaration: "#/template/x", state: "idle", values: {}, mass: [], children: [provider]}]
      session.content = {format: "json", present: true, value: {version: 1, sessionId: null, requests: [], messages: []}}
    },
    rejectMass() {massFailure = true}, rejectMutation() {mutationFailure = true}, stopAdmission() {admitted = false}}
}

test("Provider selection before the first session is one canonical Field intention; retained history is never transferred", async () => {
  const f = fixture()
  f.enableProviders()
  const select = (value: unknown = {agentRef: "atom:2", entryId: "chatgpt"}) => new Request(`${ORIGIN}/agents/provider`, {method: "POST", headers: {Origin: ORIGIN, "Content-Type": "application/json"}, body: JSON.stringify(value)})
  try {
    const response = await f.bridge.fetch(select(), local)
    expect(response.status).toBe(202)
    expect(await response.json()).toMatchObject({schema: "cosmos:agents/provider/v1", agentRef: "atom:2", entryId: "chatgpt"})
    expect(f.calls.filter(call => call.method === META_FIELD_VALUE_APPLY_METHOD)).toHaveLength(1)
    expect(f.calls.find(call => call.method === META_FIELD_VALUE_APPLY_METHOD)?.params).toMatchObject({field: "providerBinding", value: "chatgpt", atom: {ref: "atom:2"}})
    f.session.content = {format: "json", present: true, value: {version: 1, sessionId: "retained-native", requests: [], messages: []}}
    const denied = await f.bridge.fetch(select(), local)
    expect(denied.status).toBe(409)
    expect(await denied.json()).toMatchObject({error: {code: "new_session_required"}})
    f.session.content = {format: "json", present: true, value: {version: 1, sessionId: null, requests: [{id: "not-sent"}], messages: []}}
    expect((await f.bridge.fetch(select(), local)).status).toBe(409)
    expect((await f.bridge.fetch(select({agentRef: "atom:2", entryId: "chatgpt", token: "forbidden"}), local)).status).toBe(400)
    expect(f.calls.filter(call => call.method === META_FIELD_VALUE_APPLY_METHOD)).toHaveLength(1)
  } finally {f.bridge.close()}
})

const get = () => new Request(`${ORIGIN}/agents`)
const post = (value: unknown = task, origin = ORIGIN) => new Request(`${ORIGIN}/agents`, {method: "POST", headers: {Origin: origin, "Content-Type": "application/json"}, body: JSON.stringify(value)})

test("public Graph survives an empty Agent observation and uses only an explicit host Verse address", async () => {
  const assigned = "30282dbd-cc5e-4a30-8658-1c07b37dd1af", f = fixture(assigned), unassigned = fixture()
  try {
    f.observation.agents = []
    const response = await f.bridge.fetch(get(), local)
    expect(response.status).toBe(200)
    const data = await response.json() as AgentUiSnapshot
    expect(data.graph).toEqual(f.graph)
    expect(data.graph.runtime.roots[0]?.children).toHaveLength(1)
    expect(data.agents).toEqual([])
    expect(data.verseId).toBe(assigned)
    expect(data.observedWorld).toEqual({root: ROOT, cutId: "agents-fixture"})
    expect(data.observation).toEqual({mechanism: "public-oracle-poll", photonSubscription: false})
    expect((await (await unassigned.bridge.fetch(get(), local)).json() as AgentUiSnapshot).verseId).toBeNull()
    expect(f.calls.every(call => call.method === READ_AGENTS_METHOD || call.method === "readGraph" || call.method === DARK_FORCE_HISTORY_READ_METHOD || call.method === PROFILE_READ_METHOD)).toBeTrue()
    for (const verseId of ["", "agents", "../other", "@root", "space value"]) expect(() => fixture(verseId)).toThrow("Invalid assigned COSMOS_VERSE_ID")
  } finally {f.bridge.close(); unassigned.bridge.close()}
})

test("invalid or oversized public Graph is unavailable instead of a partial browser snapshot", async () => {
  const f = fixture()
  try {
    f.observation.agents = []
    f.graph.runtime.roots[0]!.declaration = "#/template/missing"
    expect((await f.bridge.fetch(get(), local)).status).toBe(503)
    f.graph.runtime.roots[0]!.declaration = "#/template/@metafor~1environment"
    f.graph.template[ROOT]!.desc = "x".repeat(16 * 1024 * 1024)
    expect((await f.bridge.fetch(get(), local)).status).toBe(503)
    expect(f.calls.some(call => call.method === META_FIELD_VALUE_APPLY_METHOD)).toBeFalse()
  } finally {f.bridge.close()}
})

test("local agent snapshot reads only public projections and this discovered Chat session; polling is labelled honestly", async () => {
  const f = fixture()
  try {
    const response = await f.bridge.fetch(get(), local)
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("no-store")
    const value = await response.json() as AgentUiSnapshot
    expect(value).toMatchObject({schema: AGENT_UI_SCHEMA, root: ROOT, observation: {mechanism: "public-oracle-poll", photonSubscription: false},
      agents: [{ref: "atom:2", status: "idle", busy: false, error: null, activeTaskId: null, chatSession: {key: "session", atom: {ref: "atom:3"}}, chatError: null}]})
    expect(f.calls.map(call => call.method).sort()).toEqual([READ_AGENTS_METHOD, "readGraph", ENERGY_MASS_RESULT_READ_METHOD, DARK_FORCE_HISTORY_READ_METHOD, PROFILE_READ_METHOD].sort())
    expect(f.calls.find(call => call.method === ENERGY_MASS_RESULT_READ_METHOD)).toMatchObject({target: "energy", params: {key: "session", atom: {root: ROOT, ref: "atom:3", meta: CHAT}, maxBytes: 4 * 1024 * 1024}})
  } finally {f.bridge.close()}
})

test("explicit conversation input resolves its current Agent and uses exactly one task Field operation at the fresh frontier", async () => {
  const f = fixture()
  try {
    const response = await f.bridge.fetch(post(), local)
    expect(response.status).toBe(202)
    expect(await response.json()).toMatchObject({schema: "cosmos:agents/task/v1", agentRef: "atom:2", taskId: task.task.id, receipt: {field: "task"}})
    const writes = f.calls.filter(call => call.method === META_FIELD_VALUE_APPLY_METHOD)
    expect(writes).toHaveLength(1)
    expect(writes[0]).toMatchObject({target: "dark", params: {contractVersion: 1, atom: {root: ROOT, ref: "atom:2", meta: AGENT}, field: "task",
      value: JSON.stringify(task.task), expectedFrontier: {cutId: "agents-fixture", throughSequence: 7}}})
    expect(f.calls.some(call => call.method === ENERGY_MASS_RESULT_READ_METHOD)).toBeFalse()
  } finally {f.bridge.close()}
})

test("explicit Codespace task chooses only status/start and uses the same ordinary task Field", async () => {
  for (const operation of ["status", "start"] as const) {
    const f = fixture()
    const request = {agentRef: "atom:2", task: {id: `codespace-${operation}`, text: "Explicit assigned resource request", mode: "codespace", operation}}
    try {
      expect((await f.bridge.fetch(post(request), local)).status).toBe(202)
      expect(f.calls.filter(call => call.method === META_FIELD_VALUE_APPLY_METHOD)).toMatchObject([{params: {field: "task", value: JSON.stringify(request.task)}}])
    } finally {f.bridge.close()}
  }
  const f = fixture()
  try {
    for (const operation of ["create", "delete", "stop", "shell"]) {
      expect((await f.bridge.fetch(post({agentRef: "atom:2", task: {id: "invalid", text: "invalid", mode: "codespace", operation}}), local)).status).toBe(400)
    }
    expect(f.calls).toEqual([])
  } finally {f.bridge.close()}
})

test("development admission requires its declared REPL and a bounded explicit budget", async () => {
  const f = fixture()
  const request = {agentRef: "atom:2", task: {id: "audit", text: "Проверь среду", mode: "development", maxSteps: 8}}
  try {
    expect((await f.bridge.fetch(post(request), local)).status).toBe(400)
    f.observation.agents[0]!.configuration = {resolution: "exact", issues: [], value: {
      id: "assistant", atom: {kind: "atom", scope: "owner"}, presentation: {kind: "agent-inspector", defaultTab: "chat", tabs: ["chat", "provider", "tools", "context"]},
      tools: [{kind: "oracle-tool", name: "bun.evaluate", input: {}, owner: {meta: "@metafor/repl"}}], displays: [],
    }}
    expect((await f.bridge.fetch(post(request), local)).status).toBe(202)
    expect(f.calls.filter(call => call.method === META_FIELD_VALUE_APPLY_METHOD)).toMatchObject([{params: {field: "task", value: JSON.stringify(request.task)}}])
    for (const maxSteps of [0, 65, 2.5, "8", null]) {
      expect((await f.bridge.fetch(post({...request, task: {...request.task, maxSteps}}), local)).status).toBe(400)
    }
    expect(f.calls.filter(call => call.method === META_FIELD_VALUE_APPLY_METHOD)).toHaveLength(1)
  } finally {f.bridge.close()}
})

test("loopback, same-origin and closed request guards reject before any Oracle call", async () => {
  const f = fixture()
  try {
    const requests = [post(task, "https://outsider.invalid"), new Request(`${ORIGIN}/agents`, {headers: {Forwarded: "host=outsider.invalid"}}),
      new Request("http://outsider.invalid/agents"), new Request(`${ORIGIN}/agents`, {headers: {"Sec-Fetch-Site": "cross-site"}})]
    for (const request of requests) expect((await f.bridge.fetch(request, local)).status).toBe(403)
    expect((await f.bridge.fetch(get(), {requestIP: () => ({address: "192.0.2.1"})})).status).toBe(403)
    expect((await f.bridge.fetch(post({...task, shell: "run"}), local)).status).toBe(400)
    expect((await f.bridge.fetch(post({agentRef: task.agentRef, task: {...task.task, extra: true}}), local)).status).toBe(400)
    expect((await f.bridge.fetch(new Request(`${ORIGIN}/agents?key=private`), local)).status).toBe(400)
    expect(f.calls).toEqual([])
  } finally {f.bridge.close()}
})

test("active FSM state or a not-yet-consumed task cannot be overwritten", async () => {
  const f = fixture()
  try {
    f.actor.values.status = "running"
    expect((await f.bridge.fetch(post(), local)).status).toBe(409)
    f.actor.values.status = "idle"
    f.actor.values.task = JSON.stringify({id: "accepted", text: "already accepted", mode: "conversation"})
    expect((await f.bridge.fetch(post(), local)).status).toBe(409)
    expect(f.calls.some(call => call.method === META_FIELD_VALUE_APPLY_METHOD)).toBeFalse()
  } finally {f.bridge.close()}
})

test("concurrent same-Agent admission rejects a second task instead of queuing or replaying mutations", async () => {
  const f = fixture()
  const gate = Promise.withResolvers<void>()
  f.setGate(gate.promise)
  try {
    const first = f.bridge.fetch(post(), local)
    expect((await f.bridge.fetch(post({...task, task: {...task.task, id: "another"}}), local)).status).toBe(409)
    gate.resolve()
    expect((await first).status).toBe(202)
    expect(f.calls.filter(call => call.method === META_FIELD_VALUE_APPLY_METHOD)).toHaveLength(1)
  } finally {gate.resolve(); f.bridge.close()}
})

test("read observers coalesce in-flight public reads and private diagnostics never become browser data", async () => {
  const f = fixture()
  const gate = Promise.withResolvers<void>()
  f.setGate(gate.promise)
  try {
    const left = f.bridge.fetch(get(), local)
    const right = f.bridge.fetch(get(), local)
    gate.resolve()
    expect((await left).status).toBe(200)
    expect((await right).status).toBe(200)
    expect(f.calls.filter(call => call.method === READ_AGENTS_METHOD)).toHaveLength(1)
    f.rejectMass()
    const partial = await f.bridge.fetch(get(), local)
    const value = await partial.json() as AgentUiSnapshot
    expect(value.agents[0]).toMatchObject({chatSession: null, chatError: "The Agent's own Chat session cannot be read"})
    expect(JSON.stringify(value)).not.toContain("private host diagnostic")
    f.rejectMutation()
    const conflict = await f.bridge.fetch(post(), local)
    expect(conflict.status).toBe(409)
    expect(await conflict.text()).not.toContain("private host diagnostic")
  } finally {gate.resolve(); f.bridge.close()}
})

test("startup admission and close revoke observation without admitting a model or network action", async () => {
  const f = fixture()
  f.stopAdmission()
  expect((await f.bridge.fetch(get(), local)).status).toBe(503)
  expect((await f.bridge.fetch(post(), local)).status).toBe(503)
  expect(f.calls).toEqual([])
  f.bridge.close()
  expect((await f.bridge.fetch(get(), local)).status).toBe(503)
})
