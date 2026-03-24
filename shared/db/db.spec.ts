import { describe, expect, test } from "bun:test"
import { assembleSharedDbData } from "../../dark/db.ts"
import { createSharedDbFixture } from "../../dark/db.fixture.ts"
import {
  getSharedDbDependentFieldSources,
  getSharedDbEntanglementFields,
  getSharedDbEntanglementMembers,
  getSharedDbFieldSource,
  getSharedDbFieldValue,
  getSharedDbMetaById,
  getSharedDbMetaFields,
  getSharedDbWimpById,
  getSharedDbWimpFields,
} from "./db.ts"

describe("shared db relational read helpers", () => {
  test("читает канонические сущности и relation rows по UUID identity", () => {
    const fixture = createSharedDbFixture()
    const data = assembleSharedDbData(fixture.root)

    expect(getSharedDbMetaById(data, fixture.root.meta!.id)?.src).toBe("meta/root")
    expect(getSharedDbMetaFields(data, fixture.root.meta!.id).map((field) => field.fieldKey)).toEqual([
      "title",
      "mode",
      "items",
    ])
    expect(getSharedDbWimpById(data, fixture.child.id)?.metaId).toBe(fixture.child.meta!.id)
    expect(getSharedDbWimpFields(data, fixture.child.id).map((field) => field.id)).toEqual([
      fixture.fields.childAlias.id,
      fixture.fields.childMode.id,
      fixture.fields.childItems.id,
    ])
    expect(getSharedDbFieldValue(data, fixture.fields.childAlias.id)?.value).toBe("Root title")
    expect(getSharedDbFieldSource(data, fixture.fields.childAlias.id)?.parentWimpFieldId).toBe(fixture.fields.rootTitle.id)
    expect(getSharedDbDependentFieldSources(data, fixture.fields.rootMode.id).map((row) => row.childWimpFieldId)).toEqual([
      fixture.fields.childMode.id,
    ])

    expect(data.entanglements).toHaveLength(3)

    const titleFamily = data.entanglementFields.find((field) => field.fieldName === "title")
    expect(titleFamily).toBeDefined()
    expect(getSharedDbEntanglementMembers(data, titleFamily!.ownerEntanglementId).map((member) => member.wimpId)).toEqual([
      fixture.root.id,
      fixture.child.id,
    ])
    expect(getSharedDbEntanglementFields(data, titleFamily!.ownerEntanglementId).map((field) => field.fieldName)).toEqual([
      "title",
    ])
  })
})
