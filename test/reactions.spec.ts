import { test, expect, describe } from "bun:test"
import { MetaFor } from "../metafor.ts"
import { messagesFixture } from "../fixture/message.ts"

describe("реакции", () => {
  test("MetaFor - базовый функционал", async () => {
    const { waitForMessages } = messagesFixture({ meta: "test" })

    document.body.innerHTML = `<metafor-test></metafor-test>`
  })
})