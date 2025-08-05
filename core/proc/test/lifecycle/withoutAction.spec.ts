import { describe, expect, test } from "bun:test"
import { messagesFixture } from "../../../../fixture/message.ts"
import { MetaFor } from "../../../../web/metafor.ts"

describe("MetaFor: инициализация без действия", async () => {
  const hash = MetaFor("test-without-action")
    .context((t) => ({
      value: t.string.optional("ctx_1"),
    }))
    .states({
      state_1: { state_2: { value: "ctx_1" } },
      state_2: { state_3: { value: "ctx_1" } },
      state_3: {},
    })
    .core()
    .processes(() => ({}))
    .reactions()
    .view()

  const { waitForMessages } = messagesFixture({ meta: hash })
  document.body.innerHTML = `<meta-${hash}></meta-${hash}>`
  const messages = await waitForMessages(10)

  test("патч add содержит полную информацию об акторе", () => {
    const message = messages[0]!
    const patch = message.patch

    expect(patch.op, "patch.op должен быть 'add'").toBe("add")
    expect(patch.path, "patch.path должен быть '/' ").toBe("/")
    expect(message, "message должен содержать snapshot").toEqual({
      meta: { tag: hash, index: 0, timestamp: expect.any(Number) },
      patch: {
        op: "add",
        path: "/",
        value: {
          name: "test-without-action",
          state: "state_1",
          states: {
            state_1: { state_2: { value: "ctx_1" } },
            state_2: { state_3: { value: "ctx_1" } },
            state_3: {},
          },
          context: {
            value: {
              type: "string",
              required: false,
              default: "ctx_1",
              value: "ctx_1",
            },
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
      meta: { tag: hash, index: 0, timestamp: expect.any(Number) },
      patch: {
        op: "replace",
        path: "/state",
        value: "state_2",
      },
    })
  })
})
