import { afterEach, describe, expect, test } from "bun:test"
import { flattenBoundaryData } from "../gravity"
import { assembleStoredBoundaryData } from "../strong"
import { serializeBoundaryState, deserializeBoundaryState } from "../em"
import { weak$ } from "../weak"
import { boundary$, reset, update, write } from "../boundary"
import { FieldType } from "../gravity"

describe("boundary domain layers", () => {
  afterEach(() => {
    reset()
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

  test("em сериализует и восстанавливает boundary-снимок", () => {
    const snapshot = {
      heap: new Uint32Array([1, 2, 3]),
      bytecode: new Uint32Array([4, 5]),
      bytecodeOffsets: new Uint32Array([0]),
      states: new Uint32Array([1]),
      stringRegistry: new Uint32Array([0]),
      stringHeap: new Uint32Array([0]),
      fields: [{ type: FieldType.F32 }],
      metadata: {
        arrayReserveSize: 0,
        heapAllocOffset: 0,
        braneBlockPtrs: [0],
      },
    }

    const encoded = serializeBoundaryState(snapshot)
    const restored = deserializeBoundaryState(encoded)

    expect(Array.from(restored.heap)).toEqual([1, 2, 3])
    expect(Array.from(restored.bytecode)).toEqual([4, 5])
    expect(restored.fields).toEqual([{ type: FieldType.F32 }])
    expect(restored.metadata.braneBlockPtrs).toEqual([0])
  })
})
