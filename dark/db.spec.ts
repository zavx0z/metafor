import { describe, expect, test } from "bun:test"
import { assembleSharedDbProjection } from "./db.ts"
import { createSharedDbFixture } from "./db.fixture.ts"

describe("dark shared db export", () => {
  test("уплощает materialized Wimp-граф в стабильные записи бран и полей", () => {
    const fixture = createSharedDbFixture()
    const projection = assembleSharedDbProjection(fixture.root)

    expect(projection.rootBraneIndex).toBe(0)
    expect(projection.branes).toHaveLength(2)
    expect(projection.fields).toHaveLength(6)
    expect(projection.fieldValues).toHaveLength(6)

    expect(projection.braneIndexByDarkId.get(fixture.root.id)).toBe(0)
    expect(projection.braneIndexByDarkId.get(fixture.child.id)).toBe(1)
    expect(projection.branes[1]?.darkWimpId).toBe(fixture.child.id)
    expect(projection.fields[3]?.darkFieldId).toBe(fixture.fields.childAlias.id)
  })

  test("ordinary source-links сохраняются, topology-поля не попадают в обычную таблицу связей", () => {
    const fixture = createSharedDbFixture()
    const projection = assembleSharedDbProjection(fixture.root)

    expect(projection.fieldSources).toHaveLength(1)
    expect(projection.fieldSourceByChildFieldIndex[3]).toEqual({ childFieldIndex: 3, parentFieldIndex: 0 })
    expect(projection.fieldSourceByChildFieldIndex[4]).toBeUndefined()
    expect(projection.fieldSourceByChildFieldIndex[5]).toBeUndefined()
    expect(projection.dependentFieldIndexesByParentFieldIndex.get(0)).toEqual([3])
  })
})
