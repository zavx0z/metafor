// @ts-nocheck
import "../../../../schema/metafor.ts"
import { describe, expect, test } from "bun:test"
import { messagesFixture } from "../../../../infra/test/fixture/message.ts"

describe.skip("MetaFor: инициализация без действия", async () => {
  const meta = MetaFor("test-without-action")
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

  const { waitForMessages } = messagesFixture({ meta: meta.name })
  const messages = await waitForMessages(10)

  test("патч add содержит полную информацию об акторе", () => {
    const message = messages[0]!
    const patch = message.patches[0]!
    console.log(meta)
    expect(patch.op, "patch.op должен быть 'add'").toBe("add")
    expect(patch.path, "patch.path должен быть '/' ").toBe("/")
    expect(message, "message должен содержать snapshot").toEqual({
      meta: meta.name,
      actor: { index: "0" },
      timestamp: expect.any(Number),
      patches: [
        {
          op: "add",
          path: "/",
          value: {
            name: "test-without-action",
            state: "state_1",
            process: false,
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
      ],
    })
  })
  test("сообщение 2", () => {
    const message = messages[1]!
    const patch = message.patches[0]!

    expect(patch.op, "patch.op должен быть 'replace'").toBe("replace")
    expect(patch.path, "patch.path должен быть '/state' ").toBe("/state")
    expect(message, "message должен содержать snapshot").toEqual({
      meta: meta.name,
      actor: { index: "0" },
      timestamp: expect.any(Number),
      patches: [
        {
          op: "replace",
          path: "/state",
          value: "state_2",
        },
      ],
    })
  })
})
