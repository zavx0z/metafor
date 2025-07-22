import { describe, expect, test } from "bun:test"
import { MetaFor } from "../../metafor.ts"
import { messagesFixture } from "../../fixture/broadcast.ts"

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
