import {afterAll, afterEach, beforeAll, beforeEach, describe, expect, test} from "bun:test"
import {HubFixture} from "fixture"
import {open} from "../store/server.ts"
import {matter} from "./index.ts"
import {Wimp} from "@dark/strong"
import {dark$} from "./store.ts"

const hub = new HubFixture("./")

describe("meta normalization", () => {
  let store: Awaited<ReturnType<typeof open>>

  beforeAll(async () => {
    await hub.setup()
  })

  beforeEach(async () => {
    store = await open(":memory:")
  })

  afterEach(async () => {
    dark$.meta.clear()
    dark$.fields.clear()
    dark$.particles.clear()
    dark$.metaIndex.clear()
    await store.close()
  })

  afterAll(async () => {
    await hub.teardown()
  })

  test("повторная materialization одинакового src переиспользует Meta и MetaField вместо новых копий", async () => {
    const firstRoot = new Wimp({src: "zavx0z/git", parent: null})
    await matter(firstRoot, undefined, {store})

    const firstMetaCount = dark$.meta.size
    const firstFieldCount = dark$.fields.size
    const firstMeta = firstRoot.meta

    const secondRoot = new Wimp({src: "zavx0z/git", parent: null})
    await matter(secondRoot, undefined, {store})

    expect(firstMeta, "первая materialization должна привязать корневой Wimp к Meta").toBeDefined()
    expect(secondRoot.meta, "вторая materialization тоже должна привязать Wimp к Meta").toBe(firstMeta)
    expect(dark$.meta.size, "повторный проход не должен дублировать Meta в store").toBe(firstMetaCount)
    expect(dark$.fields.size, "повторный проход не должен дублировать MetaField в store").toBe(firstFieldCount)
  })
})
