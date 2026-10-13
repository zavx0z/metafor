import {OracleRpcRemoteError} from "shared/transport/oracle"
import {expect, test} from "bun:test"
import {GRAPH_SCHEMA, parseMetaAddress, type Graph, type RuntimeAtom} from "@metafor/types/metafor/graph"
import {AGENT_OBSERVATION_SCHEMA, READ_AGENTS_METHOD} from "@metafor/types/metafor/agent-observation"
import {PROFILE_READ_METHOD, PROFILE_INTENT_METHOD, type ProfileIntentRequest} from "@metafor/types/metafor/profile-intent"
import {DARK_FORCE_HISTORY_READ_METHOD, META_FIELD_VALUE_APPLY_METHOD} from "shared/protocol/metafor/observation"
import {createAgentUiBridge} from "../server/agents"
import {parseProfileIntent} from "../../../quantum/energy/profile-intent"

const origin = "http://127.0.0.1:4444"
const root = parseMetaAddress("intel-macos-chrome-studio")!
const configuration = {id: "assistant", atom: {kind: "atom", scope: "owner"}, presentation: {kind: "agent-inspector", defaultTab: "chat", tabs: ["chat", "provider", "tools", "context"]}, tools: [], displays: []}
const local = {requestIP: () => ({address: "127.0.0.1"})}
const target = {worldIdentity: {peerId: "metafor-desktop-mac", root, cutId: "cut"}, atomRef: "atom:1" as const}
const intent: ProfileIntentRequest = {id: "open-profile-1", operation: "profile.open", target, expectedProfile: {name: "assigned-profile", saveId: "immutable-save"}}
function fixture() {
  const slot: RuntimeAtom = {kind: "atom", ref: "atom:2", meta: parseMetaAddress("@metafor/agent-slot")!, declaration: "#/template/intel-macos-chrome-studio/matter/0", state: "disconnected", mass: [], values: {enabled: false, task: null, configuration: JSON.stringify(configuration)}}
  const graph: Graph = {schema: GRAPH_SCHEMA, root, template: {
    [root]: {name: "Environment", fields: [], superposition: [{name: "ready", transitions: null}], mass: [], processes: [], matter: [{kind: "wimp", src: slot.meta}]},
    [slot.meta]: {name: "Slot", fields: [{key: "enabled", type: "boolean"}, {key: "task", type: "string"}, {key: "configuration", type: "string"}], superposition: [{name: "disconnected", transitions: null}], mass: [], processes: []},
  }, runtime: {roots: [{kind: "atom", ref: "atom:1", meta: root, declaration: "#/template/intel-macos-chrome-studio", state: "ready", mass: [], values: {}, children: [slot]}], reactions: []}}
  const frontier = {cutId: "cut", throughSequence: 12, retroactiveComplete: false}
  const calls: Array<{target: string, method: string, input: unknown}> = []
  let gate: Promise<void> | undefined, admitted = true, assigned = true, intentFailure: unknown
  const descriptor = {...target, meta: root, state: "ready", available: true, expectedProfile: intent.expectedProfile, supportedOperations: ["profile.open", "profile.save"]}
  const bridge = createAgentUiBridge({admitted: () => admitted, peer: {async call<T>(to: string, method: string, input: unknown): Promise<T> {
    calls.push({target: to, method, input})
    if (method === "readGraph") {await gate; return structuredClone(graph) as T}
    if (method === READ_AGENTS_METHOD) return {schema: AGENT_OBSERVATION_SCHEMA, version: 1, root, agents: []} as T
    if (method === DARK_FORCE_HISTORY_READ_METHOD) return {frontier} as T
    if (method === META_FIELD_VALUE_APPLY_METHOD) return {contractVersion: 1, resolution: "exact", atom: {root, ref: slot.ref, meta: slot.meta}, field: "enabled", acceptance: {cutId: "cut", sequence: 13, id: "cut:13"}, frontier: {...frontier, throughSequence: 13}} as T
    if (method === PROFILE_READ_METHOD) {if (!assigned) throw new Error("Private native path"); return {schema: "metafor/profile-targets/v1", version: 1, targets: [descriptor]} as T}
    if (method === PROFILE_INTENT_METHOD) {
      if (intentFailure) throw intentFailure
      if (!assigned) throw new Error("Private native path")
      const request = parseProfileIntent(input)
      return {schema: "metafor/profile-intent/v1", version: 1, id: request.id, operation: request.operation, target: request.target, admission: {field: "input"}} as T
    }
    throw new Error("Unexpected operation")
  }}})
  const request = (path: string, value?: unknown, source = origin) => new Request(`${origin}/agents${path}`, value === undefined ? {} : {method: "POST", headers: {Origin: source, "Content-Type": "application/json"}, body: JSON.stringify(value)})
  return {bridge, slot, graph, calls, descriptor, request, hold(value: Promise<void>) {gate = value}, revoke() {admitted = false}, unassign() {assigned = false}, failIntent(error: unknown) {intentFailure = error}}
}

test("empty workspace observes a prepared real slot and connects it by one enabled Field without a task or model", async () => {
  const f = fixture()
  try {
    const read = await f.bridge.fetch(f.request(""), local)
    expect(read.status).toBe(200)
    expect(await read.json()).toMatchObject({agents: [], connectableSlots: [{ref: "atom:2", meta: "@metafor/agent-slot", enabled: false, owner: {ref: "atom:1"}, configuration: {resolution: "exact"}}]})
    expect(f.calls.some(call => call.method === META_FIELD_VALUE_APPLY_METHOD)).toBe(false)
    const receipt = await f.bridge.fetch(f.request("/connect", {slotRef: "atom:2", enabled: true}), local)
    expect(receipt.status).toBe(202)
    expect(await receipt.json()).toMatchObject({schema: "cosmos:agents/connect/v1", slotRef: "atom:2", enabled: true, acceptance: "admitted"})
    expect(f.calls.filter(call => call.method === META_FIELD_VALUE_APPLY_METHOD)).toEqual([{target: "dark", method: META_FIELD_VALUE_APPLY_METHOD, input: {contractVersion: 1, atom: {root, ref: "atom:2", meta: "@metafor/agent-slot"}, field: "enabled", value: true, expectedFrontier: {cutId: "cut", throughSequence: 12, retroactiveComplete: false}}}])
    f.slot.values.enabled = true
    expect(await (await f.bridge.fetch(f.request("/connect", {slotRef: "atom:2", enabled: true}), local)).json()).toMatchObject({acceptance: "observed"})
    expect(f.calls.filter(call => call.method === META_FIELD_VALUE_APPLY_METHOD)).toHaveLength(1)
  } finally {f.bridge.close()}
})

test("connection rejects raw writes, wrong Meta, origin, undeclared Field and concurrent duplicate admission", async () => {
  const f = fixture()
  try {
    for (const value of [{slotRef: "atom:2", enabled: false}, {slotRef: "atom:2", enabled: true, field: "task"}, {slotRef: "atom:1", enabled: true}]) expect((await f.bridge.fetch(f.request("/connect", value), local)).status).toBe(400)
    expect((await f.bridge.fetch(f.request("/connect", {slotRef: "atom:2", enabled: true}, "http://outsider"), local)).status).toBe(403)
    const gate = Promise.withResolvers<void>()
    f.hold(gate.promise)
    const first = f.bridge.fetch(f.request("/connect", {slotRef: "atom:2", enabled: true}), local)
    await Bun.sleep(0)
    expect((await f.bridge.fetch(f.request("/connect", {slotRef: "atom:2", enabled: true}), local)).status).toBe(409)
    gate.resolve()
    expect((await first).status).toBe(202)
    delete f.graph.template[parseMetaAddress("@metafor/agent-slot")!]
    expect((await f.bridge.fetch(f.request("/connect", {slotRef: "atom:2", enabled: true}), local)).status).toBe(400)
  } finally {f.bridge.close()}
})

test("profile bridge forwards only named Energy operations and returns admission separately from native completion", async () => {
  const f = fixture()
  try {
    expect(await (await f.bridge.fetch(f.request("/profile"), local)).json()).toMatchObject({schema: "metafor/profile-targets/v1", targets: [{atomRef: "atom:1", expectedProfile: {name: "assigned-profile"}}]})
    const response = await f.bridge.fetch(f.request("/profile", intent), local)
    expect(response.status).toBe(202)
    expect(await response.json()).toMatchObject({schema: "metafor/profile-intent/v1", id: intent.id, admission: {field: "input"}})
    expect(f.calls.filter(call => call.method === PROFILE_INTENT_METHOD)).toEqual([{target: "energy", method: PROFILE_INTENT_METHOD, input: intent}])
    const invalid = await f.bridge.fetch(f.request("/profile", {...intent, field: "arbitrary"}), local)
    expect(invalid.ok).toBe(false)
    expect(JSON.stringify(await invalid.json())).not.toContain("Private")
    f.unassign()
    const unavailable = await f.bridge.fetch(f.request("/profile"), local)
    expect(unavailable.status).toBe(503)
    expect(JSON.stringify(await unavailable.json())).not.toContain("native path")
    f.revoke()
    expect((await f.bridge.fetch(f.request("/profile", intent), local)).status).toBe(503)
  } finally {f.bridge.close()}
})

test("profile HTTP distinguishes proven typed non-admission from unknown transport outcomes without retry", async () => {
  const f = fixture()
  const refusal = {schema: "metafor/profile-intent-refusal/v1", version: 1, id: intent.id, operation: intent.operation, target: intent.target, reason: "precondition"}
  try {
    f.failIntent(new OracleRpcRemoteError("admission_refused", "Assigned profile changed; refresh before another explicit request", refusal))
    const known = await f.bridge.fetch(f.request("/profile", intent), local)
    expect(known.status).toBe(409)
    expect(await known.json()).toMatchObject({error: {code: "profile_not_admitted", message: "Assigned profile changed; refresh before another explicit request"}})
    for (const error of [
      new OracleRpcRemoteError("transport_error", "Private transport path", refusal),
      new OracleRpcRemoteError("method_error", "Profile not admitted", refusal),
      new OracleRpcRemoteError("admission_refused", "Private invalid receipt", {...refusal, extra: true}),
      new Error("Profile not admitted"),
    ]) {
      f.failIntent(error)
      const uncertain = await f.bridge.fetch(f.request("/profile", intent), local)
      expect(uncertain.status).toBe(503)
      expect(await uncertain.json()).toEqual({error: {code: "world_unavailable", message: "The current agent world is unavailable"}})
    }
    await Bun.sleep(0)
    expect(f.calls.filter(call => call.method === PROFILE_INTENT_METHOD)).toHaveLength(5)
  } finally {f.bridge.close()}
})
