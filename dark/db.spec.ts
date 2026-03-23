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

  test("добавляет explicit runtime seeds для entanglement и state graph поверх плоских фактов", () => {
    const fixture = createSharedDbFixture()
    const projection = assembleSharedDbProjection(fixture.root)

    expect(projection.entanglementBlocks).toEqual([{ index: 0, key: "source-family:0,1" }])
    expect(projection.entanglementBlockMembers).toEqual([
      { index: 0, blockIndex: 0, memberIndex: 0, braneIndex: 0 },
      { index: 1, blockIndex: 0, memberIndex: 1, braneIndex: 1 },
    ])
    expect(projection.entanglementFields.map((field) => ({
      fieldName: field.fieldName,
      semanticKey: field.semanticKey,
      representativeDarkFieldId: field.representativeDarkFieldId,
    }))).toEqual([
      {
        fieldName: "title",
        semanticKey: fixture.fields.rootTitle.id,
        representativeDarkFieldId: fixture.fields.rootTitle.id,
      },
      {
        fieldName: "mode",
        semanticKey: fixture.fields.rootMode.id,
        representativeDarkFieldId: fixture.fields.rootMode.id,
      },
      {
        fieldName: "items",
        semanticKey: fixture.fields.rootItems.id,
        representativeDarkFieldId: fixture.fields.rootItems.id,
      },
    ])
    expect(projection.entanglementFieldMembers.map((member) => member.darkFieldId)).toEqual([
      fixture.fields.rootTitle.id,
      fixture.fields.childAlias.id,
      fixture.fields.rootMode.id,
      fixture.fields.childMode.id,
      fixture.fields.rootItems.id,
      fixture.fields.childItems.id,
    ])

    expect(projection.stateSeedStates.map((state) => [state.ownerBraneIndex, state.stateIndex, state.name, state.initial])).toEqual([
      [0, 0, "idle", true],
      [0, 1, "ready", false],
      [1, 0, "idle", true],
      [1, 1, "ready", false],
    ])
    expect(projection.stateSeedTransitions.map((transition) => ({
      ownerBraneIndex: transition.ownerBraneIndex,
      fromStateIndex: transition.fromStateIndex,
      targetStateIndex: transition.targetStateIndex,
    }))).toEqual([
      { ownerBraneIndex: 0, fromStateIndex: 0, targetStateIndex: 1 },
      { ownerBraneIndex: 0, fromStateIndex: 1, targetStateIndex: null },
      { ownerBraneIndex: 1, fromStateIndex: 0, targetStateIndex: 1 },
      { ownerBraneIndex: 1, fromStateIndex: 1, targetStateIndex: null },
    ])
    expect(projection.stateSeedConditions).toEqual([
      {
        index: 0,
        transitionSeedIndex: 0,
        conditionIndex: 0,
        darkFieldId: fixture.fields.rootMode.id,
        condition: "ready",
      },
      {
        index: 1,
        transitionSeedIndex: 2,
        conditionIndex: 0,
        darkFieldId: fixture.fields.childMode.id,
        condition: "ready",
      },
    ])
  })
})
