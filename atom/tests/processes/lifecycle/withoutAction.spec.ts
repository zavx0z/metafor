// @ts-nocheck
import "../../../../meta/metafor.ts"
import { describe, expect, test } from "bun:test"
import { messagesFixture } from "../../../../infra/test/fixture/message.ts"

describe.skip("MetaFor: инициализация без действия", async () => {
  const meta = MetaFor("test-without-action")
    .fields((field) => ({
      value: field.string.optional("ctx_1"),
    }))
    .superposition({
      state_1: { state_2: { value: "ctx_1" } },
      state_2: { state_3: { value: "ctx_1" } },
      state_3: {},
    })
    .mass()
    .processes(() => ({}))
    .reactions()
    .bulk()

  const { waitForMessages } = messagesFixture({ meta: meta.name })
  const messages = await waitForMessages(10)

  test("патч add содержит полную информацию об атоме", () => {
    const message = messages[0]!
    const patch = message.impulses[0]!
    console.log(meta)
    expect(patch.op, "patch.op должен быть 'add'").toBe("add")
    expect(patch.path, "patch.path должен быть '/' ").toBe("/")
    expect(message, "message должен содержать snapshot").toEqual({
      meta: meta.name,
      atom: { index: "0" },
      timestamp: expect.any(Number),
      impulses: [
        {
          op: "add",
          path: "/",
          value: {
            name: "test-without-action",
            state: "state_1",
            process: false,
            superposition: {
              state_1: { state_2: { value: "ctx_1" } },
              state_2: { state_3: { value: "ctx_1" } },
              state_3: {},
            },
            fields: {
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
    const patch = message.impulses[0]!

    expect(patch.op, "patch.op должен быть 'replace'").toBe("replace")
    expect(patch.path, "patch.path должен быть '/state' ").toBe("/state")
    expect(message, "message должен содержать snapshot").toEqual({
      meta: meta.name,
      atom: { index: "0" },
      timestamp: expect.any(Number),
      impulses: [
        {
          op: "replace",
          path: "/state",
          value: "state_2",
        },
      ],
    })
  })
})
