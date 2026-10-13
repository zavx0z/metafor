import {expect, test} from "bun:test"
import {GRAPH_SCHEMA, parseMetaAddress, type Graph} from "@metafor/types/metafor/graph"
import type {OracleProcessEnvironment} from "@metafor/types/metafor/environment"
import type {OracleRpcPeer} from "shared/transport/oracle"
import type {ForceMessage} from "shared/protocol/force/message"
import type {EnergyForce} from "./types/protocol"
import {createProcessOracleEnvironment, readOracleEnvironmentGraphScopes, readOracleEnvironmentCodespaceScopes} from "./environment"
import {CODESPACE_META, CODESPACE_STATUS_METHOD, CODESPACE_START_METHOD, type CodespaceResult} from "@metafor/types/metafor/codespace"
import {createInMemoryEnergyMassStore, startEnergyProtocol} from "./energy"
import {EnergyCatalogStore} from "./graph/catalog"

const META = parseMetaAddress("@metafor/agent")!
const graph = (id = 17, meta = META): Graph => ({
  schema: GRAPH_SCHEMA,
  root: meta,
  template: {[meta]: {name: "Actor", fields: [], superposition: [{name: "ready", transitions: null}], mass: [], processes: []}},
  runtime: {roots: [{kind: "atom", ref: `atom:${id}`, declaration: `#/template/${meta.replaceAll("~", "~0").replaceAll("/", "~1")}`,
    meta, state: "ready", values: {}, mass: []}], reactions: []},
})
const fixture = (read: () => unknown | Promise<unknown> = () => graph(), graphScopes: readonly string[] = [META]) => {
  const calls: {target: string; method: string; input: unknown}[] = []
  const controller = new AbortController()
  const peer: Pick<OracleRpcPeer, "call"> = {async call<T>(target: string, method: string, input: unknown): Promise<T> {
    calls.push({target, method, input})
    return await read() as T
  }}
  return {calls, controller, peer, access: createProcessOracleEnvironment({peer, graphScopes, atomId: 17, wimp: META, signal: controller.signal})}
}

test("Codespace host operations require their separate exact Tool grant and inject the verified actor", async () => {
  expect(readOracleEnvironmentCodespaceScopes({})).toEqual([])
  expect(readOracleEnvironmentCodespaceScopes({ORACLE_ENVIRONMENT_CODESPACE_SCOPES: CODESPACE_META})).toEqual([CODESPACE_META])
  expect(() => readOracleEnvironmentCodespaceScopes({ORACLE_ENVIRONMENT_CODESPACE_SCOPES: META})).toThrow("exact Tool")
  const tool = parseMetaAddress(CODESPACE_META)!
  const calls: {target: string; method: string; input: unknown}[] = []
  const peer: Pick<OracleRpcPeer, "call"> = {async call<T>(target: string, method: string, input: unknown): Promise<T> {
    calls.push({target, method, input})
    if (method === "readGraph") return graph(17, tool) as T
    const result: CodespaceResult = {schema: "metafor/codespace/v1", version: 1, operation: method === CODESPACE_START_METHOD ? "start" : "status",
      target: {name: "fixture-space", account: "fixture-account"}, state: "Available", outcome: method === CODESPACE_START_METHOD ? "already-running" : "observed"}
    return result as T
  }}
  const access = createProcessOracleEnvironment({peer, graphScopes: [], codespaceScopes: [CODESPACE_META], atomId: 17, wimp: tool, signal: new AbortController().signal})!
  try {
    expect((await access.environment.read()).operations.map(operation => operation.name)).toEqual(["readGraph", CODESPACE_STATUS_METHOD, CODESPACE_START_METHOD])
    await access.environment.call(CODESPACE_START_METHOD, {requestId: "start-1"})
    expect(calls.at(-1)).toEqual({target: "codespace-host", method: CODESPACE_START_METHOD, input: {actor: {root: tool, ref: "atom:17", meta: tool}, requestId: "start-1"}})
    await expect(Reflect.apply(access.environment.call, access.environment, [CODESPACE_START_METHOD, {requestId: "x", target: "foreign"}])).rejects.toThrow()
    const other = fixture()
    try {await expect(other.access!.environment.call(CODESPACE_STATUS_METHOD, {})).rejects.toThrow("only readGraph")}
    finally {other.access!.close()}
  } finally {access.close()}
})

test("native grant is empty by default and exact Meta names are validated", () => {
  expect(readOracleEnvironmentGraphScopes({})).toEqual([])
  expect(readOracleEnvironmentGraphScopes({ORACLE_ENVIRONMENT_GRAPH_SCOPES: " "})).toEqual([])
  expect(readOracleEnvironmentGraphScopes({ORACLE_ENVIRONMENT_GRAPH_SCOPES: " @metafor/agent, @metafor/scenario,@metafor/agent "})).toEqual([META, "@metafor/scenario"])
  expect(() => readOracleEnvironmentGraphScopes({ORACLE_ENVIRONMENT_GRAPH_SCOPES: "@metafor/agent,*"})).toThrow("exact Meta package names")
  expect(() => readOracleEnvironmentGraphScopes({ORACLE_ENVIRONMENT_GRAPH_SCOPES: "@metafor/agent,"})).toThrow()
  expect(fixture(undefined, []).access).toBeUndefined()
  expect(fixture(undefined, ["@metafor/scenario"]).access).toBeUndefined()
})

test("bound read describes the same sole public RPC and detaches the observed Graph", async () => {
  const current = graph()
  const f = fixture(() => current)
  try {
    const result = await f.access!.environment.read()
    expect(result).toMatchObject({contractVersion: 1, actor: {ref: "atom:17", meta: META}, scope: {kind: "full-root", root: META},
      operations: [{name: "readGraph", inputSchema: {type: "object", properties: {}, additionalProperties: false}}]})
    result.graph.template[META]!.name = "caller-local edit"
    expect(current.template[META]!.name).toBe("Actor")
    expect(await f.access!.environment.call("readGraph", {})).toEqual(current)
    expect(f.calls).toEqual([{target: "dark", method: "readGraph", input: {}}, {target: "dark", method: "readGraph", input: {}}])
  } finally {f.access!.close()}
})

test("caller cannot choose another operation, actor, root or extra arguments", async () => {
  const f = fixture()
  const environment = f.access!.environment
  try {
    for (const args of [["boundary.initialProjection.read", {}], ["meta.field.value.apply", {}], ["readGraphDelta", {}],
      ["readGraph", {actor: "atom:99"}], ["readGraph", {root: META}], ["readGraph", {}, "extra"], ["readGraph"], ["readGraph", []],
      ["readGraph", {[Symbol("hidden")]: true}], ["readGraph", Object.create({root: META})]]) {
      await expect(Reflect.apply(environment.call, environment, args)).rejects.toThrow("only readGraph")
    }
    await expect(Reflect.apply(environment.read, environment, [{}])).rejects.toThrow("no arguments")
    expect(f.calls).toEqual([])
  } finally {f.access!.close()}
})

test("Graph must contain the exact granted actor and valid public structure", async () => {
  for (const result of [graph(18), graph(17, parseMetaAddress("@metafor/scenario")!), {}]) {
    const f = fixture(() => result)
    try {await expect(f.access!.environment.read()).rejects.toThrow()}
    finally {f.access!.close()}
  }
})

test.each(["completion", "abort"] as const)("%s revokes retained and in-flight access before a late answer escapes", async reason => {
  const response = Promise.withResolvers<Graph>()
  const f = fixture(() => response.promise)
  const environment = f.access!.environment
  const pending = environment.read()
  if (reason === "abort") f.controller.abort()
  else f.access!.close()
  await expect(pending).rejects.toThrow("execution has ended")
  response.resolve(graph())
  await expect(environment.read()).rejects.toThrow("execution has ended")
  await expect(environment.call("readGraph", {})).rejects.toThrow("execution has ended")
  expect(f.calls).toHaveLength(1)
  f.access!.close()
})

test.each([
  {label: "granted", scopes: [META], granted: true, fail: false},
  {label: "absent", scopes: undefined, granted: false, fail: false},
  {label: "wrong Meta", scopes: ["@metafor/scenario"], granted: false, fail: false},
  {label: "action failure", scopes: [META], granted: true, fail: true},
])("real Process binds only its granted action capability and revokes on completion: $label", async scenario => {
  const f = fixture()
  const state: {captured?: OracleProcessEnvironment; present?: boolean} = {}
  const messages: ForceMessage[] = []
  const force: EnergyForce = {onImpulse() {}, impulse(message) {messages.push(structuredClone(message))}}
  const catalog = new EnergyCatalogStore()
  const action = `export default async ({environment, energy}) => {
    energy.present = environment !== undefined
    if (environment) {energy.captured = environment; const result = await environment.read(); ${scenario.fail ? 'throw new Error("action failed")' : "return result"}}
    return null
  }`
  catalog.apply({part: "graviton", op: "add", path: "atom/17", ts: 1, value: {
    atom: {id: 17, wimp: META, parentAtom: null, parentTopology: null, position: 0}, values: [], valueRecords: [], valueItems: [], state: null,
  }})
  const source = `data:application/javascript;base64,${Buffer.from(action).toString("base64")}`
  catalog.apply({part: "graviton", op: "add", path: "process", ts: 1, value: {id: 101, localId: 1, wimp: META, state: "ready",
    descriptor: {type: "action", key: "ready", env: ["server"], action: {src: source,
      wrapperSrc: `async ({environment, energy}) => {const action = await import(${JSON.stringify(source)}); return action.default({environment, energy})}`,
      readFields: []}}}})
  const protocol = startEnergyProtocol({force, catalog, energyId: "environment-energy", massStore: createInMemoryEnergyMassStore(),
    energyStore: {get: () => state, bind() {}, release() {}, clear() {}},
    ...(scenario.scopes ? {oracleEnvironment: {peer: f.peer, graphScopes: scenario.scopes}} : {})})
  try {
    await force.onImpulse({parts: [{part: "photon", op: "test", path: 17, ts: 1, from: "execution-environment", value: "ready"}]})
    expect(messages.at(-1)?.parts[0].part).toBe("z")
    await force.onImpulse({parts: [{part: "z", op: "copy", path: 17, ts: 2, from: "environment-energy", value: {processExecutionId: "execution-environment", fields: {}}}]})
    await protocol.quiesce()
    expect(state.present).toBe(scenario.granted)
    expect(messages.at(-1)?.parts[0].part).toBe(scenario.fail ? "w-" : "w+")
    expect(f.calls).toHaveLength(scenario.granted ? 1 : 0)
    if (scenario.granted) await expect(state.captured!.read()).rejects.toThrow("execution has ended")
  } finally {protocol.close(); f.access!.close()}
})
