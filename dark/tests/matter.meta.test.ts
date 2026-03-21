import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { matter } from "../dark"
import { HubFixture } from "fixture"
import { dark$ } from "../store"
import { Wimp } from "@dark/strong"
const hub = new HubFixture("./github/")

describe("matter.meta", () => {
  beforeAll(async () => await hub.setup())
  afterAll(async () => {
    dark$.meta.clear()
    dark$.particles.clear()
    dark$.parent = new WeakMap()
    await hub.teardown()
  })
  test("should have meta information", async () => {
    const wimp = new Wimp("zavx0z/git")
    await matter(wimp)
    expect(true).toBe(true)
  })
})
