import { describe, expect, test } from "bun:test"
import { createSharedDbFixture } from "fixture/db.fixture.ts"
import { openSharedDbMaterializationWriter } from "../../shared/db/materialize.ts"
import { openSharedDbSqliteBackend } from "../../shared/db/sqlite.ts"
import { prepareRuntimeData, prepareRuntimeStore } from "../boundary.ts"
import { FieldType } from "../gravity"
import { OP } from "../weak"

const materializeFixture = async () => {
  const fixture = createSharedDbFixture()
  const backend = openSharedDbSqliteBackend()
  const writer = openSharedDbMaterializationWriter(backend)

  await fixture.root.save(writer)
  await fixture.child.save(writer)

  return { fixture, backend }
}

describe("boundary runtime projection from shared db data", () => {
  test("проецирует canonical shared/db data напрямую в boundary runtime input", async () => {
    const { fixture, backend } = await materializeFixture()

    try {
      const runtimeInput = prepareRuntimeData(backend.readData())

      expect(runtimeInput.fields).toEqual([
        { type: FieldType.STRING_PTR },
        { type: FieldType.U32, enum: ["idle", "ready"] },
        { type: FieldType.ARRAY_PTR, elementType: "string" },
      ])

      expect(runtimeInput.branes).toEqual([
        {
          values: [
            [0, "Root title"],
            [1, "idle"],
            [2, ["a", "b"]],
          ],
          state: 0,
          collapses: [[[1, { 1: "ready" }]], []],
        },
        {
          values: [
            [0, "Root title"],
            [1, "idle"],
            [2, ["a", "b"]],
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

  test("собирает prepared boundary store из canonical shared/db data", async () => {
    const { backend } = await materializeFixture()

    try {
      const prepared = prepareRuntimeStore(backend.readData())

      expect(prepared.fields).toEqual([
        { type: FieldType.STRING_PTR },
        { type: FieldType.U32, enum: ["idle", "ready"] },
        { type: FieldType.ARRAY_PTR, elementType: "string" },
      ])
      expect(prepared.branes).toHaveLength(2)
      expect(prepared.sharedBlocks).toEqual([{ valueOffset: 0, valueCount: 3 }])
      expect(prepared.sharedValues).toEqual([
        { fieldIndex: 0, value: 1 },
        { fieldIndex: 1, value: 0 },
        { fieldIndex: 2, value: [2, 3] },
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
      expect(prepared.stringTable).toEqual(["", "Root title", "a", "b"])
    } finally {
      backend.close()
    }
  })
})
