import { describe, expect, test } from "bun:test"
import { flattenEnergyData, FieldType } from "../gravity"
import { assembleStoredEnergyData } from "../strong"
import { weak$ } from "../weak"
import { energy$, gravity$, update, write } from "../energy"

describe("energy domain layers", () => {
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
})
