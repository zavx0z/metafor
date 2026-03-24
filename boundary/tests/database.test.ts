import { describe, expect, test } from "bun:test"
import { assembleSharedDbData } from "../../dark/db.ts"
import { openSharedDbSqliteBackend } from "@shared/db"
import {
  buildBoundaryDatabase,
  buildBoundaryDatabaseFromSharedDb,
  openBoundaryDatabase,
  prepareBoundaryDatabaseData,
} from "../database.ts"
import { createSharedDbFixture } from "../../dark/db.fixture.ts"

describe("boundary database from shared db", () => {
  test("строит derived in-memory базу из canonical relational DB data", () => {
    const fixture = createSharedDbFixture()
    const data = assembleSharedDbData(fixture.root)
    const database = buildBoundaryDatabase(data)

    expect(database.branes).toHaveLength(2)
    expect(database.fields).toHaveLength(6)
    expect(database.fieldSources).toHaveLength(3)
    expect(database.entanglementFields).toHaveLength(3)
    expect(database.stateSeedStates).toHaveLength(4)

    expect(database.getBraneByWimpId(fixture.root.id)?.index).toBe(0)
    expect(database.getFieldByWimpFieldId(fixture.fields.childAlias.id)?.ownerBraneIndex).toBe(1)
  })

  test("публичный boundary API остаётся базо-ориентированным: индексный доступ, source и обновление значений", () => {
    const fixture = createSharedDbFixture()
    const data = assembleSharedDbData(fixture.root)
    const database = buildBoundaryDatabase(data)

    const childAlias = database.getFieldByKey(1, "alias")!
    const rootTitle = database.getFieldByKey(0, "title")!
    const rootMode = database.getFieldByKey(0, "mode")!

    expect(database.getFieldValue(childAlias.index)?.value).toBe("Root title")
    expect(database.getFieldSource(childAlias.index)).toEqual({
      id: expect.any(String),
      childFieldIndex: childAlias.index,
      parentFieldIndex: rootTitle.index,
    })
    expect(database.getDependentFields(rootMode.index).map((field) => field.key)).toEqual(["mode"])

    database.setFieldValue(childAlias.index, "Child override")
    expect(database.getFieldValue(childAlias.index)?.value).toBe("Child override")
  })

  test("prepare/open разделяют состояние базы и позволяют переоткрыть её без shared db handle", () => {
    const fixture = createSharedDbFixture()
    const data = assembleSharedDbData(fixture.root)
    const prepared = prepareBoundaryDatabaseData(data)
    const database = openBoundaryDatabase(prepared)

    expect(database.getBrane(1)?.src).toBe("meta/child")
    expect(database.getFieldByKey(1, "mode")?.schema.topology).toBe(true)

    database.reset()
    expect(database.branes).toEqual([])
    expect(database.fields).toEqual([])

    database.restore(prepared)
    expect(database.getFieldByKey(1, "alias")?.wimpFieldId).toBe(fixture.fields.childAlias.id)
  })

  test("может загрузить boundary database напрямую из shared/db backend", () => {
    const fixture = createSharedDbFixture()
    const data = assembleSharedDbData(fixture.root)
    const backend = openSharedDbSqliteBackend()

    try {
      backend.writeData(data)
      const database = buildBoundaryDatabaseFromSharedDb(backend)

      expect(database.getBraneByWimpId(fixture.child.id)?.index).toBe(1)
      expect(database.getFieldByKey(1, "mode")?.wimpFieldId).toBe(fixture.fields.childMode.id)
      expect(database.getFieldSource(database.getFieldByKey(1, "alias")!.index)?.parentFieldIndex).toBe(
        database.getFieldByKey(0, "title")!.index,
      )
    } finally {
      backend.close()
    }
  })
})
