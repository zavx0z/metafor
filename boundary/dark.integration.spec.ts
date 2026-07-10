import {afterAll, beforeAll, describe, expect, test} from "bun:test"
import type {ForceMessage} from "@metafor/types/force/message"
import {createForceTestFixture, type ForceTestFixture} from "force/fixture"
import {open, type BoundaryDatabase} from "./sqlite.ts"

const ROOT = "zavx0z/linux"

describe("Dark -> Inflaton -> Boundary incremental flow", () => {
  let fixture: ForceTestFixture
  let boundary: BoundaryDatabase
  let messages: ForceMessage[]

  beforeAll(async () => {
    fixture = createForceTestFixture()
    await import(`../dark/dark.ts?boundary-integration=${crypto.randomUUID()}`)
    const dark = await fixture.waitForClient("dark", 5_000)
    const fromIndex = fixture.messages.length
    fixture.impulse(dark, {parts: [{part: "inflaton", op: "test", path: ROOT}]})
    await fixture.waitForMessage(
      ({domain, message}) => domain === "dark" && message.parts[0].part === "inflaton" &&
        message.parts[0].op === "test" && message.parts[0].path === ROOT,
      fromIndex,
      30_000,
    )
    messages = fixture.messages.slice(fromIndex).filter(({domain}) => domain === "dark").map(({message}) => message)
    boundary = await open(":memory:")
  })

  afterAll(async () => {
    fixture.close()
    await boundary.close()
  })

  test("applies the real stream particle-by-particle without replacing the world", async () => {
    const derived: ForceMessage[] = []
    for (const message of messages) {
      const commit = await boundary.materialize(message)
      if (commit) derived.push(...commit.messages)
    }

    expect(messages.every((message) => message.parts.length === 1)).toBe(true)
    expect(await boundary.projection.sql<Array<{src: string}>>`
      SELECT src FROM wimp WHERE src IN (${ROOT}, ${"zavx0z/codex"}) ORDER BY src
    `).toEqual([{src: "zavx0z/codex"}, {src: ROOT}])
    expect((await boundary.projection.sql`SELECT id FROM actor WHERE wimp = ${ROOT}`).length).toBe(1)
    expect((await boundary.projection.sql`SELECT id FROM actor WHERE wimp = ${"zavx0z/codex"}`).length).toBe(1)
    expect(derived.every((message) => message.parts.length === 1)).toBe(true)
    expect(derived.some((message) => message.parts[0].path === `declaration/${ROOT}/meta`)).toBe(true)
    expect(derived.some((message) => typeof message.parts[0].path === "string" && String(message.parts[0].path).startsWith("actor/"))).toBe(true)
  }, 30_000)
})
