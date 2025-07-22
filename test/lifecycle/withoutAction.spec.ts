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

  test("[init] Первый патч add содержит полную информацию об акторе", () => {
    const message = messages[0]!
    const patch = message.patches[0]!
    expect(patch.op).toBe("add")
    expect(patch.path).toBe("/")
    if ("value" in patch) {
      expect(patch.value?.state).toBe(initialState)
      expect(patch.value?.context).toEqual(initialContext)
    }
  })
})
