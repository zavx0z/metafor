import {expect, test} from "bun:test"
import {mkdtemp, rm, writeFile, access} from "node:fs/promises"
import {join} from "node:path"
import {tmpdir} from "node:os"
import {resolveConfiguredProvider, checkProviderRegistration, authorizedProviderDriver, readProviderOptions} from "./driver"
import {createProviderRegistry} from "./catalog"
import turn from "./turn"
import cycle from "../chat/test/fixture/cycle"
import type {MassHandle} from "@metafor/types/metafor/mass"

let binding = {id: "native-ollama", service: "ollama", host: "native", remotePeerId: "native", executorId: "ollama", assignmentId: ""}
const memory = (initial: unknown): MassHandle => {
  let value = initial
  return {async readText() {return value === null ? "" : JSON.stringify(value)}, async readJson() {return value}, async readBytes() {return new TextEncoder().encode(JSON.stringify(value))}, async write(next) {value = structuredClone(next)}}
}
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "metafor-ollama-")), native = join(directory, "native"), path = join(directory, "authority.json")
  const calls: Array<{path: string; body: any}> = []
  let empty = false, failStream = false
  const server = Bun.serve({hostname: "127.0.0.1", port: 0, async fetch(request) {
    const path = new URL(request.url).pathname, body = request.method === "POST" ? await request.json() : null
    calls.push({path, body})
    if (path === "/api/tags") return Response.json({models: empty ? [] : ["fixture-a", "fixture-b"].map(name => ({name, model: name, capabilities: ["completion"]}))})
    if (path === "/api/show") return Response.json({capabilities: ["completion"], model_info: {"fixture.context_length": 8192}, thinking: body.model === "fixture-a" ? {values: ["low", "high"], default: "low"} : {values: [false]}})
    if (path === "/api/chat") return new Response(JSON.stringify({model: body.model, message: {role: "assistant", content: "Fixture Ollama response"}, done: !failStream, done_reason: "stop", prompt_eval_count: 1, eval_count: 1}) + "\n", {headers: {"content-type": "application/x-ndjson"}})
    return new Response("Unexpected Ollama request", {status: 404})
  }})
  const previous = process.env.ORACLE_AGENT_PROVIDER_CONFIG
  await writeFile(path, JSON.stringify({version: 1, hosts: {}, bindings: {}, ollama: {url: server.url.origin, directory: native}}), {mode: 0o600})
  process.env.ORACLE_AGENT_PROVIDER_CONFIG = path
  const connection = {id: "configured-ollama", label: "Assigned Ollama", enabled: true, provider: "ollama" as const, endpoint: {url: server.url.origin}}
  binding = {...await resolveConfiguredProvider(connection, []), assignmentId: (await resolveConfiguredProvider(connection, [])).assignmentId!}
  const registry = createProviderRegistry([{...binding, source: {kind: "native-bootstrap", assignmentId: binding.id, remoteGraph: "unknown"}, resolution: "exact", connection: "connected", capabilities: {modelTurn: true, browserPreview: false, browserControl: false}, checks: {status: "unknown", checkedAt: 1, message: null}}])
  return {native, server, connection, registry, calls, empty() {empty = true}, fail() {failStream = true}, async close() {server.stop(true); if (previous === undefined) delete process.env.ORACLE_AGENT_PROVIDER_CONFIG; else process.env.ORACLE_AGENT_PROVIDER_CONFIG = previous; await rm(directory, {recursive: true, force: true})}}
}

test("Ollama resolves only the assigned endpoint and reads actual model/thinking metadata without a native session or generation", async () => {
  const f = await fixture()
  try {
    expect(await resolveConfiguredProvider(f.connection, [])).toEqual(binding)
    for (const connection of [{...f.connection, endpoint: {url: "http://127.0.0.1:1"}}, {...f.connection, peer: {peerId: "unassigned", executorId: "ollama"}}]) await expect(resolveConfiguredProvider(connection, [])).rejects.toThrow()
    expect(f.calls).toEqual([])
    expect(await checkProviderRegistration(binding, AbortSignal.timeout(3000))).toMatchObject({connection: "connected", capabilities: {modelTurn: true, browserPreview: false, browserControl: false}})
    expect(await readProviderOptions(binding, "fixture-a", AbortSignal.timeout(3000))).toMatchObject({model: "fixture-a", models: [{id: "fixture-a", label: "fixture-a"}, {id: "fixture-b", label: "fixture-b"}], reasoningLevels: [{id: "default"}, {id: "low"}, {id: "high"}]})
    expect((await readProviderOptions(binding, "fixture-b", AbortSignal.timeout(3000))).reasoningLevels).toEqual([])
    await expect(readProviderOptions(binding, "not-installed", AbortSignal.timeout(3000))).rejects.toThrow("установленную модель")
    await expect(authorizedProviderDriver({...binding, executorId: "foreign"})).rejects.toThrow("назначения")
    expect(f.calls.every(row => row.path === "/api/tags" || row.path === "/api/show")).toBe(true)
    await expect(access(f.native)).rejects.toBeDefined()
    f.empty()
    await expect(checkProviderRegistration(binding, AbortSignal.timeout(3000))).rejects.toThrow("установленную модель")
  } finally {await f.close()}
})

test("standard Chat uses public Ollama sessions, applies issued settings, restores native identity and never replays a completed prompt", async () => {
  const f = await fixture()
  try {
    const driver = await authorizedProviderDriver(binding), chat = memory(null), energy = {}
    const call = (id: string) => cycle({request: JSON.stringify({id, prompt: `User ${id}`}), binding: binding.id, mass: {session: chat}, energy, driver, signal: AbortSignal.timeout(5000)})
    const first = await call("first")
    expect(first).toMatchObject({response: "Fixture Ollama response", error: null})
    const native = await driver.open({sessionId: first.sessionId, signal: AbortSignal.timeout(5000)})
    try {
      expect(await native.settings!({model: "fixture-b"}, AbortSignal.timeout(5000))).toMatchObject({model: "fixture-b", reasoningLevels: []})
      await expect(native.settings!({model: "not-installed"}, AbortSignal.timeout(5000))).rejects.toMatchObject({providerEffect: "not-started"})
    } finally {await native.close()}
    const second = await call("second")
    expect(second.sessionId).toBe(first.sessionId)
    expect(f.calls.filter(row => row.path === "/api/chat").map(row => row.body.model)).toEqual(["fixture-a", "fixture-b"])
    expect(f.calls.filter(row => row.path === "/api/chat")[1]!.body.messages).toMatchObject([{role: "user", content: "User first"}, {role: "assistant", content: "Fixture Ollama response"}, {role: "user", content: "User second"}])
    expect(await call("second")).toEqual(second)
    expect(f.calls.filter(row => row.path === "/api/chat")).toHaveLength(2)
    expect((await chat.readJson() as {messages: unknown[]}).messages).toHaveLength(4)
  } finally {await f.close()}
})

test("first Ollama turn honors saved model defaults; an uncertain generation blocks automatic resend", async () => {
  const f = await fixture()
  try {
    f.registry.revision = 1
    f.registry.settings = {selectedId: binding.id, configuration: {schemaVersion: 1, revision: 1, connections: [f.connection], general: {connectionId: f.connection.id, model: "fixture-b"}, types: {}},
      connectionBindings: {[f.connection.id]: binding.id}, connectionChecks: {[f.connection.id]: {status: "unknown", checkedAt: 1, message: null}}}
    const mass = {registry: memory(f.registry), turns: memory(null)}, driver = await authorizedProviderDriver(binding)
    const call = (id: string, sessionId: string | null) => turn({request: JSON.stringify({id, prompt: "Explicit prompt", sessionId, providerRef: "atom:40", expectedBinding: sessionId ? binding : null}), binding: binding.id, mass, energy: {}, self: {atom: "40"}, driver, signal: AbortSignal.timeout(5000)})
    const first = await call("first", null)
    expect(first.outcome).toBe("completed")
    expect(f.calls.find(row => row.path === "/api/chat")?.body.model).toBe("fixture-b")
    f.fail()
    expect((await call("uncertain", first.sessionId)).outcome).toBe("uncertain")
    expect((await call("uncertain", first.sessionId)).outcome).toBe("uncertain")
    expect((await call("next", first.sessionId)).outcome).toBe("uncertain")
    expect(f.calls.filter(row => row.path === "/api/chat")).toHaveLength(2)
  } finally {await f.close()}
})
