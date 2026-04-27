import { describe, expect, test } from "bun:test"
import { createDbFixture } from "fixture/db.fixture.ts"
import { readDbSqliteData } from "store/db/fixture"
import { openDbMaterializationWriter } from "store/materialize"
import { openDbSqliteBackend } from "store/db/sqlite"
import { prepareRuntimeData, prepareRuntimeStore } from "../boundary.ts"
import { FieldType } from "../gravity"
import { OP } from "../weak"

const materializeFixture = async () => {
  const fixture = createDbFixture()
  const backend = openDbSqliteBackend()
  const writer = openDbMaterializationWriter(backend)

  await fixture.root.save(writer)
  await fixture.child.save(writer)

  return { fixture, backend }
}

describe("boundary runtime projection from db data", () => {
  test("проецирует canonical db data напрямую в boundary runtime input", async () => {
    const { fixture, backend } = await materializeFixture()

    try {
      const runtimeInput = prepareRuntimeData(readDbSqliteData(backend.database))

      expect(runtimeInput.fields).toEqual([
        { type: FieldType.STRING_PTR },
        { type: FieldType.U32, enum: ["idle", "ready"] },
        { type: FieldType.ARRAY_PTR, elementType: "number" },
      ])

      expect(runtimeInput.branes).toEqual([
        {
          values: [
            [0, "Root title"],
            [1, "idle"],
            [2, [1, 2]],
          ],
          state: 0,
          collapses: [[[1, { 1: "ready" }]], []],
        },
        {
          values: [
            [0, "Root title"],
            [1, "idle"],
            [2, [1, 2]],
          ],
          state: 0,
          collapses: [[[1, { 1: "ready" }]], []],
        },
      ])

      expect(runtimeInput.entanglement?.blocks).toEqual([
        {
          key: `${fixture.root.id},${fixture.child.id}`,
          braneIndices: [0, 1],
          fields: [
            {
              fieldIndex: 0,
              fieldName: "title",
              payloadIds: expect.any(Array),
              semanticKeys: expect.any(Array),
              representativeBraneIndex: 0,
            },
            {
              fieldIndex: 1,
              fieldName: "mode",
              payloadIds: expect.any(Array),
              semanticKeys: expect.any(Array),
              representativeBraneIndex: 0,
            },
            {
              fieldIndex: 2,
              fieldName: "items",
              payloadIds: expect.any(Array),
              semanticKeys: expect.any(Array),
              representativeBraneIndex: 0,
            },
          ],
        },
      ])
    } finally {
      backend.close()
    }
  })

  test("собирает prepared boundary store из canonical db data", async () => {
    const { backend } = await materializeFixture()

    try {
      const prepared = prepareRuntimeStore(readDbSqliteData(backend.database))

      expect(prepared.fields).toEqual([
        { type: FieldType.STRING_PTR },
        { type: FieldType.U32, enum: ["idle", "ready"] },
        { type: FieldType.ARRAY_PTR, elementType: "number" },
      ])
      expect(prepared.branes).toHaveLength(2)
      expect(prepared.sharedBlocks).toEqual([{ valueOffset: 0, valueCount: 3 }])
      expect(prepared.sharedValues).toEqual([
        { fieldIndex: 0, value: 1 },
        { fieldIndex: 1, value: 0 },
        { fieldIndex: 2, value: [1, 2] },
      ])
      expect(prepared.braneValues).toEqual([])
      expect(prepared.braneSharedBlockRefs).toEqual([0, 0])
      expect(prepared.transitions).toEqual([{ targetState: 1, conditionOffset: 0, conditionCount: 1 }])
      expect(prepared.conditions).toEqual([{ fieldIndex: 1, op: OP.EQ, value: 1 }])
      expect(prepared.stateTable).toEqual([
        { transitionOffset: 0, transitionCount: 1 },
        { transitionOffset: 1, transitionCount: 0 },
      ])
      expect(prepared.states).toEqual([0, 0])
      expect(prepared.stringTable).toEqual(["", "Root title"])
    } finally {
      backend.close()
    }
  })

  test("array runtime schema не выводится обратно из текущего sample value", async () => {
    const { backend } = await materializeFixture()

    try {
      const mutated = structuredClone(readDbSqliteData(backend.database))
      const arrayMetaFieldIds = new Set(
        mutated.metaFields.filter((row) => row.schema.type === "array").map((row) => row.id),
      )
      const arrayWimpFieldIds = new Set(
        mutated.wimpFields.filter((row) => arrayMetaFieldIds.has(row.metaFieldId)).map((row) => row.id),
      )

      mutated.fieldValues = mutated.fieldValues.map((row) =>
        arrayWimpFieldIds.has(row.ownerWimpFieldId) ? { ...row, value: ["alpha", "beta"] } : row,
      )

      const runtimeInput = prepareRuntimeData(mutated)

      expect(runtimeInput.fields).toEqual([
        { type: FieldType.STRING_PTR },
        { type: FieldType.U32, enum: ["idle", "ready"] },
        { type: FieldType.ARRAY_PTR, elementType: "number" },
      ])
      expect(runtimeInput.branes?.[0]?.values[2]).toEqual([2, ["alpha", "beta"]])
      expect(runtimeInput.branes?.[1]?.values[2]).toEqual([2, ["alpha", "beta"]])
    } finally {
      backend.close()
    }
  })
})
