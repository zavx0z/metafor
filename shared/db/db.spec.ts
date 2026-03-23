import { describe, expect, test } from "bun:test"
import {
  assembleSharedDbProjection,
  getSharedDbBraneByDarkId,
  getSharedDbBraneByIndex,
  getSharedDbBraneFields,
  getSharedDbDependentFields,
  getSharedDbFieldByDarkId,
  getSharedDbFieldByKey,
  getSharedDbFieldSource,
  getSharedDbFieldValue,
} from "./index.ts"
import { createSharedDbFixture } from "./test.fixture.ts"

describe("shared db projection", () => {
  test("уплощает materialized Wimp-граф в стабильные записи бран и полей", () => {
    const fixture = createSharedDbFixture()
    const projection = assembleSharedDbProjection(fixture.root)

    expect(projection.rootBraneIndex).toBe(0)
    expect(projection.branes).toHaveLength(2)
    expect(projection.fields).toHaveLength(6)
    expect(projection.fieldValues).toHaveLength(6)

    expect(projection.braneIndexByDarkId.get(fixture.root.id)).toBe(0)
    expect(projection.braneIndexByDarkId.get(fixture.child.id)).toBe(1)
    expect(getSharedDbBraneByDarkId(projection, fixture.child.id)?.index).toBe(1)
    expect(getSharedDbBraneByIndex(projection, 0)?.darkWimpId).toBe(fixture.root.id)

    expect(getSharedDbBraneFields(projection, 0).map((field) => field.key)).toEqual(["title", "mode", "items"])
    expect(getSharedDbBraneFields(projection, 1).map((field) => field.key)).toEqual(["alias", "mode", "items"])

    const childAlias = getSharedDbFieldByKey(projection, 1, "alias")
    expect(childAlias?.darkFieldId).toBe(fixture.fields.childAlias.id)
    expect(getSharedDbFieldByDarkId(projection, fixture.fields.rootTitle.id)?.ownerBraneIndex).toBe(0)
    expect(getSharedDbFieldValue(projection, childAlias!.index)?.value).toBe("Root title")
  })

  test("сохраняет ordinary source-связь и отсекает topology-поля из обычной source-таблицы", () => {
    const fixture = createSharedDbFixture()
    const projection = assembleSharedDbProjection(fixture.root)

    const rootTitle = getSharedDbFieldByDarkId(projection, fixture.fields.rootTitle.id)!
    const childAlias = getSharedDbFieldByDarkId(projection, fixture.fields.childAlias.id)!
    const childMode = getSharedDbFieldByDarkId(projection, fixture.fields.childMode.id)!
    const childItems = getSharedDbFieldByDarkId(projection, fixture.fields.childItems.id)!

    expect(projection.fieldSources).toHaveLength(1)
    expect(getSharedDbFieldSource(projection, childAlias.index)).toEqual({
      childFieldIndex: childAlias.index,
      parentFieldIndex: rootTitle.index,
    })
    expect(getSharedDbFieldSource(projection, childMode.index)).toBeUndefined()
    expect(getSharedDbFieldSource(projection, childItems.index)).toBeUndefined()
  })

  test("готовые индексы дают прямой доступ к значениям и зависимым полям", () => {
    const fixture = createSharedDbFixture()
    const projection = assembleSharedDbProjection(fixture.root)

    const rootTitle = getSharedDbFieldByDarkId(projection, fixture.fields.rootTitle.id)!
    const dependents = getSharedDbDependentFields(projection, rootTitle.index)

    expect(dependents).toHaveLength(1)
    expect(dependents[0]?.darkFieldId).toBe(fixture.fields.childAlias.id)
    expect(projection.fieldIndexByBraneAndKey.get(1)?.get("alias")).toBe(dependents[0]?.index)
    expect(getSharedDbFieldValue(projection, dependents[0]!.index)?.value).toBe("Root title")
  })
})
