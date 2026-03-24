import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test"
import { Wimp } from "@dark/strong"
import { openSharedDbMaterializationWriter, openSharedDbSqliteBackend } from "@shared/db"
import { HubFixture } from "fixture"
import { matter } from "../../dark/dark.ts"
import { dark$ } from "../../dark/store.ts"
import { boundary$, prepareRuntimeFromSharedDb, reset, writeRuntimeFromSharedDb } from "../boundary.ts"
import { weak$ } from "../weak"

const hub = new HubFixture("./github/")

const resetDarkStore = (): void => {
  dark$.meta.clear()
  dark$.fields.clear()
  dark$.particles.clear()
}

const materializeGithubWorldToSharedDb = async () => {
  const backend = openSharedDbSqliteBackend()
  const writer = openSharedDbMaterializationWriter(backend)

  await matter(new Wimp({ src: "zavx0z/git", parent: null }), undefined, { sharedDbWriter: writer })

  return backend
}

describe("boundary runtime from shared/db backend", () => {
  beforeAll(async () => {
    await hub.setup()
  })

  afterEach(() => {
    reset()
    resetDarkStore()
  })

  afterAll(async () => {
    resetDarkStore()
    await hub.teardown()
  })

  test("публичный boundary API читает shared/db backend, собранный прямо из matter materialization", async () => {
    const backend = await materializeGithubWorldToSharedDb()

    try {
      const sharedData = backend.readData()
      const prepared = prepareRuntimeFromSharedDb(backend)

      expect(sharedData.metas.some((meta) => meta.id === "zavx0z/git")).toBe(true)
      expect(sharedData.wimps.length).toBeGreaterThan(0)
      expect(sharedData.fieldValues.length).toBe(sharedData.wimpFields.length)
      expect(prepared.branes).toHaveLength(sharedData.wimps.length)
      expect(prepared.fields.length).toBeGreaterThan(0)
      expect(prepared.states).toHaveLength(sharedData.wimps.length)
      expect(prepared.stringTable.length).toBeGreaterThan(0)
    } finally {
      backend.close()
    }
  })

  test("проходит путь AST -> shared/db backend -> unified boundary runtime API -> weak", async () => {
    const backend = await materializeGithubWorldToSharedDb()

    try {
      const sharedData = backend.readData()
      const prepared = prepareRuntimeFromSharedDb(backend)

      const changes = await writeRuntimeFromSharedDb(backend)
      expect(changes).toEqual([])
      expect(weak$.initialized).toBe(true)
      expect(boundary$.branes).toHaveLength(sharedData.wimps.length)
      expect(boundary$.states).toHaveLength(sharedData.wimps.length)
      expect(boundary$.fields).toEqual(prepared.fields)
      expect(boundary$.stringTable).toEqual(prepared.stringTable)
      expect(boundary$.sharedValues.length + boundary$.braneValues.length).toBeGreaterThan(0)
      expect(boundary$.sharedBlocks.length + boundary$.braneSharedBlockRefs.length).toBeGreaterThan(0)
    } finally {
      backend.close()
    }
  })
})
