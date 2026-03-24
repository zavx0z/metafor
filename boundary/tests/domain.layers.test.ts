import { afterEach, describe, expect, test } from "bun:test"
import { openSharedDbMaterializationWriter, openSharedDbMemoryBackend } from "@shared/db"
import { flattenBoundaryData, FieldType } from "../gravity"
import { assembleStoredBoundaryData } from "../strong"
import { weak$ } from "../weak"
import { boundary$, addRuntimeWimpFromSharedDb, rebuildRuntime, removeRuntimeWimp, update, write } from "../boundary"
import { createSharedDbFixture } from "../../dark/db.fixture.ts"
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

    const changes = await update([[0, [[0, 20]]]])
    expect(changes).toEqual([[0, 1]])
    expect(boundary$.states).toEqual([1])
  })

  test("shared/db путь живёт через loaded fragment и transactional rebuild, без dump/restore", async () => {
    const fixture = createSharedDbFixture()
    const backend = openSharedDbMemoryBackend()
    const writer = openSharedDbMaterializationWriter(backend)

    try {
      fixture.root.save(writer)
      fixture.child.save(writer)

      await addRuntimeWimpFromSharedDb(backend, fixture.root.id)
      expect(boundary$.branes).toEqual([])

      await addRuntimeWimpFromSharedDb(backend, fixture.child.id)
      expect(boundary$.branes).toEqual([])

      await rebuildRuntime()
      expect(boundary$.branes).toHaveLength(2)
      expect(boundary$.sharedBlocks).toHaveLength(1)

      removeRuntimeWimp(fixture.child.id)
      await rebuildRuntime()

      expect(boundary$.branes).toHaveLength(1)
      expect(boundary$.sharedBlocks).toEqual([])
    } finally {
      backend.close()
    }
  })
})
