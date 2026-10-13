import "@metafor/dsl"
import {expect, test} from "bun:test"
import {mkdtemp, rm} from "node:fs/promises"
import {join} from "node:path"
import {tmpdir} from "node:os"
import {GRAPH_SCHEMA, validateGraph, parseMetaAddress, type Graph} from "@metafor/types/metafor/graph"
import type {MassHandle} from "@metafor/types/metafor/mass"
import type {ProviderEnergy} from "../provider/runtime-types"
import {OracleRpcPeer} from "shared/transport/oracle"
import {DARK_FORCE_HISTORY_READ_METHOD} from "shared/protocol/metafor/observation"
import {createLocalOracleChannelPair} from "../../quantum/dark/oracle/local"
import {OracleRouter} from "../../quantum/dark/oracle/router"
import {createProcessOracleEnvironment, readOracleEnvironmentReplScopes, type EnergyNativeReplGrant} from "../../quantum/energy/environment"
import {createNativeReplOracle} from "../../cosmos/release/server/repl"
import {planning, developing, collectingDevelopment, type AgentInput, type AgentValues} from "../agent/actions"
import sendChat from "../chat/test/fixture/cycle"
import {createCodexDriver} from "../provider/codex-driver"
import run from "./run"

const memory = (initial: unknown = null) => {
  let value = initial
  const handle: MassHandle = {async readText() {return value === null ? "" : JSON.stringify(value)}, async readJson() {return structuredClone(value)},
    async readBytes() {return new TextEncoder().encode(await this.readText())}, async write(next) {value = structuredClone(next)}}
  return {handle, get: () => structuredClone(value), set(next: unknown) {value = structuredClone(next)}}
}
const names = ["@metafor/environment", "@metafor/agent", "@metafor/repl"].map(name => parseMetaAddress(name)!)
async function fixture() {
  const cwd = await mkdtemp(join(tmpdir(), "metafor-agent-repl-")), token = crypto.randomUUID()
  const grant: EnergyNativeReplGrant = {assignment: {token, cwd}, sessions: new Map()}
  const graph: Graph = {schema: GRAPH_SCHEMA, root: names[0]!, template: Object.fromEntries(names.map(meta => [meta, {name: meta,
    fields: meta === names[2] ? ["request", "ack", "ackId", "response", "error"].map(key => (key === "ack" ? {key, type: "boolean" as const} : {key, type: "string" as const})) : [],
    superposition: [{name: "idle", transitions: null}], mass: [], processes: []}])), runtime: {roots: [
      {kind: "atom", ref: "atom:1", meta: names[0]!, declaration: "#/template/@metafor~1environment", state: "idle", values: {}, mass: [], children: [
        {kind: "atom", ref: "atom:2", meta: names[1]!, declaration: "#/template/@metafor~1environment/matter/0", state: "idle", values: {}, mass: [], children: [
          {kind: "atom", ref: "atom:3", meta: names[2]!, declaration: "#/template/@metafor~1agent/matter/0", state: "idle", values: {}, mass: []},
        ]},
      ]},
    ], reactions: []}}
  graph.template[names[0]!]!.matter = [{kind: "wimp", src: names[1]!}]
  graph.template[names[1]!]!.matter = [{kind: "wimp", src: names[2]!}]
  const validation = validateGraph(graph)
  if (!validation.ok) throw new Error(JSON.stringify(validation.issues))
  const native = createNativeReplOracle({assignment: grant.assignment}), router = new OracleRouter()
  let world = "fixture-cut", evaluations = 0
  const dark = createLocalOracleChannelPair("dark", () => ["readGraph", DARK_FORCE_HISTORY_READ_METHOD]), darkPeer = new OracleRpcPeer(dark.peer)
  darkPeer.expose("readGraph", () => graph); darkPeer.expose(DARK_FORCE_HISTORY_READ_METHOD, () => ({frontier: {cutId: world}}))
  const energy = createLocalOracleChannelPair("energy", () => []), peer = new OracleRpcPeer(energy.peer)
  energy.router.subscribe(message => {if ("method" in message && message.method === "cosmos.repl.evaluate") evaluations++})
  for (const channel of [dark.router, energy.router, native.channel]) router.attach(channel)
  const accesses: {close(): void}[] = []
  const access = (atomId: number, wimp: string, nativeGrant = grant) => {
    const result = createProcessOracleEnvironment({peer, graphScopes: ["@metafor/agent"], replScopes: ["@metafor/repl"], replGrant: nativeGrant, atomId, wimp, signal: new AbortController().signal})!
    accesses.push(result); return result.environment
  }
  const environment = access(3, "@metafor/repl"), receipt = memory()
  const execute = (id: string, code: string) => run({request: JSON.stringify({id, code}), mass: {receipt: receipt.handle}, environment, signal: new AbortController().signal})
  return {cwd, token, graph, grant, native, environment, receipt, execute, access, evaluations: () => evaluations, world(value: string) {world = value}, async close() {for (const item of accesses) item.close(); peer.close(); darkPeer.close(); await native.close(); await energy.peer.close(); await dark.peer.close(); await rm(cwd, {recursive: true, force: true})}}
}

test("real native Tool persists intent, retains heap and completion, and returns JavaScript failure as a model result", async () => {
  const f = await fixture()
  try {
    const first = await f.execute("one", 'var n = 40; await Bun.write("proof.txt", "native"); n += 2; n')
    expect(first.error).toBe(null); expect(JSON.parse(first.response!).result).toBe("42")
    expect(await f.execute("one", 'var n = 40; await Bun.write("proof.txt", "native"); n += 2; n')).toEqual(first)
    expect(f.evaluations()).toBe(1)
    expect((await f.execute("one", "n = 99")).error).toContain("different code")
    const second = await f.execute("two", 'throw new Error("correctable code failure")')
    expect(second.error).toBe(null); expect(JSON.parse(second.response!)).toMatchObject({state: "failed"})
    expect((await f.execute("three", "n")).response).toContain('"result":"42"')
    expect(await Bun.file(join(f.cwd, "proof.txt")).text()).toBe("native")
    expect(JSON.stringify(f.receipt.get())).not.toContain(f.token)
  } finally {await f.close()}
})

test("pending observes retained job, missing admission refuses replay, and host restart needs an explicit new request", async () => {
  const f = await fixture()
  try {
    const code = 'var once = 1; once', first = await f.execute("once", code)
    const ledger = f.receipt.get() as any
    ledger.requests[0].state = "pending"; ledger.requests[0].result = null
    f.receipt.set(ledger)
    expect((await f.execute("once", code)).response).toBe(first.response)
    expect(f.evaluations()).toBe(1)
    ledger.requests[0].state = "pending"; ledger.requests[0].jobId = null
    f.receipt.set(ledger)
    expect((await f.execute("once", code)).error).toContain("uncertain")
    expect(f.evaluations()).toBe(1)
    const next = await f.execute("new-human-request", "typeof once")
    expect(JSON.parse(next.response!).result).toBe("'undefined'")
    const state = f.receipt.get() as any
    state.requests.at(-1).state = "pending"
    f.receipt.set(state)
    const restarted = f.access(3, "@metafor/repl", {assignment: f.grant.assignment, sessions: new Map()})
    const refused = await run({request: JSON.stringify({id: "new-human-request", code: "typeof once"}), mass: {receipt: f.receipt.handle}, environment: restarted, signal: new AbortController().signal})
    expect(refused.error).toContain("not owned")
    expect(f.evaluations()).toBe(2)
  } finally {await f.close()}
})

test("native grant binds world and actor, namespaces identities, and never exposes token to Process reads", async () => {
  const f = await fixture()
  try {
    expect(readOracleEnvironmentReplScopes({})).toEqual([])
    expect(() => readOracleEnvironmentReplScopes({ORACLE_ENVIRONMENT_REPL_SCOPES: "@metafor/agent"})).toThrow("exact Tool")
    const observed = await f.environment.read()
    expect(JSON.stringify(observed)).not.toContain(f.token)
    const session = await f.environment.call("cosmos.repl.open", {requestId: "same"})
    f.graph.template[names[1]!]!.matter!.push({kind: "wimp", src: names[2]!})
    f.graph.runtime.roots[0]!.children![0]!.children!.push({kind: "atom", ref: "atom:4", meta: names[2]!, declaration: "#/template/@metafor~1agent/matter/1", state: "idle", values: {}, mass: []})
    const otherTool = f.access(4, "@metafor/repl")
    await expect(otherTool.call("cosmos.repl.read", {sessionId: session.sessionId, incarnation: session.incarnation, cursor: 0})).rejects.toThrow("not owned")
    expect((await otherTool.call("cosmos.repl.open", {requestId: "same"})).sessionId).not.toBe(session.sessionId)
    const agent = f.access(2, "@metafor/agent")
    await expect(agent.call("cosmos.repl.open", {requestId: "same"})).rejects.toThrow("not assigned")
    f.world("other-cut")
    await expect(f.environment.call("cosmos.repl.read", {sessionId: session.sessionId, incarnation: session.incarnation, cursor: 0})).rejects.toThrow("not owned")
    const other = await f.environment.call("cosmos.repl.open", {requestId: "same"})
    expect(other.sessionId).not.toBe(session.sessionId)
    await expect(Reflect.apply(f.environment.call, f.environment, ["cosmos.repl.open", {requestId: "x", token: f.token}])).rejects.toThrow("arguments")
  } finally {await f.close()}
})

test("one real Chat/Provider conversation drives native REPL, corrects JS error, and ends with observed answer", async () => {
  const f = await fixture()
  try {
    const task = memory(), chat = memory(), energy: ProviderEnergy = {}
    const decisions = [
      {operation: "bun.evaluate", code: 'var proof = 40; await Bun.write("agent.txt", "built"); proof += 2; proof'},
      {operation: "bun.evaluate", code: 'throw new Error("model can correct this")'},
      {operation: "bun.evaluate", code: 'proof'},
      {answer: "Проверено: файл создан, значение 42, ошибка исправлена."},
    ]
    const built = await Bun.build({entrypoints: [join(import.meta.dir, "../chat/test/fixture/agent.ts")], target: "bun"})
    if (!built.success) throw new AggregateError(built.logs, "Fake ACP build failed")
    const executable = join(f.cwd, "fake-acp.mjs"), replies = join(f.cwd, "replies.json"), nativeStore = join(f.cwd, "native-chat.json")
    await Bun.write(executable, built.outputs[0]!)
    await Bun.write(replies, JSON.stringify(decisions))
    const driver = createCodexDriver({command: [process.execPath, executable], cwd: f.cwd, env: {ORACLE_AGENT_FIXTURE_STORE: nativeStore, ORACLE_AGENT_FIXTURE_REPLY_FILE: replies, ORACLE_AGENT_FIXTURE_ASSERT_FENCE: "1"}})
    const value: AgentValues = {task: JSON.stringify({id: "develop", text: "Создай и проверь файл", mode: "development", maxSteps: 4}), answer: null, status: "idle", error: null, activeTaskId: null,
      configuration: JSON.stringify({id: "developer", atom: {kind: "atom", scope: "owner"}, presentation: {kind: "agent-inspector", defaultTab: "chat", tabs: ["chat", "provider", "tools", "context"]}, tools: [{kind: "oracle-tool", name: "bun.evaluate", input: {}, owner: {meta: "@metafor/repl"}}], displays: []}),
      chatRequest: null, chatAck: false, chatAckId: "", chatResponse: null, chatError: null,
      toolRequest: null, toolAck: false, toolAckId: "", toolResponse: null, toolError: null,
      codespaceRequest: null, codespaceAck: false, codespaceAckId: "", codespaceResponse: null, codespaceError: null}
    const input: AgentInput = {value, mass: {task: task.handle}, signal: new AbortController().signal, environment: f.access(2, "@metafor/agent")}
    Object.assign(value, await planning(input))
    while (value.status !== "completed" && value.status !== "failed") {
      const model = await sendChat({request: value.chatRequest, mass: {session: chat.handle}, energy, driver, signal: input.signal})
      Object.assign(value, {chatAck: true, chatAckId: model.ackId, chatResponse: model.response, chatError: model.error})
      const decision = await developing(input)
      expect(await developing(input)).toEqual(decision)
      Object.assign(value, decision)
      if (value.status === "completed") break
      const tool = await run({request: value.replRequest!, mass: {receipt: f.receipt.handle}, environment: f.environment, signal: input.signal})
      Object.assign(value, {replAck: tool.ack, replAckId: tool.ackId, replResponse: tool.response, replError: tool.error})
      const collected = await collectingDevelopment(input)
      expect(await collectingDevelopment(input)).toEqual(collected)
      Object.assign(value, collected)
    }
    expect(value.status).toBe("completed"); expect(value.answer).toContain("42")
    expect(await Bun.file(join(f.cwd, "agent.txt")).text()).toBe("built")
    const stored = await Bun.file(nativeStore).json() as {sessionId: string; resumes: number; prompts: string[]}
    const prompts = stored.prompts
    expect(f.evaluations()).toBe(3); expect(prompts).toHaveLength(4)
    expect(stored.resumes).toBe(3)
    expect((chat.get() as any).sessionId).toBe(stored.sessionId)
    expect(JSON.parse(prompts[2]!).result).toMatchObject({state: "failed"})
    expect((task.get() as any).requests[0].steps).toHaveLength(4)
    expect((chat.get() as any).messages).toHaveLength(8)
    expect(JSON.stringify([task.get(), chat.get(), prompts])).not.toContain(f.token)
    value.task = JSON.stringify({id: "develop", text: "Создай и проверь файл", mode: "development", maxSteps: 4})
    expect((await planning(input)).answer).toBe(value.answer)
    expect(f.evaluations()).toBe(3)
    await Bun.write(replies, JSON.stringify([...decisions, {operation: "bun.evaluate", code: "proof"}]))
    value.task = JSON.stringify({id: "budget", text: "Проверь значение", mode: "development", maxSteps: 1})
    Object.assign(value, await planning(input))
    const model = await sendChat({request: value.chatRequest, mass: {session: chat.handle}, energy, driver, signal: input.signal})
    Object.assign(value, {chatAck: true, chatAckId: model.ackId, chatResponse: model.response, chatError: model.error})
    Object.assign(value, await developing(input))
    const tool = await run({request: value.replRequest!, mass: {receipt: f.receipt.handle}, environment: f.environment, signal: input.signal})
    Object.assign(value, {replAck: tool.ack, replAckId: tool.ackId, replResponse: tool.response, replError: tool.error})
    Object.assign(value, await collectingDevelopment(input))
    expect(value.status).toBe("failed"); expect(value.error).toContain("budget exhausted (1)")
    expect(value.chatRequest).toBe(null)
    expect((await Bun.file(nativeStore).json()).prompts).toHaveLength(5)
  } finally {await f.close()}
})
