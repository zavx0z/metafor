import { describe, expect, test } from "bun:test"
import { flattenMatrixData, FieldType } from "../gravity"
import { assembleStoredMatrixData } from "../strong"
import { weak$ } from "../weak"
import { matrix$, gravity$, update, write } from "../matrix"

describe("matrix domain layers", () => {
  test("gravity и strong собирают канонический matrix-store", () => {
    const flattened = flattenMatrixData({
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

    const prepared = assembleStoredMatrixData(flattened)
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

    expect(matrix$.fields).toHaveLength(1)
    expect(weak$.initialized).toBe(true)
    expect(gravity$.activeAtomIds).toEqual([])
    expect(gravity$.structuralDirty).toBe(false)

    const changes = await update([[0, [[0, 20]]]])
    expect(changes).toEqual([[0, 1]])
    expect(matrix$.states).toEqual([1])
  })
})
