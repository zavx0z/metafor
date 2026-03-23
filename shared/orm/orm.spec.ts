import { describe, expect, test } from "bun:test"
import {
  assembleSharedOrmProjection,
  getSharedOrmBraneByDarkId,
  getSharedOrmBraneByIndex,
  getSharedOrmBraneFields,
  getSharedOrmDependentFields,
  getSharedOrmFieldByDarkId,
  getSharedOrmFieldByKey,
  getSharedOrmFieldSource,
  getSharedOrmFieldValue,
} from "./index.ts"
import { createSharedOrmFixture } from "./test.fixture.ts"

describe("shared orm projection", () => {
  test("уплощает materialized Wimp-граф в стабильные записи бран и полей", () => {
    const fixture = createSharedOrmFixture()
    const projection = assembleSharedOrmProjection(fixture.root)

    expect(projection.rootBraneIndex).toBe(0)
    expect(projection.branes).toHaveLength(2)
    expect(projection.fields).toHaveLength(6)
    expect(projection.fieldValues).toHaveLength(6)

    expect(projection.braneIndexByDarkId.get(fixture.root.id)).toBe(0)
    expect(projection.braneIndexByDarkId.get(fixture.child.id)).toBe(1)
    expect(getSharedOrmBraneByDarkId(projection, fixture.child.id)?.index).toBe(1)
    expect(getSharedOrmBraneByIndex(projection, 0)?.darkWimpId).toBe(fixture.root.id)

    expect(getSharedOrmBraneFields(projection, 0).map((field) => field.key)).toEqual(["title", "mode", "items"])
    expect(getSharedOrmBraneFields(projection, 1).map((field) => field.key)).toEqual(["alias", "mode", "items"])

    const childAlias = getSharedOrmFieldByKey(projection, 1, "alias")
    expect(childAlias?.darkFieldId).toBe(fixture.fields.childAlias.id)
    expect(getSharedOrmFieldByDarkId(projection, fixture.fields.rootTitle.id)?.ownerBraneIndex).toBe(0)
    expect(getSharedOrmFieldValue(projection, childAlias!.index)?.value).toBe("Root title")
  })

  test("сохраняет ordinary source-связь и отсекает topology-поля из обычной source-таблицы", () => {
    const fixture = createSharedOrmFixture()
    const projection = assembleSharedOrmProjection(fixture.root)

    const rootTitle = getSharedOrmFieldByDarkId(projection, fixture.fields.rootTitle.id)!
    const childAlias = getSharedOrmFieldByDarkId(projection, fixture.fields.childAlias.id)!
    const childMode = getSharedOrmFieldByDarkId(projection, fixture.fields.childMode.id)!
    const childItems = getSharedOrmFieldByDarkId(projection, fixture.fields.childItems.id)!

    expect(projection.fieldSources).toHaveLength(1)
    expect(getSharedOrmFieldSource(projection, childAlias.index)).toEqual({
      childFieldIndex: childAlias.index,
      parentFieldIndex: rootTitle.index,
    })
    expect(getSharedOrmFieldSource(projection, childMode.index)).toBeUndefined()
    expect(getSharedOrmFieldSource(projection, childItems.index)).toBeUndefined()
  })

  test("готовые индексы дают прямой доступ к значениям и зависимым полям", () => {
    const fixture = createSharedOrmFixture()
    const projection = assembleSharedOrmProjection(fixture.root)

    const rootTitle = getSharedOrmFieldByDarkId(projection, fixture.fields.rootTitle.id)!
    const dependents = getSharedOrmDependentFields(projection, rootTitle.index)

    expect(dependents).toHaveLength(1)
    expect(dependents[0]?.darkFieldId).toBe(fixture.fields.childAlias.id)
    expect(projection.fieldIndexByBraneAndKey.get(1)?.get("alias")).toBe(dependents[0]?.index)
    expect(getSharedOrmFieldValue(projection, dependents[0]!.index)?.value).toBe("Root title")
  })
})
