import { describe, expect, test } from "bun:test"
import { MetaFor } from "../../metafor.ts"
import { messagesFixture } from "../../fixture/broadcast.ts"

describe("MetaFor: инициализация с действиями", async () => {
  const tag = Bun.randomUUIDv7()
  const { waitForMessages } = messagesFixture({ meta: tag })

  const initialState = "initial"
  const initialContext = { value: "initial" }
  const nextContext = { value: "next" }
  const nextState = "next"
  const otherState = "other"
  const otherContext = { value: "other" }

  document.body.innerHTML = `<metafor-${tag}></metafor-${tag}>`
  MetaFor(tag)
    .context((t) => ({
      value: t.string.optional(initialContext.value),
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

  const messages = await waitForMessages(400)

  describe("первое сообщение инициализации", () => {
    const message = messages[0]!
    const patch = message.patches[0]!

    test("[init] Первый патч add содержит полную информацию об акторе", () => {
      expect(patch.op, "patch.op должен быть 'add'").toBe("add")
      expect(patch.path, "patch.path должен быть '/' ").toBe("/")
      if (patch.op === "add") {
        expect(patch.value?.state, "patch.value.state должен быть initialState").toBe(initialState)
        expect(patch.value?.context, "patch.value.context должен быть initialContext").toEqual(initialContext)
      } else {
        throw new Error("Первый патч не является add")
      }
    })
    test("[init] Полное сообщение содержит текущее состояние и контекст", () => {
      expect(message, "message должен содержать meta и patches с актуальными значениями").toEqual({
        meta: { tag, timestamp: expect.any(Number) },
        patches: [{ op: "add", path: "/", value: { state: initialState, context: initialContext } }],
      })
    })
  })

  describe("второе сообщение инициализации", () => {
    const message = messages[1]!
    const patch = message.patches[0]!
    test("[init] Первый патч replace содержит изменения контекста", () => {
      expect(patch.op, "patch.op должен быть 'replace'").toBe("replace")
      expect(patch.path, "patch.path должен быть '/context' ").toBe("/context")
      if (patch.op === "replace") {
        expect(patch.value, "patch.value должен быть nextContext").toEqual(nextContext)
      } else {
        throw new Error("Второй патч не является replace")
      }
    })
    
  })
})
