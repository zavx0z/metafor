import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { HubFixture } from "fixture"
import reference from "../github/zavx0z/git/meta.ts"
import { StoreMetaSqlite } from "@store/meta/sqlite"
import { loadMeta } from "./load.ts"
import { resetDarkLoadContext } from "./tests/test.helper.ts"

const hub = new HubFixture()

describe("loadMeta", () => {
  beforeAll(async () => await hub.setup())
  afterAll(async () => {
    resetDarkLoadContext()
    await hub.teardown()
  })

  test("канонизирует одну meta в SQLite и возвращает particle runtime model", async () => {
    const loaded = await loadMeta("zavx0z/git")
    if (!loaded) throw new Error("SQLite context is unavailable")

    const projection = await StoreMetaSqlite.open(loaded.db as any).then((store) => store.readDarkParticleModel("zavx0z/git"))
    if (!projection) throw new Error("projection not found")

    expect(projection.meta.src).toBe("zavx0z/git")
    expect(projection.meta.name).toBe(reference.name)
    expect(projection.meta.fieldSchemas).toEqual(reference.fields)
    expect(projection.meta.superposition).toEqual(reference.superposition)
    expect(projection.meta.processes).toEqual(reference.processes)
    expect(projection.meta.reactions).toBeUndefined()
    expect(projection.meta.mass).toBeUndefined()
    expect(projection.particles.map((particle) => particle.kind)).toEqual(["fuzzy", "axion"])
  })

  test("переиспользует общий in-memory SQLite-контекст между вызовами", async () => {
    const firstLoad = await loadMeta("zavx0z/git")
    const secondLoad = await loadMeta("zavx0z/git-start")

    expect(firstLoad).not.toBeNull()
    expect(secondLoad).not.toBeNull()
    expect(secondLoad?.db).toBe(firstLoad?.db)
  })
})
