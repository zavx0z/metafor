import { describe, expect, test } from "bun:test"
import { messagesFixture } from "../../../../fixture/message.ts"
import { MetaFor } from "../../../../web/metafor.ts"

describe("MetaFor: инициализация с действиями", async () => {
  const hex = MetaFor("test-with-action")
    .context((t) => ({
      value: t.string.optional("ctx_1")({ title: "Value" }),
    }))
    .states({
      state_1: { state_2: { value: "ctx_2" } },
      state_2: { state_3: { value: "ctx_3" } },
      state_3: {},
    })
    .core()
    .processes((process) => ({
      state_1: process()
        .action(async () => {
          await Bun.sleep(100)
          return { value: "ctx_2" }
        })
        .success(async ({ update, data }) => update({ value: data.value })),
      state_2: process()
        .action(async () => {
          await Bun.sleep(100)
          return { value: "ctx_3" }
        })
        .success(async ({ update, data }) => update({ value: data.value })),
      state_3: process()
        .action(async () => {
          await Bun.sleep(100)
          return { value: "ctx_4" }
        })
        .success(async ({ update, data }) => update({ value: data.value })),
    }))
    .reactions()
    .view()
  const { waitForMessages } = messagesFixture({ meta: hex })

  document.body.innerHTML = `<meta-${hex}></meta-${hex}>`
  const messages = await waitForMessages(500)

  test("сообщение 1", () => {
    const message = messages[0]!
    const patch = message.patch

    expect(patch.op, "patch.op должен быть 'add'").toBe("add")
    expect(patch.path, "patch.path должен быть '/' ").toBe("/")
    expect(message, "message должен содержать snapshot").toEqual({
      meta: { tag: hex, index: 0, timestamp: expect.any(Number) },
      patch: {
        op: "add",
        path: "/",
        value: {
          name: "test-with-action",
          state: "state_1",
          states: {
            state_1: { state_2: { value: "ctx_2" } },
            state_2: { state_3: { value: "ctx_3" } },
            state_3: {},
          },
          context: {
            value: {
              type: "string",
              required: false,
              title: "Value",
              default: "ctx_1",
              value: "ctx_1",
            },
          },
          processes: {
            state_1: {
              success: {
                write: ["value"],
              },
            },
            state_2: {
              success: {
                write: ["value"],
              },
            },
            state_3: {
              success: {
                write: ["value"],
              },
            },
          },
        },
      },
    })
  })
  // console.log(messages)
  describe("state_1", () => {
    test("вход", () => {
      const message = messages[1]!
      const patch = message.patch
      expect(patch.op, "patch.op должен быть 'test'").toBe("test")
      expect(patch.path, "patch.path должен быть '/state' ").toBe("/state")
      expect(patch.value, "patch.value должен быть 'state_1'").toEqual("state_1")
    })
    test("обновление контекста", () => {
      const message = messages[2]!
      const patch = message.patch
      expect(patch.op, "patch.op должен быть 'replace'").toBe("replace")
      expect(patch.path, "patch.path должен быть '/context' ").toBe("/context")
      expect(patch.value, "patch.value должен быть { value: 'ctx_2' }").toEqual({ value: "ctx_2" })
    })
    test("переход", () => {
      const message = messages[3]!
      const patch = message.patch
      expect(patch.op, "patch.op должен быть 'replace'").toBe("replace")
      expect(patch.path, "patch.path должен быть '/state' ").toBe("/state")
      expect(patch.value, "patch.value должен быть state_1").toEqual("state_1")
    })
  })
  describe("state_2", () => {
    test("вход", () => {
      const message = messages[4]!
      const patch = message.patch
      expect(patch.op, "patch.op должен быть 'test'").toBe("test")
      expect(patch.path, "patch.path должен быть '/state' ").toBe("/state")
      expect(patch.value, "patch.value должен быть 'state_2'").toEqual("state_2")
    })
    test("обновление контекста", () => {
      const message = messages[5]!
      const patch = message.patch
      expect(patch.op, "patch.op должен быть 'replace'").toBe("replace")
      expect(patch.path, "patch.path должен быть '/context' ").toBe("/context")
      expect(patch.value, "patch.value должен быть { value: 'ctx_3' }").toEqual({ value: "ctx_3" })
    })
    test("переход", () => {
      const message = messages[6]!
      const patch = message.patch
      expect(patch.op, "patch.op должен быть 'replace'").toBe("replace")
      expect(patch.path, "patch.path должен быть '/state' ").toBe("/state")
      expect(patch.value, "patch.value должен быть state_2").toEqual("state_2")
    })
  })
  describe("state_3", () => {
    test("вход", () => {
      const message = messages[7]!
      const patch = message.patch
      expect(patch.op, "patch.op должен быть 'test'").toBe("test")
      expect(patch.path, "patch.path должен быть '/state' ").toBe("/state")
      expect(patch.value, "patch.value должен быть 'state_3'").toEqual("state_3")
    })
    test("обновление контекста", () => {
      const message = messages[8]!
      const patch = message.patch
      expect(patch.op, "patch.op должен быть 'replace'").toBe("replace")
      expect(patch.path, "patch.path должен быть '/context' ").toBe("/context")
      expect(patch.value, "patch.value должен быть { value: 'ctx_4' }").toEqual({ value: "ctx_4" })
    })
    test("переход", () => {
      const message = messages[9]!
      const patch = message.patch
      expect(patch.op, "patch.op должен быть 'replace'").toBe("replace")
      expect(patch.path, "patch.path должен быть '/state' ").toBe("/state")
      expect(patch.value, "patch.value должен быть state_3").toEqual("state_3")
    })
  })
})
