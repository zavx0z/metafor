import { describe, expect, test } from "bun:test"
import { assembleSharedOrmProjection } from "@shared/orm"
import { buildBoundaryDatabase, openBoundaryDatabase, prepareBoundaryDatabaseData } from "../database.ts"
import { createSharedOrmFixture } from "../../shared/orm/test.fixture.ts"

describe("boundary database from shared orm", () => {
  test("строит собственную базу из shared orm и не делает boundary владельцем ORM-объектов", () => {
    const fixture = createSharedOrmFixture()
    const projection = assembleSharedOrmProjection(fixture.root)
    const database = buildBoundaryDatabase(projection)

    expect(database.branes).toHaveLength(2)
    expect(database.fields).toHaveLength(6)
    expect(database.fieldSources).toHaveLength(1)

    expect(database.branes).not.toBe(projection.branes)
    expect(database.fields[0]).not.toBe(projection.fields[0])
    expect(database.fieldValues[0]).not.toBe(projection.fieldValues[0])

    expect(database.getBraneByDarkId(fixture.root.id)?.index).toBe(0)
    expect(database.getFieldByDarkId(fixture.fields.childAlias.id)?.ownerBraneIndex).toBe(1)
  })

  test("публичный boundary API остаётся базо-ориентированным: индексный доступ, чтение source и обновление значений", () => {
    const fixture = createSharedOrmFixture()
    const projection = assembleSharedOrmProjection(fixture.root)
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

  test("prepare/open разделяют состояние базы и позволяют переоткрыть её без shared orm handle", () => {
    const fixture = createSharedOrmFixture()
    const projection = assembleSharedOrmProjection(fixture.root)
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
})
