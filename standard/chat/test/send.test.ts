import {expect, test} from "bun:test"
import type {MassHandle} from "@metafor/types/metafor/mass"
import send, {captureProvider, restoreProvider} from "./fixture/cycle"
import type {ChatSession} from "../types"
import type {ProviderDriver as ChatDriver, ProviderEnergy as ChatEnergy} from "@metafor/provider/runtime-types"

function mass(initial = "") {
  let text = initial
  let writes = 0
  let failAt = -1
  const handle: MassHandle = {
    async readText() {return text},
    async readBytes() {return new TextEncoder().encode(text)},
    async readJson() {return JSON.parse(text)},
    async write(value) {
      writes++
      if (writes === failAt) throw new Error("Mass write rejected")
      text = JSON.stringify(value)
    },
  }
  return {handle, read: () => JSON.parse(text) as ChatSession, text: () => text, fail(at: number) {failAt = at}}
}

function fixture(initial = "", provider?: Awaited<ReturnType<typeof captureProvider>>) {
  const stored = mass(initial)
  if (provider) restoreProvider(stored.handle, provider)
  const opens: (string | null)[] = []
  const prompts: string[] = []
  let closes = 0
  const driver: ChatDriver = {
    async open({sessionId}) {
      opens.push(sessionId)
      return {
        sessionId: sessionId ?? "native-session",
        async prompt(prompt) {
          expect(stored.read().requests.at(-1)?.state).toBe("pending")
          expect(JSON.parse((await captureProvider(stored.handle)).turns).sessionId).toBe("native-session")
          prompts.push(prompt)
          return JSON.stringify({answer: prompt})
        },
        async close() {closes++},
      }
    },
  }
  const energy: ChatEnergy = {}
  const call = (id: string, prompt = "first", override = driver, signal = new AbortController().signal) => send({
    request: JSON.stringify({id, prompt}), mass: {session: stored.handle}, energy, driver: override, signal,
  })
  return {stored, opens, prompts, energy, driver, call, closes: () => closes}
}

test("два turn и холодное восстановление сохраняют native identity и полный transcript", async () => {
  const first = fixture()
  const result = await first.call("one")
  expect(result).toEqual({ackId: "one", response: '{"answer":"first"}', error: null, sessionId: "native-session"})
  expect(first.opens).toEqual([null])
  expect(first.closes()).toBe(1)
  expect(first.energy).toEqual({})
  const restored = fixture(first.stored.text(), await captureProvider(first.stored.handle))
  expect((await restored.call("two", "second")).error).toBeNull()
  expect(restored.opens).toEqual(["native-session"])
  expect(restored.stored.read().messages).toEqual([
    {requestId: "one", role: "user", content: "first"},
    {requestId: "one", role: "assistant", content: '{"answer":"first"}'},
    {requestId: "two", role: "user", content: "second"},
    {requestId: "two", role: "assistant", content: '{"answer":"second"}'},
  ])
  expect(restored.stored.read().requests.map(request => request.state)).toEqual(["completed", "completed"])
})

test("completed повтор возвращает cached result, а другое содержимое того же id отклоняется", async () => {
  const f = fixture()
  const first = await f.call("one")
  const repeat = await f.call("one")
  expect(repeat).toEqual(first)
  expect(repeat).not.toBe(first)
  expect(f.prompts).toHaveLength(1)
  await expect(f.call("one", "changed")).rejects.toThrow("другому содержимому")
  expect(f.prompts).toHaveLength(1)
})

test("авария после внешней отправки сохраняет pending; retry и следующий turn не отправляются", async () => {
  const f = fixture()
  let prompts = 0
  const broken: ChatDriver = {async open() {return {sessionId: "native-session", async prompt() {prompts++; throw new Error("connection lost")}, async close() {}}}}
  expect((await f.call("one", "first", broken)).error).toBe("connection lost")
  expect(f.stored.read().requests[0]?.state).toBe("pending")
  const restored = fixture(f.stored.text(), await captureProvider(f.stored.handle))
  expect((await restored.call("one")).error).toContain("uncertain")
  expect((await restored.call("two", "second")).error).toContain("неопределён")
  expect(restored.opens).toEqual([])
  expect(prompts).toBe(1)
  await expect(restored.call("one", "changed")).rejects.toThrow("другому содержимому")
})

test("доказанный отказ open до prompt терминален для id и разрешает новое сообщение после исправления provider", async () => {
  const f = fixture()
  let opens = 0
  const unready: ChatDriver = {async open() {opens++; throw new Error("Browser login required")}}
  const refused = await f.call("not-sent", "first", unready)
  expect(refused.error).toBe("Browser login required")
  expect(f.stored.read().requests[0]?.state).toBe("failed")
  expect(f.stored.read().messages).toEqual([{requestId: "not-sent", role: "user", content: "first"}])
  expect(await f.call("not-sent", "first", unready)).toEqual(refused)
  expect(opens).toBe(1)
  const next = await f.call("new-id", "second")
  expect(next.error).toBeNull()
  expect(f.prompts).toEqual(["second"])
  expect(f.stored.read().requests.map(request => request.state)).toEqual(["failed", "completed"])
})

test("pre-prompt refusal preserves a known native session and the next explicit message resumes it", async () => {
  const f = fixture()
  await f.call("first")
  const unready: ChatDriver = {async open(input) {expect(input.sessionId).toBe("native-session"); throw new Error("Provider temporarily unavailable")}}
  expect((await f.call("not-sent", "second", unready)).error).toBe("Provider temporarily unavailable")
  expect(f.stored.read().sessionId).toBe("native-session")
  expect((await f.call("next", "third")).error).toBeNull()
  expect(f.opens).toEqual([null, "native-session"])
  expect(f.stored.read().messages).toHaveLength(5)
})

test("invalid native identities refuse before prompt without corrupting resumable Mass", async () => {
  for (const sessionId of ["native\nsession", "x".repeat(257)]) {
    const f = fixture()
    const invalid: ChatDriver = {async open() {return {sessionId, async prompt() {throw new Error("must not prompt")}, async close() {}}}}
    expect((await f.call("invalid-native", "first", invalid)).error).toContain("identity")
    expect(f.stored.read().sessionId).toBeNull()
    expect(f.stored.read().requests[0]?.state).toBe("failed")
    expect((await f.call("new-request", "second")).error).toBeNull()
  }
})

test("malformed запрос и повреждённый Mass не запускают provider и не сбрасывают историю", async () => {
  const f = fixture()
  for (const request of [null, "{}", '{"id":"one","prompt":""}', '{"id":"one","prompt":"x","extra":1}']) {
    await expect(send({request, mass: {session: f.stored.handle}, energy: {}, driver: f.driver, signal: new AbortController().signal})).rejects.toThrow()
  }
  const corrupt = fixture('{"version":99}')
  await expect(corrupt.call("one")).rejects.toThrow("session Mass")
  expect(corrupt.stored.text()).toBe('{"version":99}')
  expect(f.opens).toEqual([])
  expect(corrupt.opens).toEqual([])
})

test("неподтверждённая completed запись не публикует ответ и сохраняет uncertain ledger", async () => {
  const f = fixture()
  f.stored.fail(2)
  await expect(f.call("one")).rejects.toThrow("Mass write rejected")
  expect(f.stored.read().requests[0]?.state).toBe("pending")
  expect(f.stored.read().messages).toHaveLength(1)
  expect(f.closes()).toBe(1)
  expect((await f.call("one")).error).toBeNull()
  expect(f.prompts).toHaveLength(1)
})

test("поздний abort освобождает live connection и сохраняет pending без повторного prompt", async () => {
  const f = fixture()
  const controller = new AbortController()
  let closes = 0
  const aborted: ChatDriver = {async open() {controller.abort(new Error("retired")); return {sessionId: "native-session", async prompt() {throw new Error("must not prompt")}, async close() {closes++}}}}
  await expect(f.call("one", "first", aborted, controller.signal)).rejects.toThrow("retired")
  expect(closes).toBe(1)
  expect(f.energy).toEqual({})
  expect(f.stored.read().requests[0]?.state).toBe("pending")
})

test("provider не может заменить восстановленную identity новым контекстом", async () => {
  const f = fixture()
  await f.call("one")
  let prompts = 0
  let closes = 0
  const wrong: ChatDriver = {async open() {return {sessionId: "replacement", async prompt() {prompts++; return "wrong"}, async close() {closes++}}}}
  expect((await f.call("two", "second", wrong)).error).toContain("identity")
  expect(prompts).toBe(0)
  expect(closes).toBe(1)
  expect(f.stored.read().sessionId).toBe("native-session")
})

test("один Mass не принимает конкурентного writer даже с отдельной Energy", async () => {
  const f = fixture()
  const started = Promise.withResolvers<void>()
  const finish = Promise.withResolvers<string>()
  const driver: ChatDriver = {async open() {return {sessionId: "native-session", prompt() {started.resolve(); return finish.promise}, async close() {}}}}
  const first = f.call("one", "first", driver)
  await started.promise
  expect((await send({request: '{"id":"two","prompt":"second"}', mass: {session: f.stored.handle}, energy: {}, driver, signal: new AbortController().signal})).error).toContain("неопределён")
  finish.resolve("answer")
  expect((await first).error).toBeNull()
})

test("отказ cleanup сохраняет live handle и не разрешает следующему turn создать второй child", async () => {
  const f = fixture()
  const driver: ChatDriver = {async open() {return {sessionId: "native-session", async prompt() {return "answer"}, async close() {throw new Error("cleanup not confirmed")}}}}
  await expect(f.call("one", "first", driver)).rejects.toThrow("cleanup not confirmed")
  expect(f.energy.connection).toBeDefined()
  expect(f.stored.read().requests[0]?.state).toBe("pending")
  expect(JSON.parse((await captureProvider(f.stored.handle)).turns).requests[0]?.phase).toBe("completed")
  expect((await f.call("two", "second")).error).toContain("неопределён")
  expect(f.opens).toEqual([])
})
