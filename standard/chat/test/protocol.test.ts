import {expect, test} from "bun:test"
import "@metafor/dsl"
import meta from "../meta"
import send, {receive} from "../send"
import {readChatSession} from "../session"
import type {MassHandle} from "@metafor/types/metafor/mass"
import type {ChatSession} from "../types"
const binding = {id: "browser", service: "chatgpt", host: "codespace", remotePeerId: "host", executorId: "chatgpt"}
const request = JSON.stringify({id: "one", prompt: "Человеческое сообщение"})

test("Chat keeps one Provider identity and aliases a registry in both owner and executor modes", () => {
  expect(meta.matter).toHaveLength(1)
  const child = meta.matter![0]!
  if (child.kind !== "wimp" || typeof child.fieldsBinding !== "object") throw new Error("Missing Provider")
  expect(child.src).toBe("@metafor/provider")
  expect(typeof child.massBinding === "object" ? child.massBinding.directMass : null).toEqual({kind: "keys", entries: [{target: "registry", source: "providerRegistry"}]})
  const values = [false, null, null, null, false, "", null, null, null, null, null, null]
  const fields = new Function("_", `return (${child.fieldsBinding.expr})`)
  expect(fields(values).registryMode).toBe("owner")
  values[0] = true
  expect(fields(values).registryMode).toBe("executor")
  expect(meta.superposition.find(state => state.name === "idle")?.transitions).toMatchObject({sending: {providerRef: {null: false}}})
})
function memory() {
  let text = ""
  const handle: MassHandle = {async readText() {return text}, async readJson() {return text ? JSON.parse(text) : null}, async readBytes() {return new TextEncoder().encode(text)}, async write(value) {text = JSON.stringify(value)}}
  return {handle, value: () => JSON.parse(text) as ChatSession}
}

test("Chat emits only a durable child intention after observing its Provider Atom, never a native action", async () => {
  const m = memory()
  await expect(send({request, binding: "browser", providerRef: null, mass: {session: m.handle}, signal: new AbortController().signal})).rejects.toThrow("identity")
  expect(await m.handle.readText()).toBe("")
  const first = await send({request, binding: "browser", providerRef: "atom:40", mass: {session: m.handle}, signal: new AbortController().signal})
  expect(first).toMatchObject({ack: false, response: null})
  expect(m.value()).toMatchObject({provider: null, providerRef: "atom:40", bindingId: "browser", requests: [{state: "pending"}], messages: [{role: "user", content: "Человеческое сообщение"}]})
  expect(JSON.parse(first.providerRequest!)).toEqual({id: "one", prompt: "Человеческое сообщение", providerRef: "atom:40", sessionId: null, expectedBinding: null})
})

test("tampering retained envelope id, prompt, native session, Atom ref or capability fails before forwarding", async () => {
  for (const change of [{id: "another"}, {prompt: "Different"}, {sessionId: "foreign"}, {providerRef: "atom:41"}, {rpc: "private.read"}]) {
    const m = memory()
    await send({request, binding: "browser", providerRef: "atom:40", mass: {session: m.handle}, signal: new AbortController().signal})
    const value = m.value(), row = value.requests[0]!
    value.requests[0] = {...row, providerRequest: JSON.stringify({...JSON.parse(row.providerRequest!), ...change})}
    await m.handle.write(value)
    await expect(readChatSession(m.handle)).rejects.toThrow()
    await expect(send({request, binding: "browser", providerRef: "atom:40", mass: {session: m.handle}, signal: new AbortController().signal})).rejects.toThrow()
  }
})

test("only a correlated complete Provider receipt publishes text, binding and exact native identity", async () => {
  const m = memory(), signal = new AbortController().signal
  await send({request, binding: "browser", providerRef: "atom:40", mass: {session: m.handle}, signal})
  const input = {request, binding: "browser", providerRef: "atom:40", mass: {session: m.handle}, signal, providerAck: true,
    providerAckId: "one", providerResponse: "Ответ сервиса", providerError: null, providerSessionId: "native", providerOutcome: "completed" as const, providerBindingDescriptor: JSON.stringify(binding)}
  expect((await receive({...input, providerAckId: "unrelated"})).error).toContain("correlated")
  expect(m.value().messages).toHaveLength(1)
  await expect(receive({...input, providerRef: "atom:41"})).rejects.toThrow("Atom changed")
  await expect(receive({...input, providerSessionId: null})).rejects.toThrow("completed")
  expect((await receive(input)).response).toBe("Ответ сервиса")
  expect(m.value()).toMatchObject({providerRef: "atom:40", binding, provider: "chatgpt", sessionId: "native", requests: [{state: "completed"}]})
  expect(m.value().messages).toHaveLength(2)
})
