import { describe, expect, test } from "bun:test"
import { IDBFactory } from "fake-indexeddb"
import { createSharedDbFixture } from "fixture/db.fixture.ts"
import { openSharedDbIndexedDbBackend } from "./indexeddb.ts"
import { openSharedDbMaterializationWriter } from "./materialize.ts"
import { openSharedDbSqliteBackend } from "./sqlite.ts"
import { deriveUuid } from "./uuid.ts"

const createParityBackends = async () => {
  const sqlite = openSharedDbSqliteBackend()
  const indexeddb = await openSharedDbIndexedDbBackend({
    indexedDb: new IDBFactory(),
    databaseName: `metafor-shared-db-parity-${crypto.randomUUID()}`,
  })

  return { sqlite, indexeddb }
}

describe("shared db backend parity", () => {
  test("SQLite и IndexedDB читают одинаковые addressable row groups после одной materialization sequence", async () => {
    const fixture = createSharedDbFixture()
    const { sqlite, indexeddb } = await createParityBackends()
    const sqliteWriter = openSharedDbMaterializationWriter(sqlite)
    const indexeddbWriter = openSharedDbMaterializationWriter(indexeddb)
    const rootEntanglementId = deriveUuid("entanglement-family", fixture.fields.rootTitle!.id)

    try {
      await fixture.root.save(sqliteWriter)
      await fixture.child.save(sqliteWriter)
      await fixture.root.save(indexeddbWriter)
      await fixture.child.save(indexeddbWriter)
      await indexeddb.flush()

      expect(await sqlite.readMetaRows(fixture.root.meta!.id)).toEqual(await indexeddb.readMetaRows(fixture.root.meta!.id))
      expect(await sqlite.readMetaRows(fixture.child.meta!.id)).toEqual(await indexeddb.readMetaRows(fixture.child.meta!.id))
      expect(await sqlite.readWimpRows(fixture.root.id)).toEqual(await indexeddb.readWimpRows(fixture.root.id))
      expect(await sqlite.readWimpRows(fixture.child.id)).toEqual(await indexeddb.readWimpRows(fixture.child.id))
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
    const fixture = createSharedDbFixture()
    const { sqlite, indexeddb } = await createParityBackends()
    const sqliteWriter = openSharedDbMaterializationWriter(sqlite)
    const indexeddbWriter = openSharedDbMaterializationWriter(indexeddb)
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
})
