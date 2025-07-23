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
      state_1: {},
      state_2: {},
    })
    .actions(() => ({}))

  const messages = await waitForMessages(10)

  test("патч add содержит полную информацию об акторе", () => {
    const message = messages[0]!
    const patch = message.patch

    expect(patch.op, "patch.op должен быть 'add'").toBe("add")
    expect(patch.path, "patch.path должен быть '/' ").toBe("/")
    expect(message, "message должен содержать snapshot").toEqual({
      meta: { tag, timestamp: expect.any(Number) },
      patch: {
        op: "add",
        path: "/",
        value: {
          state: "state_1",
          states: {
            state_1: {},
            state_2: {},
          },
          context: { value: "ctx_1" },
          schema: {
            value: { type: "string", required: false, default: "ctx_1" },
          },
        },
      },
    })
  })
})
