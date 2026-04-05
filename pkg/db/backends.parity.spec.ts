import { describe, expect, test } from "bun:test"
import { IDBFactory } from "fake-indexeddb"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createDbFixture } from "fixture/db.fixture.ts"
import { normalizeDbData } from "./backend.ts"
import { openDbIndexedDbBackend } from "./idb.ts"
import { openDbMaterializationWriter } from "./materialize.ts"
import { openDbSqliteBackend } from "./sqlite.ts"
import { deriveUuid } from "./uuid.ts"

const createParityBackends = async () => {
  const sqlite = openDbSqliteBackend()
  const indexeddb = await openDbIndexedDbBackend({
    indexedDb: new IDBFactory(),
    databaseName: `metafor-db-parity-${crypto.randomUUID()}`,
  })

  return { sqlite, indexeddb }
}

const createPersistentParityTarget = () => {
  const dir = mkdtempSync(join(tmpdir(), "metafor-db-parity-"))

  return {
    dir,
    sqliteFilename: join(dir, "db.sqlite"),
    indexedDb: new IDBFactory(),
    databaseName: `metafor-db-parity-${crypto.randomUUID()}`,
  }
}

const openPersistentParityBackends = async (target: ReturnType<typeof createPersistentParityTarget>) => ({
  sqlite: openDbSqliteBackend({ filename: target.sqliteFilename }),
  indexeddb: await openDbIndexedDbBackend({
    indexedDb: target.indexedDb,
    databaseName: target.databaseName,
  }),
})

describe("db backend parity", () => {
  test("SQLite и IndexedDB читают одинаковые addressable row groups после одной materialization sequence", async () => {
    const fixture = createDbFixture()
    const { sqlite, indexeddb } = await createParityBackends()
    const sqliteWriter = openDbMaterializationWriter(sqlite)
    const indexeddbWriter = openDbMaterializationWriter(indexeddb)
    const rootEntanglementId = deriveUuid("entanglement-family", fixture.fields.rootTitle!.id)

    try {
      await fixture.root.save(sqliteWriter)
      await fixture.child.save(sqliteWriter)
      await fixture.root.save(indexeddbWriter)
      await fixture.child.save(indexeddbWriter)
      await indexeddb.flush()

      expect(await sqlite.listWimpIds()).toEqual(await indexeddb.listWimpIds())
      expect(await sqlite.readMetaRows(fixture.root.meta!.id)).toEqual(await indexeddb.readMetaRows(fixture.root.meta!.id))
      expect(await sqlite.readMetaRows(fixture.child.meta!.id)).toEqual(await indexeddb.readMetaRows(fixture.child.meta!.id))
      expect(await sqlite.readWimpRows(fixture.root.id)).toEqual(await indexeddb.readWimpRows(fixture.root.id))
      expect(await sqlite.readWimpRows(fixture.child.id)).toEqual(await indexeddb.readWimpRows(fixture.child.id))
      expect(await sqlite.readWimpField(fixture.fields.childAlias!.id)).toEqual(
        await indexeddb.readWimpField(fixture.fields.childAlias!.id),
      )
      expect(await sqlite.readWimpEdge(fixture.child.id)).toEqual(await indexeddb.readWimpEdge(fixture.child.id))
      expect(await sqlite.readFieldValue(fixture.fields.childAlias!.id)).toEqual(
        await indexeddb.readFieldValue(fixture.fields.childAlias!.id),
      )
      expect(await sqlite.readFieldSource(fixture.fields.childAlias!.id)).toEqual(
        await indexeddb.readFieldSource(fixture.fields.childAlias!.id),
      )
      expect(await sqlite.readEntanglementFamily(rootEntanglementId)).toEqual(
        await indexeddb.readEntanglementFamily(rootEntanglementId),
      )
    } finally {
      await indexeddb.flush()
      sqlite.close()
      indexeddb.close()
    }
  })

  test("SQLite и IndexedDB одинаково ведут себя при row-group replace, point value update и delete/write entanglement family", async () => {
    const fixture = createDbFixture()
    const { sqlite, indexeddb } = await createParityBackends()
    const sqliteWriter = openDbMaterializationWriter(sqlite)
    const indexeddbWriter = openDbMaterializationWriter(indexeddb)
    const rootEntanglementId = deriveUuid("entanglement-family", fixture.fields.rootTitle!.id)

    try {
      await fixture.root.save(sqliteWriter)
      await fixture.child.save(sqliteWriter)
      await fixture.root.save(indexeddbWriter)
      await fixture.child.save(indexeddbWriter)
      await indexeddb.flush()

      fixture.child.fields!.alias!.value = "Alias after resave"
      await fixture.child.save(sqliteWriter)
      await fixture.child.save(indexeddbWriter)
      await indexeddb.flush()

      expect(await sqlite.readWimpRows(fixture.child.id)).toEqual(await indexeddb.readWimpRows(fixture.child.id))

      const rootReadyStateId = (await sqlite.readMetaRows(fixture.root.meta!.id))?.states.find((row) => row.stateName === "ready")?.id
      expect(rootReadyStateId).toBeDefined()

      await sqlite.setWimpState(fixture.root.id, rootReadyStateId!)
      await indexeddb.setWimpState(fixture.root.id, rootReadyStateId!)
      await indexeddb.flush()

      expect(await sqlite.readWimpRows(fixture.root.id)).toEqual(await indexeddb.readWimpRows(fixture.root.id))

      await sqlite.setFieldValue(fixture.fields.childAlias!.id, "Alias via backend update")
      await indexeddb.setFieldValue(fixture.fields.childAlias!.id, "Alias via backend update")
      await indexeddb.flush()

      expect(await sqlite.readFieldValue(fixture.fields.childAlias!.id)).toEqual(
        await indexeddb.readFieldValue(fixture.fields.childAlias!.id),
      )

      const family = await sqlite.readEntanglementFamily(rootEntanglementId)
      expect(family).not.toBeNull()

      await sqlite.deleteEntanglementFamily(rootEntanglementId)
      await indexeddb.deleteEntanglementFamily(rootEntanglementId)
      await indexeddb.flush()

      expect(await sqlite.readEntanglementFamily(rootEntanglementId)).toBeNull()
      expect(await indexeddb.readEntanglementFamily(rootEntanglementId)).toBeNull()

      await sqlite.writeEntanglementFamily(family!)
      await indexeddb.writeEntanglementFamily(family!)
      await indexeddb.flush()

      expect(await sqlite.readEntanglementFamily(rootEntanglementId)).toEqual(
        await indexeddb.readEntanglementFamily(rootEntanglementId),
      )
    } finally {
      await indexeddb.flush()
      sqlite.close()
      indexeddb.close()
    }
  })

  test("SQLite и IndexedDB совпадают по full backend state после operational writes, reopen и reset", async () => {
    const target = createPersistentParityTarget()
    const fixture = createDbFixture()
    const rootEntanglementId = deriveUuid("entanglement-family", fixture.fields.rootTitle!.id)

    try {
      const initial = await openPersistentParityBackends(target)
      const sqliteWriter = openDbMaterializationWriter(initial.sqlite)
      const indexeddbWriter = openDbMaterializationWriter(initial.indexeddb)

      try {
        await fixture.root.save(sqliteWriter)
        await fixture.child.save(sqliteWriter)
        await fixture.root.save(indexeddbWriter)
        await fixture.child.save(indexeddbWriter)

        fixture.child.fields!.alias!.value = "Alias after first resave"
        await fixture.child.save(sqliteWriter)
        await fixture.child.save(indexeddbWriter)

        fixture.child.fields!.alias!.value = "Alias after second resave"
        await fixture.child.save(sqliteWriter)
        await fixture.child.save(indexeddbWriter)

        await initial.sqlite.setFieldValue(fixture.fields.childAlias!.id, "Alias via backend update")
        await initial.indexeddb.setFieldValue(fixture.fields.childAlias!.id, "Alias via backend update")

        const rootReadyStateId = (await initial.sqlite.readMetaRows(fixture.root.meta!.id))?.states.find((row) => row.stateName === "ready")?.id
        expect(rootReadyStateId).toBeDefined()
        await initial.sqlite.setWimpState(fixture.root.id, rootReadyStateId!)
        await initial.indexeddb.setWimpState(fixture.root.id, rootReadyStateId!)

        const family = await initial.sqlite.readEntanglementFamily(rootEntanglementId)
        expect(family).not.toBeNull()

        await initial.sqlite.deleteEntanglementFamily(rootEntanglementId)
        await initial.indexeddb.deleteEntanglementFamily(rootEntanglementId)
        await initial.sqlite.writeEntanglementFamily(family!)
        await initial.indexeddb.writeEntanglementFamily(family!)
        await initial.indexeddb.flush()

        expect(normalizeDbData(initial.sqlite.readData())).toEqual(
          normalizeDbData(initial.indexeddb.readData()),
        )
      } finally {
        await initial.indexeddb.flush()
        initial.sqlite.close()
        initial.indexeddb.close()
      }

      const reopened = await openPersistentParityBackends(target)
      try {
        expect(normalizeDbData(reopened.sqlite.readData())).toEqual(normalizeDbData(reopened.indexeddb.readData()))
        expect(await reopened.sqlite.readWimpRows(fixture.child.id)).toEqual(await reopened.indexeddb.readWimpRows(fixture.child.id))
        expect(await reopened.sqlite.readFieldValue(fixture.fields.childAlias!.id)).toEqual(
          await reopened.indexeddb.readFieldValue(fixture.fields.childAlias!.id),
        )

        await reopened.sqlite.reset()
        await reopened.indexeddb.reset()
        await reopened.indexeddb.flush()

        expect(normalizeDbData(reopened.sqlite.readData())).toEqual(normalizeDbData(reopened.indexeddb.readData()))
        expect(reopened.sqlite.readData().wimps).toEqual([])
        expect(reopened.indexeddb.readData().wimps).toEqual([])
      } finally {
        await reopened.indexeddb.flush()
        reopened.sqlite.close()
        reopened.indexeddb.close()
      }
    } finally {
      rmSync(target.dir, { recursive: true, force: true })
    }
  })
})
