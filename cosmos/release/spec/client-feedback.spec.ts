import {expect, test} from "bun:test"
import {createClientFeedbackBridge} from "../server/client-feedback"
import {READ_GRAPH_METHOD, GRAPH_SCHEMA, parseMetaAddress, type Graph, type RuntimeAtom} from "@metafor/types/metafor/graph"
import {DARK_FORCE_HISTORY_READ_METHOD, META_FIELD_VALUE_APPLY_METHOD} from "shared/protocol/metafor/observation"
import type {ClientAnnotationFeedback} from "@metafor/types/cosmos/client"

const waitFor = async (condition: () => boolean) => {for (let i = 0; i < 100; i++) {if (condition()) return; await Bun.sleep(2)}; throw new Error("feedback fixture timed out")}
function fixture(timeoutMs?: number) {
  const root = parseMetaAddress("@metafor/environment")!
  const agent: RuntimeAtom = {kind: "atom", ref: "atom:2", meta: parseMetaAddress("@metafor/agent")!, declaration: "#/template/agent", state: "idle", mass: [],
    values: {feedbackRequest: null, feedbackAck: false, feedbackAckId: "", feedbackResponse: null, feedbackError: null, feedbackLastRequest: null}}
  const graph: Graph = {schema: GRAPH_SCHEMA, root, template: {}, runtime: {roots: [agent], reactions: []}}
  let cutId = "cut-1"
  const writes: string[] = []
  const lifetime = new AbortController()
  const peer = {async call<T>(_target: string, method: string, params: unknown): Promise<T> {
    if (method === READ_GRAPH_METHOD) return structuredClone(graph) as T
    if (method === DARK_FORCE_HISTORY_READ_METHOD) return {frontier: {cutId, throughSequence: 1, retroactiveComplete: false}} as T
    if (method === META_FIELD_VALUE_APPLY_METHOD) {const input = params as {atom: {ref: string}, field: string, value: string}; expect(input.atom.ref).toBe("atom:2"); expect(input.field).toBe("feedbackRequest"); agent.values.feedbackRequest = input.value; writes.push(input.value); return {} as T}
    throw new Error("unexpected public Oracle call")
  }}
  const accept = createClientFeedbackBridge({peer, admitted: () => true, signal: lifetime.signal, pollMs: 1, ...(timeoutMs === undefined ? {} : {timeoutMs})})
  const input = (id = "feedback-1", text = "service-data"): ClientAnnotationFeedback => ({agentRef: "atom:2", world: {root, cutId: "cut-1"}, request: {id, text, correlation: {clientId: "client-1", connectionId: "connection-1", annotationId: "semantic:1"}}})
  const ack = (encoded = writes.at(-1)!) => {const request = JSON.parse(encoded); Object.assign(agent.values, {feedbackRequest: null, feedbackAck: true, feedbackAckId: request.id,
    feedbackResponse: JSON.stringify({id: request.id, accepted: true, replayed: false}), feedbackError: null, feedbackLastRequest: encoded})}
  return {accept, input, writes, ack, agent, changeWorld() {cutId = "cut-2"}, close() {lifetime.abort()}}
}

test("per-Agent FIFO waits durable ack before writing another event; duplicate is coalesced and conflicting payload refuses", async () => {
  const f = fixture()
  try {
    const first = f.accept(f.input())
    const duplicate = f.accept(f.input())
    const conflict = f.accept(f.input("feedback-1", "changed"))
    await expect(conflict).rejects.toThrow("immutable payload")
    const second = f.accept(f.input("feedback-2"))
    await waitFor(() => f.writes.length === 1)
    await Bun.sleep(5)
    expect(f.writes).toHaveLength(1)
    f.ack()
    expect(await first).toMatchObject({id: "feedback-1", accepted: true})
    expect(await duplicate).toMatchObject({id: "feedback-1", accepted: true, replayed: true})
    await waitFor(() => f.writes.length === 2)
    f.ack()
    expect(await second).toMatchObject({id: "feedback-2", accepted: true})
  } finally {f.close()}
})

test("restored durable ack replays without Field write; another payload conflicts and pinned world never retargets", async () => {
  const f = fixture()
  try {
    f.ack(JSON.stringify(f.input().request))
    expect(await f.accept(f.input())).toMatchObject({replayed: true})
    expect(f.writes).toHaveLength(0)
    const fresh = createClientFeedbackBridge({peer: {async call<T>(_target: string, method: string) {return (method === READ_GRAPH_METHOD ? {root: "@metafor/environment", runtime: {roots: [f.agent]}} : {frontier: {cutId: "cut-1"}}) as T}}, admitted: () => true, signal: new AbortController().signal})
    await expect(fresh(f.input("feedback-1", "other"))).rejects.toThrow("immutable payload")
    expect(await fresh(f.input())).toMatchObject({accepted: true, replayed: true})
    f.changeWorld()
    await expect(f.accept(f.input("feedback-3"))).rejects.toThrow("Pinned feedback world changed")
    expect(f.writes).toHaveLength(0)
  } finally {f.close()}
})

test("missing durable acknowledgement stops polling without repeating its accepted Field write", async () => {
  const f = fixture(25)
  try {
    await expect(f.accept(f.input())).rejects.toThrow("accepted outcome may be unknown")
    expect(f.writes).toHaveLength(1)
    await Bun.sleep(10)
    expect(f.writes).toHaveLength(1)
  } finally {f.close()}
})
