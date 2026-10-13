import {expect, test} from "bun:test"
import {GRAPH_SCHEMA, parseMetaAddress, type Graph} from "@metafor/types/metafor/graph"
import {PROVIDER_META, READ_PROVIDERS_METHOD, type ReadProvidersReceipt} from "@metafor/types/metafor/providers"
import {createProviderRegistry} from "@metafor/types/metafor/provider-validation"
import {BOUNDARY_GRAPH_PROJECTION_METHOD} from "shared/protocol/boundary/runtime"
import {ENERGY_MASS_RESULT_READ_METHOD, type EnergyMassResultReadReceipt} from "shared/protocol/metafor/observation"
import type {OracleRpcHandler} from "shared/transport/oracle"
import {DARK_DECLARATION_PROJECTION_METHOD} from "../../dark/graph/declaration"
import {GraphOracle} from "../../dark/graph/oracle"

function fixture() {
  const meta = parseMetaAddress(PROVIDER_META)!
  const graph: Graph = {schema: GRAPH_SCHEMA, root: meta, template: {
    [meta]: {name: "Provider", fields: [{key: "discoveryStatus", type: "string"}], superposition: [{name: "ready", transitions: null}],
      mass: [{key: "registry", format: "json"}, {key: "turns", format: "json"}], processes: []},
  }, runtime: {roots: [{kind: "atom", ref: "atom:7", meta, declaration: "#/template/@metafor~1provider", state: "ready", values: {discoveryStatus: "partial"},
    mass: [{ref: "mass:registry", key: "registry", format: "json", label: null, description: null, content: "lazy"},
      {ref: "mass:turns", key: "turns", format: "json", label: null, description: null, content: "lazy"}]}], reactions: []}}
  const registry = createProviderRegistry()
  const handlers = new Map<string, OracleRpcHandler>()
  const calls: Array<{target: string, method: string, params: unknown}> = []
  let invalid = false
  const peer = {expose(method: string, handler: OracleRpcHandler) {handlers.set(method, handler)}, async call<T>(target: string, method: string, params: unknown): Promise<T> {
    calls.push({target, method, params})
    if (target === "boundary" && method === BOUNDARY_GRAPH_PROJECTION_METHOD) return structuredClone({root: graph.root, runtime: graph.runtime}) as T
    if (target === "dark" && method === DARK_DECLARATION_PROJECTION_METHOD) return structuredClone({root: graph.root, template: graph.template}) as T
    if (target === "energy" && method === ENERGY_MASS_RESULT_READ_METHOD) {
      const result: EnergyMassResultReadReceipt = {contractVersion: 1, resolution: "exact", atom: {root: meta, ref: "atom:7", meta}, key: "registry",
        frontier: {cutId: "provider-fixture", throughSequence: 1, retroactiveComplete: false}, digest: `sha256:${"0".repeat(64)}`, bytes: 500,
        content: {format: "json", present: true, value: invalid ? {secret: "must-not-reflect"} : JSON.parse(JSON.stringify(registry))}}
      return result as T
    }
    throw new Error("Unexpected private operation")
  }}
  new GraphOracle().onServerStarted(peer)
  const read = async (params: unknown = {}): Promise<ReadProvidersReceipt> =>
    await handlers.get(READ_PROVIDERS_METHOD)!(params, {source: "trusted-current-root"}) as ReadProvidersReceipt
  return {read, registry, calls, handlers, invalid() {invalid = true}}
}

test("readProviders exposes one current Graph plus only fixed Provider registry Mass; changes are observed", async () => {
  const f = fixture()
  expect(f.handlers.has(READ_PROVIDERS_METHOD)).toBeTrue()
  const first = await f.read()
  expect(first).toMatchObject({schema: "metafor/providers/v1", root: PROVIDER_META, providers: [{ref: "atom:7", state: "ready", discoveryStatus: "partial",
    registry: {resolution: "exact", value: {revision: 0, entries: []}}}]})
  expect(f.calls).toHaveLength(3)
  expect(f.calls.at(-1)).toMatchObject({target: "energy", method: ENERGY_MASS_RESULT_READ_METHOD, params: {atom: {ref: "atom:7", meta: PROVIDER_META}, key: "registry", maxBytes: 1024 * 1024}})
  f.registry.revision = 1
  f.registry.discovery.issues = ["Remote Graph is unknown"]
  expect((await f.read()).providers[0]?.registry.value).toMatchObject({revision: 1, discovery: {issues: ["Remote Graph is unknown"]}})
  expect(f.calls.filter(call => call.target === "energy").every(call => (call.params as {key: string}).key === "registry")).toBeTrue()
})

test("readProviders rejects caller root/scope/Mass selection before reading any domain", async () => {
  const f = fixture()
  for (const params of [{root: PROVIDER_META}, {key: "turns"}, {ref: "atom:99"}]) await expect(f.read(params)).rejects.toThrow("must be empty")
  expect(f.calls).toEqual([])
})

test("invalid or unavailable registry is explicit unknown and never reflected as arbitrary JSON", async () => {
  const f = fixture()
  f.invalid()
  const result = await f.read()
  expect(result.providers[0]?.registry).toMatchObject({resolution: "unknown", value: null})
  expect(result.providers[0]?.registry.issues).toHaveLength(1)
  expect(JSON.stringify(result)).not.toContain("must-not-reflect")
})
