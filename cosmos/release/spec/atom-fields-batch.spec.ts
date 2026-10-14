import {expect, test} from "bun:test"
import {READ_GRAPH_DELTA_METHOD} from "@metafor/types/metafor/graph"
import {OracleRpcRemoteError} from "shared/transport/oracle"
import {META_FIELDS_VALUE_APPLY_METHOD, validateMetaFieldsValueApplyRequest, type MetaCausalFrontier, type MetaFieldsValueApplyReceipt, type ReadGraphDeltaReceipt} from "shared/protocol/metafor/observation"
import {createAgentUiBridge} from "../server/agents"
import {ATOM_FIELDS_EDIT_PATH, type AtomFieldsEditRequest} from "../shared/atom-fields"
import {agentWorkspaceGraph} from "./agent-graph-fixture"

type Confirmation = "committed" | "stale" | "unavailable" | "refused"

function fixture(confirmation: Confirmation = "committed") {
  const graph = agentWorkspaceGraph()
  const atom = graph.runtime.roots[0]!
  if (atom.kind !== "atom") throw new Error("Fixture должна содержать корневой Atom")
  graph.template[atom.meta]!.fields.push({key: "enabled", type: "boolean", required: true, default: false})
  atom.values.enabled = false
  const frontier: MetaCausalFrontier = {cutId: "batch-fixture", throughSequence: 12, retroactiveComplete: false}
  const calls: Array<{target: string; method: string; input: unknown}> = []
  let reads = 0
  const bridge = createAgentUiBridge({peer: {async call<T>(target: string, method: string, input: unknown): Promise<T> {
    calls.push({target, method, input: structuredClone(input)})
    if (method === READ_GRAPH_DELTA_METHOD) {
      reads++
      let receipt: ReadGraphDeltaReceipt
      if (reads > 1 && confirmation === "unavailable") {
        receipt = {contractVersion: 1, kind: "unavailable", resolution: "unknown", reason: "baseline-unresolved"}
      } else {
        const observed = structuredClone(graph)
        const progressed = reads > 1 && confirmation === "committed"
        if (progressed) {
          // Process уже завершил следующий такт после сохранённого набора.
          const current = observed.runtime.roots[0]!
          if (current.kind !== "atom") throw new Error("Fixture Atom отсутствует")
          current.values.title = "Результат следующего Process"
          current.values.enabled = false
        }
        receipt = {contractVersion: 1, kind: "snapshot", reason: "initial", resolution: "exact",
          snapshot: {graph: observed, identity: {root: graph.root, digest: `sha256:${"a".repeat(64)}`,
            frontier: {...frontier, throughSequence: progressed ? 14 : 12}}}}
      }
      return receipt as T
    }
    if (method === META_FIELDS_VALUE_APPLY_METHOD) {
      if (confirmation === "refused") throw new OracleRpcRemoteError("admission_refused", "Private failure", {
        schema: "metafor/fields-admission-refusal/v1", contractVersion: 1, reason: "value_mismatch", fields: ["enabled"],
      })
      const checked = validateMetaFieldsValueApplyRequest(input)
      if (!checked.ok) throw new Error("Bridge передал неверный public request")
      const receipt: MetaFieldsValueApplyReceipt = {contractVersion: 1, resolution: "exact", atom: checked.value.atom,
        fields: checked.value.updates.map(update => update.field),
        acceptance: {cutId: frontier.cutId, sequence: 13, id: `${frontier.cutId}:13`},
        frontier: {...frontier, throughSequence: 13}}
      return receipt as T
    }
    throw new Error(`Неожиданный RPC ${method}`)
  }}})
  const request: AtomFieldsEditRequest = {atomRef: atom.ref, expectedFrontier: {...frontier}, updates: [
    {field: "title", value: "Сохранённый заголовок", expectedValue: "Fixture"},
    {field: "enabled", value: true, expectedValue: false},
  ]}
  const post = async (body: unknown = request) => {
    const origin = "http://127.0.0.1:4444"
    const response = await bridge.fetch(new Request(origin + ATOM_FIELDS_EDIT_PATH, {method: "POST",
      headers: {origin, "content-type": "application/json"}, body: JSON.stringify(body)}),
    {requestIP: () => ({address: "127.0.0.1"})})
    return {status: response.status, body: await response.json()}
  }
  return {bridge, graph, atom, calls, request, post}
}

test("HTTP сохраняет весь набор одним causal apply и сообщает commit только после coherent read", async () => {
  const fixtures: ReturnType<typeof fixture>[] = []
  const make = (confirmation?: Confirmation) => {
    const value = fixture(confirmation)
    fixtures.push(value)
    return value
  }
  try {
    const accepted = make()
    const success = await accepted.post()
    expect({status: success.status, committed: success.body.committed, fields: success.body.fields,
      observed: success.body.observedFrontier.throughSequence, acceptance: success.body.receipt.acceptance.sequence,
      methods: accepted.calls.map(call => call.method), apply: accepted.calls[1]!.input}).toEqual({
      status: 200, committed: true, fields: ["title", "enabled"], observed: 14, acceptance: 13,
      methods: [READ_GRAPH_DELTA_METHOD, META_FIELDS_VALUE_APPLY_METHOD, READ_GRAPH_DELTA_METHOD],
      apply: {contractVersion: 1, atom: {root: accepted.graph.root, ref: accepted.atom.ref, meta: accepted.atom.meta},
        updates: accepted.request.updates, expectedFrontier: accepted.request.expectedFrontier},
    })

    const stale = make("stale")
    const staleResponse = await stale.post()
    expect({status: staleResponse.status, committed: staleResponse.body.committed,
      error: staleResponse.body.error.code, effects: stale.calls.filter(call => call.method === META_FIELDS_VALUE_APPLY_METHOD).length})
      .toEqual({status: 503, committed: undefined, error: "admission_unknown", effects: 1})

    const unavailable = make("unavailable")
    const unavailableResponse = await unavailable.post()
    expect({status: unavailableResponse.status, committed: unavailableResponse.body.committed,
      effects: unavailable.calls.filter(call => call.method === META_FIELDS_VALUE_APPLY_METHOD).length})
      .toEqual({status: 503, committed: undefined, effects: 1})

    const invalid = make()
    const invalidResponse = await invalid.post({...invalid.request, updates: [invalid.request.updates[0],
      {field: "enabled", value: "true", expectedValue: false}]})
    expect({status: invalidResponse.status, committed: invalidResponse.body.committed, error: invalidResponse.body.error.code,
      effects: invalid.calls.filter(call => call.method === META_FIELDS_VALUE_APPLY_METHOD).length})
      .toEqual({status: 400, committed: undefined, error: "invalid_request", effects: 0})

    const refused = make("refused")
    const refusedResponse = await refused.post()
    expect({status: refusedResponse.status, committed: refusedResponse.body.committed, error: refusedResponse.body.error.code,
      methods: refused.calls.map(call => call.method), batch: refused.calls[1]!.input,
      values: refused.atom.values}).toEqual({status: 409, committed: undefined, error: "field_not_admitted",
      methods: [READ_GRAPH_DELTA_METHOD, META_FIELDS_VALUE_APPLY_METHOD], batch: accepted.calls[1]!.input,
      values: {title: "Fixture", enabled: false}})
  } finally {
    for (const value of fixtures) value.bridge.close()
  }
})
