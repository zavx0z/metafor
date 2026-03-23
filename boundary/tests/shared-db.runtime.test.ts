import { afterEach, describe, expect, test } from "bun:test"
import { openSharedDbSqliteBackend } from "@shared/db"
import { assembleSharedDbProjection } from "../../dark/db.ts"
import { createSharedDbFixture } from "../../dark/db.fixture.ts"
import { boundary$, prepareSharedDbData, reset, writeSharedDb } from "../boundary.ts"
import {
  buildBoundaryDatabaseFromSharedDb,
  prepareBoundaryStoreFromSharedDb,
  prepareBoundaryWriteData,
  prepareBoundaryWriteDataFromSharedDb,
} from "../database.ts"
import { FieldType } from "../gravity"
import { OP, weak$ } from "../weak"

describe("boundary runtime from shared/db backend", () => {
  afterEach(() => {
    reset()
  })

  test("адаптирует DB-shaped данные в boundary runtime input через explicit DB-fed seeds без переноса runtime-semantics в shared/db", () => {
    const fixture = createSharedDbFixture()
    const projection = assembleSharedDbProjection(fixture.root)
    const backend = openSharedDbSqliteBackend()

    try {
      backend.writeProjection(projection)
      const database = buildBoundaryDatabaseFromSharedDb(backend)
      const runtimeInput = prepareBoundaryWriteData(database)

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
          collapses: [[[1, { 1: "ready" }]], [null]],
        },
        {
          values: [
            [0, "Root title"],
            [1, "idle"],
            [2, ["a", "b"]],
          ],
          state: 0,
          collapses: [[[1, { 1: "ready" }]], [null]],
        },
      ])
      expect(runtimeInput.entanglement?.blocks).toHaveLength(1)
      expect(runtimeInput.entanglement?.blocks[0]?.braneIndices).toEqual([0, 1])
      expect(runtimeInput.entanglement?.blocks[0]?.fields.map((field) => ({
        fieldIndex: field.fieldIndex,
        fieldName: field.fieldName,
        representativeBraneIndex: field.representativeBraneIndex,
      }))).toEqual([
        { fieldIndex: 0, fieldName: "title", representativeBraneIndex: 0 },
        { fieldIndex: 1, fieldName: "mode", representativeBraneIndex: 0 },
        { fieldIndex: 2, fieldName: "items", representativeBraneIndex: 0 },
      ])

      expect(prepareBoundaryWriteDataFromSharedDb(backend)).toEqual(runtimeInput)
    } finally {
      backend.close()
    }
  })

  test("материализует канонический boundary store из sqlite-backed shared/db данных", () => {
    const fixture = createSharedDbFixture()
    const projection = assembleSharedDbProjection(fixture.root)
    const backend = openSharedDbSqliteBackend()

    try {
      backend.writeProjection(projection)
      const prepared = prepareBoundaryStoreFromSharedDb(backend)

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

  test("проходит путь Dark -> SharedDbProjection -> shared/db backend -> Boundary runtime store -> weak", async () => {
    const fixture = createSharedDbFixture()
    const projection = assembleSharedDbProjection(fixture.root)
    const backend = openSharedDbSqliteBackend()

    try {
      backend.writeProjection(projection)

      expect(prepareSharedDbData(backend).fields).toHaveLength(3)

      const changes = await writeSharedDb(backend)
      expect(changes).toEqual([])
      expect(weak$.initialized).toBe(true)
      expect(boundary$.fields).toEqual([
        { type: FieldType.STRING_PTR },
        { type: FieldType.U32, enum: ["idle", "ready"] },
        { type: FieldType.ARRAY_PTR, elementType: "string" },
      ])
      expect(boundary$.branes).toHaveLength(2)
      expect(boundary$.sharedBlocks).toEqual([{ valueOffset: 0, valueCount: 3 }])
      expect(boundary$.sharedValues).toEqual([
        { fieldIndex: 0, value: 1 },
        { fieldIndex: 1, value: 0 },
        { fieldIndex: 2, value: [2, 3] },
      ])
      expect(boundary$.stateTable).toEqual([
        { transitionOffset: 0, transitionCount: 1 },
        { transitionOffset: 1, transitionCount: 0 },
      ])
      expect(boundary$.transitions).toEqual([{ targetState: 1, conditionOffset: 0, conditionCount: 1 }])
      expect(boundary$.conditions).toEqual([{ fieldIndex: 1, op: OP.EQ, value: 1 }])
      expect(boundary$.states).toEqual([0, 0])
      expect(boundary$.stringTable).toEqual(["", "Root title", "a", "b"])
      expect(boundary$.getFieldValue(0, 0)).toBe(1)
      expect(boundary$.getFieldValue(1, 0)).toBe(1)
      expect(boundary$.getFieldValue(1, 1)).toBe(0)
      expect(boundary$.getFieldValue(1, 2)).toEqual([2, 3])
    } finally {
      backend.close()
    }
  })
})
