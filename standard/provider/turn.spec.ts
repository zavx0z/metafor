import {expect, test} from "bun:test"
import type {MassHandle} from "@metafor/types/metafor/mass"
import type {ProviderBinding} from "@metafor/types/metafor/providers"
import {createProviderRegistry} from "./catalog"
import turn from "./turn"
import type {ProviderDriver, ProviderEnergy} from "./runtime-types"
import {parseProviderTurnRequest, parseProviderTurnResult} from "./protocol"

const binding: ProviderBinding = {id: "browser", service: "chatgpt", host: "codespace", remotePeerId: "provider-host", executorId: "chatgpt"}
function memory(initial: unknown = null) {
  let text = initial === null ? "" : JSON.stringify(initial)
  const handle: MassHandle = {async readText() {return text}, async readJson() {return text ? JSON.parse(text) : null}, async readBytes() {return new TextEncoder().encode(text)}, async write(value) {text = JSON.stringify(value)}}
  return {handle, value: () => text ? JSON.parse(text) : null}
}
function fixture(saved?: unknown) {
  const registry = memory(createProviderRegistry([{...binding, source: {kind: "native-bootstrap", assignmentId: "browser", remoteGraph: "unknown"},
    resolution: "exact", connection: "connected", capabilities: {modelTurn: true, browserPreview: false, browserControl: false}, checks: {status: "unknown", checkedAt: null, message: null}}]))
  const turns = memory(saved), opens: Array<string | null> = [], prompts: string[] = []
  let closes = 0, failure: "open" | "prompt" | null = null
  const driver: ProviderDriver = {binding, async open({sessionId}) {
    opens.push(sessionId)
    if (failure === "open") throw new Error("Login required")
    return {sessionId: sessionId ?? "native-browser-session", async prompt(text) {
      expect(turns.value().requests.at(-1).phase).toBe("prompting")
      prompts.push(text)
      if (failure === "prompt") throw new Error("Prompt response lost")
      return "Проверенный ответ тестового исполнителя"
    }, async close() {closes++}}
  }}
  const energy: ProviderEnergy = {}
  const request = (id: string, sessionId: string | null = turns.value()?.sessionId ?? null) => ({id, prompt: "Обычный текст", sessionId, providerRef: "atom:40", expectedBinding: turns.value()?.binding ?? null})
  const call = (value: ReturnType<typeof request>, atom = "40") => turn({request: JSON.stringify(value), binding: "browser", mass: {registry: registry.handle, turns: turns.handle},
    energy, driver, signal: new AbortController().signal, self: {atom}})
  return {driver, registry, turns, opens, prompts, closes: () => closes, energy, request, call, fail(value: typeof failure) {failure = value}}
}

test("Provider persists receipt before publication and restores the same owned session without a second prompt", async () => {
  const f = fixture(), request = f.request("one")
  const completed = await f.call(request)
  expect(completed).toMatchObject({outcome: "completed", providerRef: "atom:40", sessionId: "native-browser-session"})
  expect(f.turns.value()).toMatchObject({providerRef: "atom:40", binding, sessionId: "native-browser-session", requests: [{phase: "completed", result: completed}]})
  const restored = fixture(f.turns.value())
  expect(await restored.call(request)).toEqual(completed)
  expect(restored.opens).toEqual([])
  expect((await restored.call(restored.request("two"))).outcome).toBe("completed")
  expect(restored.opens).toEqual(["native-browser-session"])
  expect(restored.prompts).toHaveLength(1)
  expect(f.energy).toEqual({})
})

test("request content, target Atom and current catalog reassignment cannot send another native prompt", async () => {
  const f = fixture(), first = f.request("one")
  await f.call(first)
  expect((await f.call({...first, prompt: "Changed"})).outcome).toBe("not-sent")
  expect((await f.call({...f.request("wrong-atom"), providerRef: "atom:41"})).outcome).toBe("not-sent")
  const changed = f.registry.value()
  changed.entries[0].host = "mac"
  await f.registry.handle.write(changed)
  const refusal = await f.call(f.request("new-assignment"))
  expect(refusal.error).toContain("binding cannot change")
  expect(JSON.parse(refusal.bindingDescriptor!)).toEqual(binding)
  expect(f.opens).toHaveLength(1)
  expect(f.prompts).toHaveLength(1)
})

test("catalog refusal is terminal for its identity and a fresh explicit request may follow a fixed catalog", async () => {
  const f = fixture(), first = f.request("one")
  const offline = f.registry.value()
  offline.entries[0].connection = "unknown"
  await f.registry.handle.write(offline)
  const refusal = await f.call(first)
  expect(refusal.outcome).toBe("not-sent")
  expect(f.turns.value().requests[0].phase).toBe("failed")
  offline.entries[0].connection = "connected"
  await f.registry.handle.write(offline)
  expect(await f.call(first)).toEqual(refusal)
  expect(f.opens).toHaveLength(0)
  expect((await f.call(f.request("two"))).outcome).toBe("completed")
})

test("pre-prompt refusal is terminal but post-prompt uncertainty blocks same and new request identities", async () => {
  const f = fixture(), first = f.request("one")
  f.fail("open")
  expect((await f.call(first)).outcome).toBe("not-sent")
  f.fail(null)
  expect((await f.call(first)).outcome).toBe("not-sent")
  expect(f.opens).toHaveLength(1)
  f.fail("prompt")
  const next = f.request("two")
  expect((await f.call(next)).outcome).toBe("uncertain")
  const restored = fixture(f.turns.value())
  expect((await restored.call(next)).outcome).toBe("uncertain")
  expect((await restored.call(restored.request("three"))).outcome).toBe("uncertain")
  expect(restored.opens).toHaveLength(0)
})

test("a retained opening proves not-sent; a native identity from another Provider is never adopted", async () => {
  const f = fixture()
  const request = f.request("opening", null)
  const saved = {version: 1, providerRef: "atom:40", binding, sessionId: "native-browser-session", requests: [{request, phase: "opening", result: null}]}
  const restored = fixture(saved)
  expect((await restored.call(request)).outcome).toBe("not-sent")
  expect(restored.opens).toHaveLength(0)
  expect((await restored.call(restored.request("next"))).outcome).toBe("completed")
  expect(restored.opens).toEqual(["native-browser-session"])
  const fresh = fixture()
  const refused = await fresh.call(fresh.request("foreign-native", "someone-elses-session"))
  expect(refused.outcome).toBe("not-sent")
  expect(refused.bindingDescriptor).toBeNull()
  expect((await fresh.call(fresh.request("own-new-session", null))).outcome).toBe("completed")
})

test("corrupted cached receipts and a transplanted turns Mass fail closed before transport", async () => {
  const original = fixture(), first = original.request("one")
  await original.call(first)
  for (const change of [(value: any) => {value.providerRef = "atom:41"}, (value: any) => {value.requests[0].result.providerRef = "atom:41"},
    (value: any) => {value.requests[0].result.sessionId = "other"}, (value: any) => {value.requests[0].result.bindingDescriptor = JSON.stringify({...binding, service: "qwen"})}]) {
    const saved = original.turns.value()
    change(saved)
    const corrupted = fixture(saved)
    await expect(corrupted.call(first)).rejects.toThrow()
    expect(corrupted.opens).toHaveLength(0)
  }
})

test("closed request and receipt decoders reject extra capabilities and unsupported successful claims", () => {
  const f = fixture()
  expect(() => parseProviderTurnRequest({...f.request("one"), rpc: "private.read"})).toThrow()
  expect(() => parseProviderTurnRequest({...f.request("one"), providerRef: null})).toThrow()
  expect(() => parseProviderTurnResult({ack: true, ackId: "one", response: "invented", error: null, sessionId: null, outcome: "completed", providerRef: "atom:40", bindingDescriptor: null})).toThrow()
})


test("settings use the owned native session and durable receipt without a model prompt", async () => {
  const f = fixture()
  await f.call(f.request("first"))
  const open = f.driver.open
  let reads = 0
  f.driver.open = async input => ({...await open(input), async settings() {
    reads++
    return {model: "native-model", reasoning: "high", models: [{id: "native-model", label: "Native"}], reasoningLevels: [{id: "high", label: "High"}]}
  }})
  const input = {...f.request("settings"), prompt: "", operation: "settings" as const, selection: {}}
  const result = await f.call(input)
  expect(result.outcome).toBe("completed")
  expect(JSON.parse(result.response!)).toMatchObject({model: "native-model", reasoning: "high"})
  expect(f.prompts).toHaveLength(1)
  expect(reads).toBe(1)
  expect(await f.call(input)).toEqual(result)
  expect(reads).toBe(1)
  const unsupported = fixture(f.turns.value())
  const unavailable = await unsupported.call({...unsupported.request("unsupported"), prompt: "", operation: "settings", selection: {}} as typeof input)
  expect(unavailable.outcome).toBe("not-sent")
  expect((await unsupported.call(unsupported.request("normal-after"))).outcome).toBe("completed")
})
