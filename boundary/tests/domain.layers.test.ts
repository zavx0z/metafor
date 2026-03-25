import { afterEach, describe, expect, test } from "bun:test"
import { openSharedDbMaterializationWriter, openSharedDbSqliteBackend } from "@shared/db"
import { flattenBoundaryData, FieldType } from "../gravity"
import { assembleStoredBoundaryData } from "../strong"
import { weak$ } from "../weak"
import { boundary$, addRuntimeWimp, gravity$, rebuildRuntime, removeRuntimeWimp, update, write } from "../boundary"
import { createSharedDbFixture } from "fixture/db.fixture.ts"
import { resetBoundaryForTest } from "./test.helper"

describe("boundary domain layers", () => {
  afterEach(async () => {
    await resetBoundaryForTest()
  })

  test("gravity и strong собирают канонический boundary-store", () => {
    const flattened = flattenBoundaryData({
      fields: [{ type: FieldType.F32 }],
      branes: [
        {
          values: [[0, 5]],
          state: 0,
          collapses: [
            [[1, { 0: { gt: 10 } }]],
            [null],
          ],
        },
      ],
    })

    expect(flattened.branes).toHaveLength(1)
    expect(flattened.branes[0]?.transitions[0]?.[0]?.conditions[0]?.fieldIndex).toBe(0)

    const prepared = assembleStoredBoundaryData(flattened)
    expect(prepared.fields).toHaveLength(1)
    expect(prepared.branes).toHaveLength(1)
    expect(prepared.stateTable).toHaveLength(2)
    expect(prepared.transitions).toHaveLength(1)
    expect(prepared.conditions).toHaveLength(1)
  })

  test("доменный путь write -> weak -> update остаётся согласованным", async () => {
    await write({
      fields: [{ type: FieldType.F32 }],
      branes: [
        {
          values: [[0, 0]],
          state: 0,
          collapses: [
            [[1, { 0: { gt: 10 } }]],
            [null],
          ],
        },
      ],
    })

    expect(boundary$.fields).toHaveLength(1)
    expect(weak$.initialized).toBe(true)
    expect(gravity$.activeWimpIds).toEqual([])
    expect(gravity$.structuralDirty).toBe(false)

    const changes = await update([[0, [[0, 20]]]])
    expect(changes).toEqual([[0, 1]])
    expect(boundary$.states).toEqual([1])
  })

  test("shared/db путь живёт через gravity composition и transactional rebuild, без dump/restore", async () => {
    const fixture = createSharedDbFixture()
    const backend = openSharedDbSqliteBackend()
    const writer = openSharedDbMaterializationWriter(backend)

    try {
      await fixture.root.save(writer)
      await fixture.child.save(writer)

      addRuntimeWimp(fixture.root.id)
      expect(boundary$.branes).toEqual([])
      expect(gravity$.structuralDirty).toBe(true)

      addRuntimeWimp(fixture.child.id)
      expect(boundary$.branes).toEqual([])

      await rebuildRuntime(backend)
      expect(boundary$.branes).toHaveLength(2)
      expect(boundary$.sharedBlocks).toHaveLength(1)

      removeRuntimeWimp(fixture.child.id)
      await rebuildRuntime(backend)

      expect(boundary$.branes).toHaveLength(1)
      expect(boundary$.sharedBlocks).toEqual([])
    } finally {
      backend.close()
    }
  })
})
