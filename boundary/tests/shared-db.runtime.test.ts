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
import { weak$ } from "../weak"

describe("boundary runtime from shared/db backend", () => {
  afterEach(() => {
    reset()
  })

  test("адаптирует DB-shaped данные в boundary runtime input без переноса runtime-semantics в shared/db", () => {
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
        { type: FieldType.STRING_PTR },
      ])

      expect(runtimeInput.branes).toEqual([
        {
          values: [
            [0, "Root title"],
            [1, "idle"],
            [2, ["a", "b"]],
          ],
          state: 0,
          collapses: [[null]],
        },
        {
          values: [
            [3, "Root title"],
            [1, "idle"],
            [2, ["a", "b"]],
          ],
          state: 0,
          collapses: [[null]],
        },
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
        { type: FieldType.STRING_PTR },
      ])
      expect(prepared.branes).toHaveLength(2)
      expect(prepared.sharedBlocks).toEqual([])
      expect(prepared.sharedValues).toEqual([])
      expect(prepared.transitions).toEqual([])
      expect(prepared.conditions).toEqual([])
      expect(prepared.stateTable).toHaveLength(1)
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

      expect(prepareSharedDbData(backend).fields).toHaveLength(4)

      const changes = await writeSharedDb(backend)
      expect(changes).toEqual([])
      expect(weak$.initialized).toBe(true)
      expect(boundary$.fields).toEqual([
        { type: FieldType.STRING_PTR },
        { type: FieldType.U32, enum: ["idle", "ready"] },
        { type: FieldType.ARRAY_PTR, elementType: "string" },
        { type: FieldType.STRING_PTR },
      ])
      expect(boundary$.branes).toHaveLength(2)
      expect(boundary$.sharedBlocks).toEqual([])
      expect(boundary$.stateTable).toHaveLength(1)
      expect(boundary$.states).toEqual([0, 0])
      expect(boundary$.stringTable).toEqual(["", "Root title", "a", "b"])
      expect(boundary$.getFieldValue(0, 0)).toBe(1)
      expect(boundary$.getFieldValue(1, 3)).toBe(1)
      expect(boundary$.getFieldValue(1, 1)).toBe(0)
      expect(boundary$.getFieldValue(1, 2)).toEqual([2, 3])
    } finally {
      backend.close()
    }
  })
})
