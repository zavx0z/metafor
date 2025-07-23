import { describe, expect, test } from "bun:test"
import { MetaFor } from "../../../metafor.ts"
import { messagesFixture } from "../../../fixture/message.ts"

describe("MetaFor: инициализация без действия", async () => {
  const tag = Bun.randomUUIDv7()
  const { waitForMessages } = messagesFixture({ meta: tag })

  const initialState = "initial"
  const initialContext = { value: "initial" }

  document.body.innerHTML = `<metafor-${tag}></metafor-${tag}>`
  MetaFor(tag)
    .context((t) => ({
      value: t.string.optional(initialContext.value),
    }))
    .states({
      [initialState]: {},
      other: {},
    })
    .actions(() => ({}))

  const messages = await waitForMessages(10)
  const message = messages[0]!
  const patch = message.patches[0]!

  test("первый патч add содержит полную информацию об акторе", () => {
    expect(patch.op, "patch.op должен быть 'add'").toBe("add")
    expect(patch.path, "patch.path должен быть '/' ").toBe("/")
    expect(message, "message должен содержать snapshot").toEqual({
      meta: { tag, timestamp: expect.any(Number) },
      patches: [
        {
          op: "add",
          path: "/",
          value: {
            state: initialState,
            states: {
              [initialState]: {},
              other: {},
            },
            context: initialContext,
            schema: {
              value: { type: "string", required: false, default: "initial" },
            },
          },
        },
      ],
    })
  })
})
