import {expect, test} from "bun:test"
import {mkdtemp, writeFile, rm, access} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {parseMetaAddress, type RuntimeAtom} from "@metafor/types/metafor/graph"
import {createProviderRegistry} from "@metafor/types/metafor/provider-validation"
import discover from "../../../standard/provider/discover"
import {createAgentUiBridge} from "../server/agents"
import {agentWorkspaceGraph} from "./agent-graph-fixture"
import {DARK_FORCE_HISTORY_READ_METHOD, ENERGY_MASS_RESULT_READ_METHOD, META_FIELD_VALUE_APPLY_METHOD} from "shared/protocol/metafor/observation"

const origin = "http://127.0.0.1:4444", host = {requestIP: () => ({address: "127.0.0.1"})}

test("Ollama settings save/check use canonical Provider Mass; independent actual catalog uses only assigned metadata without a Chat session", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cosmos-ollama-")), native = join(directory, "native")
  const old = process.env.ORACLE_AGENT_PROVIDER_CONFIG
  const requests: string[] = []
  let empty = false, writes = 0
  const ollama = Bun.serve({hostname: "127.0.0.1", port: 0, async fetch(request) {
    const path = new URL(request.url).pathname
    requests.push(path)
    if (path === "/api/tags") return Response.json({models: empty ? [] : [{name: "fixture-model", capabilities: ["completion"]}]})
    if (path === "/api/show") return Response.json({capabilities: ["completion"], model_info: {"fixture.context_length": 8192}, thinking: {values: ["low", "high"], default: "low"}})
    return new Response("Generation must not occur in settings", {status: 500})
  }})
  const path = join(directory, "authority.json")
  await writeFile(path, JSON.stringify({version: 1, hosts: {}, bindings: {}, ollama: {url: ollama.url.origin, directory: native}}), {mode: 0o600})
  process.env.ORACLE_AGENT_PROVIDER_CONFIG = path
  const graph = agentWorkspaceGraph(), owner = graph.runtime.roots[0]!.children![1] as RuntimeAtom
  owner.meta = parseMetaAddress("@metafor/provider")!
  owner.state = "ready"
  owner.values = {registryMode: "owner", discoveryRequest: null}
  owner.mass = [{key: "registry", ref: "mass:registry", format: "json", label: null, description: null, content: "lazy"}]
  graph.template[owner.meta] = {name: "Provider", fields: [{key: "discoveryRequest", type: "string"}], superposition: [], processes: [], mass: []}
  let registry = createProviderRegistry()
  const bridge = createAgentUiBridge({peer: {async call<T>(_target: string, method: string, params: any): Promise<T> {
    if (method === "readGraph") return structuredClone(graph) as T
    if (method === DARK_FORCE_HISTORY_READ_METHOD) return {frontier: {cutId: "cut", throughSequence: 1, retroactiveComplete: false}} as T
    if (method === ENERGY_MASS_RESULT_READ_METHOD) return {atom: {root: graph.root, ref: owner.ref, meta: owner.meta}, key: "registry", resolution: "exact", bytes: 100,
      content: {format: "json", present: true, value: structuredClone(registry)}} as T
    if (method === META_FIELD_VALUE_APPLY_METHOD) {
      expect(params.field).toBe("discoveryRequest")
      const result = await discover({request: params.value, self: {atom: "4"}, signal: AbortSignal.timeout(5000), mass: {registry: {async readText() {return JSON.stringify(registry)}, async write(value) {writes++; registry = value as typeof registry}}}})
      Object.assign(owner.values, result)
      return {} as T
    }
    throw new Error(`Unexpected ${method}`)
  }}})
  const post = (value: object, source = origin) => bridge.fetch(new Request(`${origin}/agents/connections`, {method: "POST", headers: {Origin: source, "Content-Type": "application/json"}, body: JSON.stringify({providerRef: owner.ref, ...value})}), host)
  const settings = {schemaVersion: 1, revision: 0, connections: [{id: "local-ui-ollama", provider: "ollama", label: "Local", enabled: true, endpoint: {url: ollama.url.origin}}], general: {connectionId: "local-ui-ollama"}, types: {}}
  try {
    expect((await post({configure: settings})).status).toBe(200)
    expect(requests).toEqual([])
    expect((await post({options: {connectionId: "local-ui-ollama"}})).status).toBe(409)
    expect((await post({check: "local-ui-ollama"})).status).toBe(200)
    const count = writes
    const response = await post({options: {connectionId: "local-ui-ollama"}})
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({options: {model: "fixture-model", models: [{id: "fixture-model", label: "fixture-model"}], reasoningLevels: [{id: "default"}, {id: "low"}, {id: "high"}]}})
    expect(writes).toBe(count)
    await expect(access(native)).rejects.toBeDefined()
    expect((await post({options: {connectionId: "local-ui-ollama", model: "not-installed"}})).status).toBe(409)
    expect((await post({options: {connectionId: "local-ui-ollama", url: "http://foreign.invalid"}})).status).toBe(400)
    expect((await post({options: {connectionId: "local-ui-ollama"}}, "https://outsider.invalid")).status).toBe(403)
    empty = true
    const unavailable = await post({options: {connectionId: "local-ui-ollama"}})
    expect(unavailable.status).toBe(409)
    expect(await unavailable.json()).toMatchObject({error: {message: expect.stringContaining("установленные модели")}})
    expect(requests.every(path => path === "/api/tags" || path === "/api/show")).toBe(true)
  } finally {bridge.close(); ollama.stop(true); if (old === undefined) delete process.env.ORACLE_AGENT_PROVIDER_CONFIG; else process.env.ORACLE_AGENT_PROVIDER_CONFIG = old; await rm(directory, {recursive: true, force: true})}
})
