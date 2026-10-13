import {expect, test} from "bun:test"
import {GRAPH_SCHEMA, parseMetaAddress, validateGraph, type Graph, type RuntimeAtom} from "@metafor/types/metafor/graph"
import {AGENT_OBSERVATION_SCHEMA, READ_AGENTS_METHOD, observeAgentConfiguration, type ReadAgentsReceipt} from "@metafor/types/metafor/agent-observation"
import type {OracleRpcHandler} from "shared/transport/oracle"
import {BOUNDARY_GRAPH_PROJECTION_METHOD} from "shared/protocol/boundary/runtime"
import {DARK_DECLARATION_PROJECTION_METHOD} from "../../dark/graph/declaration"
import {GraphOracle} from "../../dark/graph/oracle"
import {projectAgents} from "../../dark/graph/agents"

const ROOT = parseMetaAddress("@metafor/environment")!
const AGENT = parseMetaAddress("@metafor/agent")!
const CHAT = parseMetaAddress("@metafor/chat")!
const configuration = {id: "assistant", atom: {kind: "atom", scope: "owner"},
  presentation: {kind: "agent-inspector", defaultTab: "chat", tabs: ["chat", "provider", "tools", "context"]},
  tools: [{kind: "oracle-tool", name: "document.inspect", input: {format: "pdf"}, owner: {meta: "@tools/document"}}],
  displays: [{id: "world", source: {kind: "graph"}}, {id: "owner", source: {kind: "atom", scope: "owner"}}]}

function fixture(): Graph {
  return {schema: GRAPH_SCHEMA, root: ROOT, template: {
    [ROOT]: {name: "Environment", fields: [], superposition: [{name: "ready", transitions: null}], mass: [], processes: [], matter: [{kind: "wimp", src: AGENT}]},
    [AGENT]: {name: "Agent", fields: [{key: "configuration", type: "string"}, {key: "status", type: "string"}],
      superposition: [{name: "idle", transitions: null}], mass: [], processes: [], matter: [{kind: "wimp", src: CHAT}]},
    [CHAT]: {name: "Chat", fields: [{key: "sessionId", type: "string"}], superposition: [{name: "idle", transitions: null}],
      mass: [{key: "session", format: "json"}], processes: []},
  }, runtime: {roots: [{kind: "atom", ref: "atom:1", meta: ROOT, declaration: "#/template/@metafor~1environment", state: "ready", values: {}, mass: [], children: [
    {kind: "atom", ref: "atom:2", meta: AGENT, declaration: "#/template/@metafor~1environment/matter/0", state: "idle",
      values: {configuration: JSON.stringify(configuration), status: "completed"}, mass: [], children: [
        {kind: "atom", ref: "atom:3", meta: CHAT, declaration: "#/template/@metafor~1agent/matter/0", state: "idle",
          values: {sessionId: "private-native-session-identity"}, mass: [{ref: "mass:session", key: "session", format: "json", label: null, description: null, content: "lazy"}]},
      ]},
  ]}], reactions: []}}
}

const agent = (graph: Graph): RuntimeAtom => graph.runtime.roots[0]!.children![0] as RuntimeAtom

test("a connection slot preserves the declared office owner", () => {
  const graph = fixture()
  const root = graph.runtime.roots[0] as RuntimeAtom
  const slot = parseMetaAddress("@metafor/agent-slot")!
  const child = agent(graph)
  graph.template[ROOT]!.matter = [{kind: "wimp", src: slot}]
  graph.template[slot] = {name: "Slot", fields: [], superposition: [{name: "connected", transitions: null}],
    mass: [], processes: [], matter: [{kind: "wimp", src: AGENT}]}
  child.declaration = "#/template/@metafor~1agent-slot/matter/0"
  root.children = [{kind: "atom", ref: "atom:4", meta: slot, declaration: "#/template/@metafor~1environment/matter/0",
    state: "connected", values: {}, mass: [], children: [child]}]
  expect(validateGraph(graph)).toMatchObject({ok: true})
  expect(projectAgents(graph).agents[0]?.owner).toEqual({ref: root.ref, meta: ROOT})
})

test("readAgents projects validated current Graph placement, generic declarations and Chat Mass metadata only", () => {
  const graph = fixture()
  expect(validateGraph(graph)).toMatchObject({ok: true})
  const result = projectAgents(graph)
  expect(result).toMatchObject({schema: AGENT_OBSERVATION_SCHEMA, version: 1, root: ROOT, agents: [{ref: "atom:2", meta: AGENT,
    owner: {ref: "atom:1", meta: ROOT}, state: "idle", status: "completed", configuration: {resolution: "exact", value: configuration, issues: []},
    chat: {ref: "atom:3", meta: CHAT, session: {ref: "mass:session", key: "session", format: "json", content: "lazy"}}, issues: []}]})
  expect(JSON.stringify(result)).not.toContain("private-native-session-identity")
  const observed = result.agents[0]!.configuration
  if (observed.resolution !== "exact") throw new Error("Missing decoded declaration")
  expect(observed.value.tools[0]).not.toHaveProperty("capability")
  observed.value.tools.length = 0
  expect(JSON.parse(agent(graph).values.configuration as string).tools[0].name).toBe("document.inspect")
})

test("owning Atom identity survives intervening topology without inventing Agent or Chat content", () => {
  const graph = fixture()
  const root = graph.runtime.roots[0] as RuntimeAtom
  graph.template[ROOT]!.matter = [{kind: "axion", predicateBinding: {data: "/state", expr: '_[0] === "ready"'}, children: [{edgeSlot: "then", particle: {kind: "wimp", src: AGENT}}]}]
  agent(graph).declaration = "#/template/@metafor~1environment/matter/0/children/0/particle"
  root.children = [{kind: "topology", ref: "topology:1", topology: "axion", declaration: "#/template/@metafor~1environment/matter/0", children: root.children ?? []}]
  expect(validateGraph(graph)).toMatchObject({ok: true})
  const result = projectAgents(graph)
  expect(result.agents[0]?.owner).toEqual({ref: "atom:1", meta: ROOT})
  expect(result.agents[0]?.ref).toBe("atom:2")
  const detached = fixture()
  detached.runtime.roots = [agent(detached)]
  const unknown = projectAgents(detached)
  expect(unknown.agents[0]?.owner).toBeNull()
  expect(unknown.agents[0]?.issues.map(issue => issue.code)).toContain("missing_owner")
})

test("missing or invalid canonical configuration reports unknown resolution and never executes or reflects its bytes", () => {
  const graph = fixture()
  delete agent(graph).values.configuration
  expect(projectAgents(graph).agents[0]?.configuration).toMatchObject({resolution: "unknown", value: null, issues: [{code: "missing_configuration"}]})
  const nonfinite = JSON.stringify({...configuration, tools: [{kind: "oracle-tool", name: "read", input: {amount: null}}]}).replace('"amount":null', '"amount":1e999')
  for (const source of ['globalThis.secret="not-executed"', JSON.stringify({...configuration, secret: "must-not-reflect"}), nonfinite]) {
    agent(graph).values.configuration = source
    const result = projectAgents(graph)
    expect(result.agents[0]?.configuration).toMatchObject({resolution: "unknown", value: null, issues: [{code: "invalid_configuration"}]})
    expect(JSON.stringify(result)).not.toContain("must-not-reflect")
  }
  expect(observeAgentConfiguration('{"id":"invalid", "value":1e999}').resolution).toBe("unknown")
  agent(graph).children = []
  expect(projectAgents(graph).agents[0]?.chat).toBeNull()
  expect(projectAgents(graph).agents[0]?.issues.map(issue => issue.code)).toContain("missing_chat")
})

test("Graph Oracle registers readAgents over one fresh Graph assembly and observes changed canonical configuration", async () => {
  const graph = fixture()
  const handlers = new Map<string, OracleRpcHandler>()
  const calls: string[] = []
  const peer = {expose(method: string, handler: OracleRpcHandler) {handlers.set(method, handler)}, async call<T>(target: string, method: string): Promise<T> {
    calls.push(`${target}:${method}`)
    if (target === "boundary" && method === BOUNDARY_GRAPH_PROJECTION_METHOD) return structuredClone({root: graph.root, runtime: graph.runtime}) as T
    if (target === "dark" && method === DARK_DECLARATION_PROJECTION_METHOD) return structuredClone({root: graph.root, template: graph.template}) as T
    throw new Error("Unexpected private provider")
  }}
  new GraphOracle().onServerStarted(peer)
  const read = async (params: unknown): Promise<ReadAgentsReceipt> => await handlers.get(READ_AGENTS_METHOD)!(params, {source: "trusted-observer"}) as ReadAgentsReceipt
  expect(handlers.has(READ_AGENTS_METHOD)).toBeTrue()
  const first = await read({})
  expect(calls).toEqual([`boundary:${BOUNDARY_GRAPH_PROJECTION_METHOD}`, `dark:${DARK_DECLARATION_PROJECTION_METHOD}`])
  expect(first.agents[0]?.configuration).toMatchObject({resolution: "exact", value: {id: "assistant"}})
  agent(graph).values.configuration = JSON.stringify({...configuration, id: "updated-agent", displays: []})
  const changed = await read({})
  expect(changed.agents[0]?.ref).toBe(first.agents[0]?.ref)
  expect(changed.agents[0]?.configuration).toMatchObject({resolution: "exact", value: {id: "updated-agent", displays: []}})
  expect(calls).toHaveLength(4)
  await expect(read({root: ROOT})).rejects.toThrow("must be empty")
  expect(calls).toHaveLength(4)
})
