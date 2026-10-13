import "@metafor/dsl"
import {expect, test} from "bun:test"
import type {MassHandle} from "@metafor/types/metafor/mass"
import type {AgentFeedbackRequest} from "@metafor/types/metafor/agents"
import type {ProviderDriver, ProviderEnergy} from "@metafor/provider/runtime-types"
import {feedback, default as send, receive} from "../send"
import {readChatSession} from "../session"
import cycle from "./fixture/cycle"
import meta from "../meta"

const memory = () => {
  let text = "", writes = 0
  const handle: MassHandle = {async readText() {return text}, async readJson() {return text ? JSON.parse(text) : null}, async readBytes() {return new TextEncoder().encode(text)}, async write(value) {writes++; text = JSON.stringify(value)}}
  return {handle, text: () => text, writes: () => writes}
}
const request = (id = "annotation-1", text = JSON.stringify({kind: "ui.annotation.selected", annotation: {semanticRef: "/document/field", text: "Наблюдаемый узел"}})): AgentFeedbackRequest =>
  ({id, text, correlation: {clientId: "window-one", connectionId: "original-connection", annotationId: "/document/field"}})
const signal = () => new AbortController().signal
const record = (handle: MassHandle, value: AgentFeedbackRequest) => feedback({request: JSON.stringify(value), mass: {session: handle}, signal: signal()})

test("service feedback acknowledges only persisted Mass, dedupes immutable original correlation and changes no Chat request", async () => {
  const mass = memory(), value = request()
  const first = await record(mass.handle, value)
  expect(JSON.parse(first.feedbackResponse!)).toEqual({id: value.id, accepted: true, replayed: false})
  expect(first.feedbackRequest).toBe(null); expect(first.feedbackAckId).toBe(value.id)
  expect(Object.keys(first).sort()).toEqual(["feedbackAck", "feedbackAckId", "feedbackError", "feedbackLastRequest", "feedbackRequest", "feedbackResponse"])
  const session = await readChatSession(mass.handle)
  expect(session.requests).toEqual([]); expect(session.messages).toEqual([]); expect(session.sessionId).toBe(null)
  expect(session.feedback).toEqual([{...value, role: "service", includedIn: null}])
  expect(mass.writes()).toBe(1)
  expect(JSON.parse((await record(mass.handle, value)).feedbackResponse!)).toEqual({id: value.id, accepted: true, replayed: true})
  expect(mass.writes()).toBe(1)
  expect((await record(mass.handle, {...value, text: "changed"})).feedbackError).toContain("immutable payload")
  expect((await record(mass.handle, {...value, correlation: {...value.correlation, connectionId: "replacement"}})).feedbackError).toContain("immutable payload")
  expect((await record(mass.handle, value)).feedbackError).toBe(null)
  expect((await readChatSession(mass.handle)).feedback).toHaveLength(1)
})

test("next requested model turn includes service observations once and preserves literal user transcript and session", async () => {
  const mass = memory(), prompts: string[] = [], sessions: (string | null)[] = [], energy: ProviderEnergy = {}
  const driver: ProviderDriver = {async open({sessionId}) {sessions.push(sessionId); return {sessionId: sessionId ?? "retained-native-session", async prompt(prompt) {prompts.push(prompt); return "Модель ответила"}, async close() {}}}}
  await record(mass.handle, request())
  expect(prompts).toEqual([])
  const call = (id: string, prompt: string) => cycle({request: JSON.stringify({id, prompt}), mass: {session: mass.handle}, energy, driver, signal: signal()})
  expect((await call("turn-1", "Исходная задача")).error).toBe(null)
  expect(prompts[0]!.startsWith("Исходная задача\n\n<metafor-service-observations>")).toBe(true)
  expect(prompts[0]).toContain('"authorization":"none"')
  expect(prompts[0]).toContain('"role":"service"')
  expect(prompts[0]).toContain("original-connection")
  expect((await call("turn-2", "Следующая задача")).error).toBe(null)
  expect(prompts[1]).toBe("Следующая задача")
  expect(sessions).toEqual([null, "retained-native-session"])
  const stored = await readChatSession(mass.handle)
  expect(stored.feedback![0]!.includedIn).toBe("turn-1")
  expect(stored.messages[0]).toEqual({requestId: "turn-1", role: "user", content: "Исходная задача"})
  expect(stored.requests[0]!.prompt).toBe("Исходная задача")
  expect((await call("turn-1", "Исходная задача")).response).toBe("Модель ответила")
  expect(prompts).toHaveLength(2)
})

test("feedback during pending model turn is saved for next turn and proven not-sent releases reserved observations", async () => {
  const mass = memory(), original = request()
  await record(mass.handle, original)
  const sending = {request: JSON.stringify({id: "pending", prompt: "Существующая задача"}), mass: {session: mass.handle}, providerRef: "atom:40", signal: signal()}
  const pending = await send(sending)
  await record(mass.handle, request("annotation-2", "Ещё одно наблюдение"))
  const stored = await readChatSession(mass.handle)
  expect(stored.requests[0]!.providerRequest ?? null).toBe(pending.providerRequest)
  expect(stored.feedback!.map(record => record.includedIn)).toEqual(["pending", null])
  const failed = await receive({...sending, providerAck: true, providerAckId: "pending", providerResponse: null, providerError: "provider is unavailable", providerSessionId: null, providerOutcome: "not-sent", providerBindingDescriptor: null})
  expect(failed.error).toBe("provider is unavailable")
  expect((await readChatSession(mass.handle)).feedback!.map(record => record.includedIn)).toEqual([null, null])
  const next = await send({...sending, request: JSON.stringify({id: "next", prompt: "Новая явная задача"})})
  expect(JSON.parse(next.providerRequest!).prompt).toContain("Ещё одно наблюдение")
  expect(JSON.parse(next.providerRequest!).prompt).toContain("Наблюдаемый узел")
})

test("canonical feedback process triggers solely its intent and never resets provider/user request Fields", () => {
  const states = new Map(meta.superposition.map(state => [state.name, state.transitions]))
  for (const name of ["idle", "answered", "failed", "waiting-provider"]) expect(states.get(name)).toMatchObject({"recording-feedback": {feedbackRequest: {null: false}}})
  expect(states.get("sending")).not.toHaveProperty("recording-feedback")
  expect(states.get("receiving")).not.toHaveProperty("recording-feedback")
  expect(states.get("recording-feedback")).toMatchObject({"waiting-provider": {ack: {eq: false}, providerRequest: {null: false}}})
})
