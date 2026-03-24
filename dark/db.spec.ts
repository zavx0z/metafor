import { describe, expect, test } from "bun:test"
import { assembleSharedDbData } from "./db.ts"
import { createSharedDbFixture } from "./db.fixture.ts"

describe("dark -> shared db legacy snapshot helper", () => {
  test("собирает canonical relational data для сравнения и отладки", () => {
    const fixture = createSharedDbFixture()
    const data = assembleSharedDbData(fixture.root)

    expect(data.metas.map((meta) => meta.src).sort()).toEqual(["meta/child", "meta/root"])
    expect(data.metaFields.map((field) => field.fieldKey).sort()).toEqual(["alias", "items", "items", "mode", "mode", "title"])
    expect(data.wimps.map((wimp) => wimp.id)).toEqual([fixture.child.id, fixture.root.id].sort())
    expect(data.wimpFields.map((field) => field.id)).toEqual(
      [
        fixture.fields.rootTitle.id,
        fixture.fields.rootMode.id,
        fixture.fields.rootItems.id,
        fixture.fields.childAlias.id,
        fixture.fields.childMode.id,
        fixture.fields.childItems.id,
      ].sort(),
    )
  })

  test("включает entanglement relations и state graph relations как канонические связи, а не runtime tables", () => {
    const fixture = createSharedDbFixture()
    const data = assembleSharedDbData(fixture.root)

    expect(data.entanglements).toHaveLength(3)
    expect(data.entanglementMembers).toHaveLength(6)
    expect(data.entanglementFields.map((field) => field.fieldName).sort()).toEqual(["items", "mode", "title"])
    expect(data.entanglementFieldMembers.map((member) => member.wimpFieldId).sort()).toEqual(
      [
        fixture.fields.rootTitle.id,
        fixture.fields.rootMode.id,
        fixture.fields.rootItems.id,
        fixture.fields.childAlias.id,
        fixture.fields.childMode.id,
        fixture.fields.childItems.id,
      ].sort(),
    )
    expect(data.metaStates.map((state) => state.stateName).sort()).toEqual(["idle", "idle", "ready", "ready"])
    expect(data.metaTransitionConditions.map((condition) => condition.metaFieldId).sort()).toEqual(
      [fixture.root.meta!.fields.mode.id, fixture.child.meta!.fields.mode.id].sort(),
    )
  })
})
