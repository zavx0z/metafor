import { describe, expect, test } from "bun:test"
import { assembleSharedDbProjection } from "../../dark/db.ts"
import { openSharedDbSqliteBackend } from "@shared/db"
import {
  buildBoundaryDatabase,
  buildBoundaryDatabaseFromSharedDb,
  openBoundaryDatabase,
  prepareBoundaryDatabaseData,
} from "../database.ts"
import { createSharedDbFixture } from "../../dark/db.fixture.ts"

describe("boundary database from shared db", () => {
  test("строит собственную базу из shared db и не делает boundary владельцем общей проекции", () => {
    const fixture = createSharedDbFixture()
    const projection = assembleSharedDbProjection(fixture.root)
    const database = buildBoundaryDatabase(projection)

    expect(database.branes).toHaveLength(2)
    expect(database.fields).toHaveLength(6)
    expect(database.fieldSources).toHaveLength(1)
    expect(database.entanglementFields).toHaveLength(3)
    expect(database.stateSeedStates).toHaveLength(4)

    expect(database.branes).not.toBe(projection.branes)
    expect(database.fields[0]).not.toBe(projection.fields[0])
    expect(database.fieldValues[0]).not.toBe(projection.fieldValues[0])

    expect(database.getBraneByDarkId(fixture.root.id)?.index).toBe(0)
    expect(database.getFieldByDarkId(fixture.fields.childAlias.id)?.ownerBraneIndex).toBe(1)
  })

  test("публичный boundary API остаётся базо-ориентированным: индексный доступ, чтение source и обновление значений", () => {
    const fixture = createSharedDbFixture()
    const projection = assembleSharedDbProjection(fixture.root)
    const database = buildBoundaryDatabase(projection)

    const childAlias = database.getFieldByKey(1, "alias")!
    const rootTitle = database.getFieldByKey(0, "title")!

    expect(database.getFieldValue(childAlias.index)?.value).toBe("Root title")
    expect(database.getFieldSource(childAlias.index)).toEqual({
      childFieldIndex: childAlias.index,
      parentFieldIndex: rootTitle.index,
    })
    expect(database.getDependentFields(rootTitle.index).map((field) => field.key)).toEqual(["alias"])

    database.setFieldValue(childAlias.index, "Child override")
    expect(database.getFieldValue(childAlias.index)?.value).toBe("Child override")
    expect(projection.fieldValues[childAlias.index]?.value).toBe("Root title")
  })

  test("prepare/open разделяют состояние базы и позволяют переоткрыть её без shared db handle", () => {
    const fixture = createSharedDbFixture()
    const projection = assembleSharedDbProjection(fixture.root)
    const prepared = prepareBoundaryDatabaseData(projection)
    const database = openBoundaryDatabase(prepared)

    expect(database.getBrane(1)?.src).toBe("meta/child")
    expect(database.getFieldByKey(1, "mode")?.schema.topology).toBe(true)

    database.reset()
    expect(database.branes).toEqual([])
    expect(database.fields).toEqual([])

    database.restore(prepared)
    expect(database.getFieldByKey(1, "alias")?.darkFieldId).toBe(fixture.fields.childAlias.id)
  })

  test("может загрузить boundary database напрямую из shared/db backend", () => {
    const fixture = createSharedDbFixture()
    const projection = assembleSharedDbProjection(fixture.root)
    const backend = openSharedDbSqliteBackend()

    try {
      backend.writeProjection(projection)
      const database = buildBoundaryDatabaseFromSharedDb(backend)

      expect(database.getBraneByDarkId(fixture.child.id)?.index).toBe(1)
      expect(database.getFieldByKey(1, "mode")?.darkFieldId).toBe(fixture.fields.childMode.id)
      expect(database.getFieldSource(3)).toEqual({ childFieldIndex: 3, parentFieldIndex: 0 })
    } finally {
      backend.close()
    }
  })
})
