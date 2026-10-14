import {expect, test} from "bun:test"
import {READ_GRAPH_DELTA_METHOD, type RuntimeAtom} from "@metafor/types/metafor/graph"
import {OracleRpcRemoteError} from "shared/transport/oracle"
import {META_FIELD_VALUE_APPLY_METHOD, type MetaCausalFrontier, type MetaFieldValueApplyReceipt, type ReadGraphDeltaReceipt} from "shared/protocol/metafor/observation"
import {createAtomFieldBridge} from "../server/atom-fields"
import type {AtomFieldEditRequest} from "../shared/atom-fields"
import {beginAtomFieldEdit} from "../shared/atom-fields"
import {agentWorkspaceGraph} from "./agent-graph-fixture"

function fixture() {
  const graph = agentWorkspaceGraph()
  const root = graph.runtime.roots[0] as RuntimeAtom
  graph.template[root.meta]!.fields.push({key: "enabled", type: "boolean", required: true, default: false},
    {key: "count", type: "number"}, {key: "input", type: "string"}, {key: "profileName", type: "string"},
    {key: "mode", type: "enum", values: ["idle", "active"]}, {key: "items", type: "array"})
  Object.assign(root.values, {enabled: false, count: null, input: null, profileName: null, mode: "idle", items: [1]})
  const frontier: MetaCausalFrontier = {cutId: "field-fixture", throughSequence: 12, retroactiveComplete: false}
  let admitted = true, gate: Promise<void> | undefined, failure: unknown, invalidReceipt = false, unavailable = false
  const calls: Array<{target: string; method: string; input: unknown}> = []
  const bridge = createAtomFieldBridge({admitted: () => admitted, peer: {async call<T>(target: string, method: string, input: unknown): Promise<T> {
    calls.push({target, method, input})
    if (method === READ_GRAPH_DELTA_METHOD) {
      await gate
      const receipt: ReadGraphDeltaReceipt = unavailable ? {contractVersion: 1, kind: "unavailable", resolution: "unknown", reason: "baseline-unresolved"} :
        {contractVersion: 1, kind: "snapshot", reason: "initial", resolution: "exact", snapshot: {identity: {root: graph.root, digest: `sha256:${"a".repeat(64)}`, frontier}, graph}}
      return structuredClone(receipt) as T
    }
    if (method === META_FIELD_VALUE_APPLY_METHOD) {
      if (failure) throw failure
      const request = input as {atom: MetaFieldValueApplyReceipt["atom"]; field: string}
      const receipt: MetaFieldValueApplyReceipt = {contractVersion: 1, resolution: "exact", atom: request.atom, field: request.field,
        acceptance: {cutId: frontier.cutId, sequence: frontier.throughSequence + 1, id: `${frontier.cutId}:${frontier.throughSequence + 1}`}, frontier: {...frontier, throughSequence: frontier.throughSequence + 1}}
      if (invalidReceipt) receipt.atom = {...request.atom, ref: "atom:999"}
      return receipt as T
    }
    throw Error("Unexpected operation")
  }}})
  const request = (field = "title", value: AtomFieldEditRequest["value"] = "Edited"): AtomFieldEditRequest => ({atomRef: root.ref, field, value,
    expectedValue: root.values[field] as AtomFieldEditRequest["expectedValue"], expectedFrontier: {...frontier}})
  return {bridge, graph, root, calls, frontier, request, revoke() {admitted = false}, hold(promise: Promise<void>) {gate = promise},
    fail(error: unknown) {failure = error}, corruptReceipt() {invalidReceipt = true}, unknownBaseline() {unavailable = true}}
}

test("one declared Field of a selected Atom uses coherent public observation and one guarded Force input", async () => {
  const f = fixture()
  const result = await f.bridge.editField(f.request("profileName", "qwen-cdp"))
  expect(result).toMatchObject({schema: "cosmos:atom-field-edit/v1", atomRef: "atom:1", field: "profileName", value: "qwen-cdp", acceptance: "admitted"})
  expect(f.calls.map(call => call.method)).toEqual([READ_GRAPH_DELTA_METHOD, META_FIELD_VALUE_APPLY_METHOD])
  expect(f.calls[0]).toEqual({target: "dark", method: READ_GRAPH_DELTA_METHOD, input: {contractVersion: 1, base: null}})
  expect(f.calls[1]!.input).toEqual({contractVersion: 1, atom: {root: f.graph.root, ref: f.root.ref, meta: f.root.meta},
    field: "profileName", value: "qwen-cdp", expectedFrontier: f.frontier})
  expect(f.root.values.profileName).toBeNull()
})

test("typed primitive Fields accept declared values and optional null without inventing Process execution", async () => {
  for (const [field, value] of [["enabled", true], ["count", 3.5], ["title", null], ["input", "started"]] as const) {
    const f = fixture()
    expect((await f.bridge.editField(f.request(field, value))).acceptance).toBe("admitted")
    expect(f.calls.filter(call => call.method === META_FIELD_VALUE_APPLY_METHOD)).toHaveLength(1)
  }
  const f = fixture()
  expect(await f.bridge.editField(f.request("title", "Fixture"))).toMatchObject({acceptance: "observed", receipt: null})
  expect(f.calls.filter(call => call.method === META_FIELD_VALUE_APPLY_METHOD)).toHaveLength(0)
})

test("undeclared, topology, mismatched and malformed inputs never reach Force", async () => {
  const cases = [
    (f: ReturnType<typeof fixture>) => f.request("enabled", null),
    (f: ReturnType<typeof fixture>) => f.request("enabled", "true"),
    (f: ReturnType<typeof fixture>) => ({...f.request(), atomRef: "topology:1"}),
    (f: ReturnType<typeof fixture>) => ({...f.request(), atomRef: "atom:999"}),
    (f: ReturnType<typeof fixture>) => ({...f.request(), field: "missing"}),
    (f: ReturnType<typeof fixture>) => ({...f.request(), value: Number.NaN}),
    (f: ReturnType<typeof fixture>) => ({...f.request(), value: {request: "start"}}),
    (f: ReturnType<typeof fixture>) => ({...f.request(), extra: true}),
    (f: ReturnType<typeof fixture>) => f.request("mode", "active"),
    (f: ReturnType<typeof fixture>) => ({...f.request(), field: "items", value: null}),
  ]
  for (const make of cases) {
    const f = fixture()
    await expect(f.bridge.editField(make(f))).rejects.toMatchObject({status: 400})
    expect(f.calls.some(call => call.method === META_FIELD_VALUE_APPLY_METHOD)).toBe(false)
  }
})

test("a draft retains its original expected value while unrelated same-cut progress uses fresh Force frontier", async () => {
  const f = fixture(), input = {atomRef: f.root.ref, field: "title", value: "Fixture", frontier: {...f.frontier}}
  const draft = beginAtomFieldEdit(input)
  input.value = "Changed UI observation"
  input.frontier.throughSequence = 99
  const alteredRequest = draft.request("Discarded")
  alteredRequest.expectedFrontier.throughSequence = 100
  f.frontier.throughSequence = 20
  f.root.values.enabled = true
  const request = draft.request("Edited")
  expect(request.expectedValue).toBe("Fixture")
  expect(request.expectedFrontier.throughSequence).toBe(12)
  expect((await f.bridge.editField(request)).acceptance).toBe("admitted")
  expect(f.calls[1]!.input).toMatchObject({value: "Edited", expectedFrontier: {cutId: "field-fixture", throughSequence: 20}})
})

test("changed value, future frontier and changed cut are explicit conflicts without retrying admission", async () => {
  for (const change of [
    (request: AtomFieldEditRequest) => {request.expectedValue = "Old"},
    (request: AtomFieldEditRequest) => {request.expectedFrontier.throughSequence++},
    (request: AtomFieldEditRequest) => {request.expectedFrontier.cutId = "other-world"},
  ]) {
    const f = fixture(), request = f.request()
    change(request)
    await expect(f.bridge.editField(request)).rejects.toMatchObject({status: 409, code: "conflict"})
    expect(f.calls).toHaveLength(1)
  }
})

test("typed non-admission differs from transport uncertainty and neither causes automatic repetition", async () => {
  const refusal = {schema: "metafor/field-admission-refusal/v1", contractVersion: 1, reason: "frontier_mismatch"}
  for (const [error, code] of [
    [new OracleRpcRemoteError("admission_refused", "Private path", refusal), "field_not_admitted"],
    [new OracleRpcRemoteError("transport_error", "Private path", refusal), "admission_unknown"],
    [new OracleRpcRemoteError("admission_refused", "Private path", {...refusal, extra: true}), "admission_unknown"],
    [Error("Private path"), "admission_unknown"],
  ] as const) {
    const f = fixture()
    f.fail(error)
    try {await f.bridge.editField(f.request()); throw Error("Expected refusal")}
    catch (failure) {expect(failure).toMatchObject({code}); expect(String(failure)).not.toContain("Private path")}
    expect(f.calls.filter(call => call.method === META_FIELD_VALUE_APPLY_METHOD)).toHaveLength(1)
  }
  const f = fixture()
  f.corruptReceipt()
  await expect(f.bridge.editField(f.request())).rejects.toMatchObject({code: "admission_unknown"})
  expect(f.calls.filter(call => call.method === META_FIELD_VALUE_APPLY_METHOD)).toHaveLength(1)
})

test("unresolved or invalid Graph and revoked admission fail before any Field effect", async () => {
  for (const configure of [
    (f: ReturnType<typeof fixture>) => f.unknownBaseline(),
    (f: ReturnType<typeof fixture>) => {delete f.graph.template[f.root.meta]},
    (f: ReturnType<typeof fixture>) => f.revoke(),
    (f: ReturnType<typeof fixture>) => f.bridge.close(),
  ]) {
    const f = fixture()
    configure(f)
    await expect(f.bridge.editField(f.request())).rejects.toMatchObject({code: "world_unavailable"})
    expect(f.calls.some(call => call.method === META_FIELD_VALUE_APPLY_METHOD)).toBe(false)
  }
  const f = fixture(), gate = Promise.withResolvers<void>()
  f.hold(gate.promise)
  const pending = f.bridge.editField(f.request())
  f.revoke()
  gate.resolve()
  await expect(pending).rejects.toMatchObject({code: "world_unavailable"})
  expect(f.calls.some(call => call.method === META_FIELD_VALUE_APPLY_METHOD)).toBe(false)
})

test("concurrent duplicate edit is rejected while the first observation is in flight", async () => {
  const f = fixture(), gate = Promise.withResolvers<void>()
  f.hold(gate.promise)
  const first = f.bridge.editField(f.request())
  await expect(f.bridge.editField(f.request())).rejects.toMatchObject({code: "busy"})
  gate.resolve()
  expect((await first).acceptance).toBe("admitted")
  expect(f.calls.filter(call => call.method === META_FIELD_VALUE_APPLY_METHOD)).toHaveLength(1)
})
