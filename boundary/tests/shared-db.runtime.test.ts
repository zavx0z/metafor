import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test"
import { Wimp } from "@dark/strong"
import { openSharedDbMaterializationWriter, openSharedDbMemoryBackend, openSharedDbSqliteBackend } from "@shared/db"
import { HubFixture } from "fixture"
import { matter } from "../../dark/dark.ts"
import { createSharedDbFixture } from "../../dark/db.fixture.ts"
import { dark$ } from "../../dark/store.ts"
import {
  addRuntimeWimpFromSharedDb,
  boundary$,
  listRuntimeWimpIds,
  prepareRuntimeFromSharedDb,
  rebuildRuntime,
  removeRuntimeWimp,
  writeRuntimeFromSharedDb,
} from "../boundary.ts"
import { resetBoundaryForTest } from "./test.helper"
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

const materializeFixtureToSharedDb = () => {
  const fixture = createSharedDbFixture()
  const backend = openSharedDbMemoryBackend()
  const writer = openSharedDbMaterializationWriter(backend)

  fixture.root.save(writer)
  fixture.child.save(writer)

  return { fixture, backend }
}

describe("boundary runtime from shared/db backend", () => {
  beforeAll(async () => {
    await hub.setup()
  })

  afterEach(async () => {
    await resetBoundaryForTest()
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

  test("add/remove мутируют loaded fragment, а один rebuild пересобирает derived runtime транзакционно", async () => {
    const { fixture, backend } = materializeFixtureToSharedDb()

    try {
      expect(listRuntimeWimpIds()).toEqual([])
      expect(boundary$.branes).toEqual([])

      await addRuntimeWimpFromSharedDb(backend, fixture.root.id)
      expect(listRuntimeWimpIds()).toEqual([fixture.root.id])
      expect(boundary$.branes).toEqual([])
      expect(weak$.initialized).toBe(false)

      await addRuntimeWimpFromSharedDb(backend, fixture.child.id)
      expect(listRuntimeWimpIds()).toEqual([fixture.root.id, fixture.child.id])
      expect(boundary$.branes).toEqual([])

      const initialChanges = await rebuildRuntime()
      expect(initialChanges).toEqual([])
      expect(weak$.initialized).toBe(true)
      expect(boundary$.branes).toHaveLength(2)
      expect(boundary$.sharedBlocks).toHaveLength(1)
      expect(boundary$.braneSharedBlockRefs).toEqual([0, 0])

      removeRuntimeWimp(fixture.child.id)
      expect(listRuntimeWimpIds()).toEqual([fixture.root.id])
      expect(boundary$.branes).toHaveLength(2)
      expect(boundary$.sharedBlocks).toHaveLength(1)

      const removalChanges = await rebuildRuntime()
      expect(removalChanges).toEqual([])
      expect(boundary$.branes).toHaveLength(1)
      expect(boundary$.sharedBlocks).toEqual([])
    } finally {
      backend.close()
    }
  })

  test("пересобирает runtime из уже загруженного loaded fragment без повторного чтения всей DB", async () => {
    const { fixture, backend } = materializeFixtureToSharedDb()

    await addRuntimeWimpFromSharedDb(backend, fixture.root.id)
    await addRuntimeWimpFromSharedDb(backend, fixture.child.id)

    backend.close()

    await rebuildRuntime()
    expect(boundary$.branes).toHaveLength(2)
    expect(boundary$.sharedBlocks).toHaveLength(1)

    removeRuntimeWimp(fixture.child.id)

    const changes = await rebuildRuntime()
    expect(changes).toEqual([])
    expect(boundary$.branes).toHaveLength(1)
    expect(boundary$.sharedBlocks).toEqual([])
    expect(boundary$.states).toHaveLength(1)
  })
})
