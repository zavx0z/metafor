import { describe, expect, test } from "bun:test"
import { MetaFor } from "../../metafor.ts"
import { messagesFixture } from "../../fixture/message.ts"

describe("MetaFor: инициализация с действиями", async () => {
  const tag = Bun.randomUUIDv7()
  const { waitForMessages } = messagesFixture({ meta: tag })

  document.body.innerHTML = `<metafor-${tag}></metafor-${tag}>`

  MetaFor(tag)
    .context((t) => ({
      value: t.string.optional("ctx_1")({ title: "Value" }),
    }))
    .states({
      state_1: { state_2: { value: "ctx_2" } },
      state_2: { state_3: { value: "ctx_3" } },
      state_3: {},
    })
    .actions((action) => ({
      state_1: action(async () => {
        await Bun.sleep(100)
        return { value: "ctx_2" }
      }).success(async ({ update, data }) => {
        update({ value: data.value })
      }),
      state_2: action(async () => {
        await Bun.sleep(100)
        return { value: "ctx_3" }
      }).success(async ({ update, data }) => {
        update({ value: data.value })
      }),
      state_3: action(async () => {
        await Bun.sleep(100)
        return { value: "ctx_4" }
      }).success(async ({ update, data }) => {
        update({ value: data.value })
      }),
    }))
  const messages = await waitForMessages(500)

  test("сообщение 1", () => {
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
            state_1: { state_2: { value: "ctx_2" } },
            state_2: { state_3: { value: "ctx_3" } },
            state_3: {},
          },
          context: { value: "ctx_1" },
          schema: {
            value: {
              default: "ctx_1",
              required: false,
              title: "Value",
              type: "string",
            },
          },
          // actions: {
          //   one: {
          //     action: expect.any(Function),
          //     success: expect.any(Function),
          //     error: expect.any(Function),
          //   },
          // },
        },
      },
    })
  })
  test("сообщение 2", () => {
    const message = messages[1]!
    const patch = message.patch

    expect(patch.op, "patch.op должен быть 'test'").toBe("test")
    expect(patch.path, "patch.path должен быть '/state' ").toBe("/state")
    expect(patch.value, "patch.value должен быть 'state_1'").toEqual("state_1")
  })
  test("сообщение 3", () => {
    const message = messages[2]!
    const patch = message.patch

    expect(patch.op, "patch.op должен быть 'replace'").toBe("replace")
    expect(patch.path, "patch.path должен быть '/context' ").toBe("/context")
    expect(patch.value, "patch.value должен быть { value: 'ctx_2' }").toEqual({ value: "ctx_2" })
  })
})
