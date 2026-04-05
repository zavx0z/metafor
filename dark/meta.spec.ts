import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test"
import { HubFixture } from "fixture"
import { matter } from "./dark.ts"
import { resetCanonicalMetaContext } from "./load.ts"
import { Wimp } from "@dark/strong"
import { dark$ } from "./store.ts"

const hub = new HubFixture("./")

describe("meta normalization", () => {
  beforeAll(async () => {
    await hub.setup()
  })

  afterEach(() => {
    dark$.meta.clear()
    dark$.fields.clear()
    dark$.particles.clear()
  })

  afterAll(async () => {
    resetCanonicalMetaContext()
    await hub.teardown()
  })

  test("повторная materialization одинакового src переиспользует Meta и MetaField вместо новых копий", async () => {
    const firstRoot = new Wimp({ src: "zavx0z/git", parent: null })
    await matter(firstRoot)

    const firstMetaCount = dark$.meta.size
    const firstFieldCount = dark$.fields.size
    const firstMeta = firstRoot.meta

    const secondRoot = new Wimp({ src: "zavx0z/git", parent: null })
    await matter(secondRoot)

    expect(firstMeta, "первая materialization должна привязать корневой Wimp к Meta").toBeDefined()
    expect(secondRoot.meta, "вторая materialization тоже должна привязать Wimp к Meta").toBe(firstMeta)
    expect(dark$.meta.size, "повторный проход не должен дублировать Meta в store").toBe(firstMetaCount)
    expect(dark$.fields.size, "повторный проход не должен дублировать MetaField в store").toBe(firstFieldCount)
  })
})
