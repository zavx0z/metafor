import { describe, expect, test } from "bun:test"
import { MetaFor } from "../../../metafor.ts"
import { messagesFixture } from "../../../fixture/message.ts"

describe("MetaFor: инициализация с действиями", async () => {
  const tag = Bun.randomUUIDv7()
  const { waitForMessages } = messagesFixture()

  const initialState = "initial"
  const initialContext = { value: "initial" }
  const nextContext = { value: "next" }
  const nextState = "next"
  const otherState = "other"
  const otherContext = { value: "other" }

  document.body.innerHTML = `<metafor-${tag}></metafor-${tag}>`
  const messages = await waitForMessages(1000)

  MetaFor(tag)
    .context((t) => ({
      value: t.string.optional(initialContext.value)({ title: "Value" }),
    }))
    .states({
      [initialState]: { next: { value: nextContext.value } },
      next: { other: { value: otherContext.value } },
      other: {},
    })
    .actions((action) => ({
      [initialState]: action(async () => {
        await Bun.sleep(100)
        return nextContext
      }).success(async ({ update, data }) => {
        update({ value: data.value })
      }),
      [nextState]: action(async () => {
        await Bun.sleep(100)
        return otherContext
      }).success(async ({ update, data }) => {
        update({ value: data.value })
      }),
      [otherState]: action(async () => {
        await Bun.sleep(100)
        return otherContext
      }).success(async ({ update, data }) => {
        update({ value: data.value })
      }),
    }))

  describe("первое сообщение инициализации", async () => {
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
                [initialState]: { next: { value: nextContext.value } },
                next: { other: { value: otherContext.value } },
                other: {},
              },
              context: initialContext,
              schema: {
                value: {
                  default: "initial",
                  required: false,
                  title: "Value",
                  type: "string",
                },
              },
              // actions: {
              //   [initialState]: {
              //     action: expect.any(Function),
              //     success: expect.any(Function),
              //     error: expect.any(Function),
              //   },
              // },
            },
          },
        ],
      })
    })
  })

  // describe("второе сообщение инициализации", () => {
  //   const message = messages[1]!
  //   const patch = message.patches[0]!
  //   test("[init] Первый патч replace содержит изменения контекста", () => {
  //     expect(patch.op, "patch.op должен быть 'replace'").toBe("replace")
  //     expect(patch.path, "patch.path должен быть '/context' ").toBe("/context")
  //     if (patch.op === "replace") {
  //       expect(patch.value, "patch.value должен быть nextContext").toEqual(nextContext)
  //     } else {
  //       throw new Error("Второй патч не является replace")
  //     }
  //   })
  // })
})
