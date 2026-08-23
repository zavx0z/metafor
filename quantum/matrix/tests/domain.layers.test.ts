import { describe, expect, test } from "bun:test"
import { flattenMatrixData, FieldType } from "../gravity"
import { assembleStoredMatrixData } from "../strong"

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
})
