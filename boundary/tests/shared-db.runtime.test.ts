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
  reset,
  writeRuntimeFromSharedDb,
} from "../boundary.ts"
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

  test("добавляет и удаляет runtime-пакеты Wimp поверх уже записанной shared/db", async () => {
    const { fixture, backend } = materializeFixtureToSharedDb()

    try {
      expect(listRuntimeWimpIds()).toEqual([])

      await addRuntimeWimpFromSharedDb(backend, fixture.root.id)
      expect(listRuntimeWimpIds()).toEqual([fixture.root.id])
      expect(boundary$.branes).toHaveLength(1)
      expect(boundary$.sharedBlocks).toEqual([])

      await addRuntimeWimpFromSharedDb(backend, fixture.child.id)
      expect(listRuntimeWimpIds()).toEqual([fixture.root.id, fixture.child.id])
      expect(boundary$.branes).toHaveLength(2)
      expect(boundary$.sharedBlocks).toHaveLength(1)
      expect(boundary$.braneSharedBlockRefs).toEqual([0, 0])

      await removeRuntimeWimp(fixture.child.id)
      expect(listRuntimeWimpIds()).toEqual([fixture.root.id])
      expect(boundary$.branes).toHaveLength(1)
      expect(boundary$.sharedBlocks).toEqual([])
    } finally {
      backend.close()
    }
  })

  test("пересобирает runtime из уже загруженных runtime-пакетов без повторного чтения всей DB", async () => {
    const { fixture, backend } = materializeFixtureToSharedDb()

    try {
      await addRuntimeWimpFromSharedDb(backend, fixture.root.id)
      await addRuntimeWimpFromSharedDb(backend, fixture.child.id)

      const snapshot = {
        branes: structuredClone(boundary$.branes),
        fields: structuredClone(boundary$.fields),
        sharedBlocks: structuredClone(boundary$.sharedBlocks),
        sharedValues: structuredClone(boundary$.sharedValues),
        braneSharedBlockRefs: structuredClone(boundary$.braneSharedBlockRefs),
        stringTable: structuredClone(boundary$.stringTable),
        states: structuredClone(boundary$.states),
      }

      backend.close()

      const changes = await rebuildRuntime()
      expect(changes).toEqual([])
      expect(boundary$.branes).toEqual(snapshot.branes)
      expect(boundary$.fields).toEqual(snapshot.fields)
      expect(boundary$.sharedBlocks).toEqual(snapshot.sharedBlocks)
      expect(boundary$.sharedValues).toEqual(snapshot.sharedValues)
      expect(boundary$.braneSharedBlockRefs).toEqual(snapshot.braneSharedBlockRefs)
      expect(boundary$.stringTable).toEqual(snapshot.stringTable)
      expect(boundary$.states).toEqual(snapshot.states)
    } finally {
      backend.close()
    }
  })
})
