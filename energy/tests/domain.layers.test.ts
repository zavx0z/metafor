import { afterEach, describe, expect, test } from "bun:test"
import { openDbMaterializationWriter, openDbSqliteBackend } from "store/db"
import { flattenEnergyData, FieldType } from "../gravity"
import { assembleStoredEnergyData } from "../strong"
import { weak$ } from "../weak"
import { energy$, addRuntimeWimp, gravity$, rebuildRuntime, removeRuntimeWimp, update, write } from "../energy"
import { createDbFixture } from "fixture/db.fixture.ts"
import { resetEnergyForTest } from "./test.helper"

describe("energy domain layers", () => {
  afterEach(async () => {
    await resetEnergyForTest()
  })

  test("gravity и strong собирают канонический energy-store", () => {
    const flattened = flattenEnergyData({
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

    const prepared = assembleStoredEnergyData(flattened)
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

    expect(energy$.fields).toHaveLength(1)
    expect(weak$.initialized).toBe(true)
    expect(gravity$.activeWimpIds).toEqual([])
    expect(gravity$.structuralDirty).toBe(false)

    const changes = await update([[0, [[0, 20]]]])
    expect(changes).toEqual([[0, 1]])
    expect(energy$.states).toEqual([1])
  })

  test("db путь живёт через gravity composition и transactional rebuild, без dump/restore", async () => {
    const fixture = createDbFixture()
    const backend = openDbSqliteBackend()
    const writer = openDbMaterializationWriter(backend)

    try {
      await fixture.root.save(writer)
      await fixture.child.save(writer)

      addRuntimeWimp(fixture.root.id)
      expect(energy$.branes).toEqual([])
      expect(gravity$.structuralDirty).toBe(true)

      addRuntimeWimp(fixture.child.id)
      expect(energy$.branes).toEqual([])

      await rebuildRuntime(backend)
      expect(energy$.branes).toHaveLength(2)
      expect(energy$.sharedBlocks).toHaveLength(1)

      removeRuntimeWimp(fixture.child.id)
      await rebuildRuntime(backend)

      expect(energy$.branes).toHaveLength(1)
      expect(energy$.sharedBlocks).toEqual([])
    } finally {
      backend.close()
    }
  })
})
