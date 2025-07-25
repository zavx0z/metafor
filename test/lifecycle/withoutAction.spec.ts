import { describe, expect, test } from "bun:test"
import { MetaFor } from "../../metafor.ts"
import { messagesFixture } from "../../fixture/message.ts"

describe("MetaFor: инициализация без действия", async () => {
  const tag = Bun.randomUUIDv7()
  const { waitForMessages } = messagesFixture({ meta: tag })

  document.body.innerHTML = `<metafor-${tag}></metafor-${tag}>`
  MetaFor(tag)
    .context((t) => ({
      value: t.string.optional("ctx_1"),
    }))
    .states({
      state_1: { state_2: { value: "ctx_1" } },
      state_2: { state_3: { value: "ctx_1" } },
      state_3: {},
    })
    .core()
    .actions(() => ({}))
    .reactions()
    .view()

  const messages = await waitForMessages(10)

  test("патч add содержит полную информацию об акторе", () => {
    const message = messages[0]!
    const patch = message.patch

    expect(patch.op, "patch.op должен быть 'add'").toBe("add")
    expect(patch.path, "patch.path должен быть '/' ").toBe("/")
    expect(message, "message должен содержать snapshot").toEqual({
      meta: { tag, index: 0, timestamp: expect.any(Number) },
      patch: {
        op: "add",
        path: "/",
        value: {
          state: "state_1",
          states: {
            state_1: { state_2: { value: "ctx_1" } },
            state_2: { state_3: { value: "ctx_1" } },
            state_3: {},
          },
          context: { value: "ctx_1" },
          schema: {
            value: { type: "string", required: false, default: "ctx_1" },
          },
        },
      },
    })
  })
  test("сообщение 2", () => {
    const message = messages[1]!
    const patch = message.patch

    expect(patch.op, "patch.op должен быть 'replace'").toBe("replace")
    expect(patch.path, "patch.path должен быть '/state' ").toBe("/state")
    expect(message, "message должен содержать snapshot").toEqual({
      meta: { tag, index: 0, timestamp: expect.any(Number) },
      patch: {
        op: "replace",
        path: "/state",
        value: "state_2",
      },
    })
  })
})
