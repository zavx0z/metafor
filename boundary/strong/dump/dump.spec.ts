/**
 * Тесты для бинарной сериализации boundary-снимка.
 *
 * @packageDocumentation
 */

import { test, expect, describe } from "bun:test"
import { serializeBoundarySnapshot, deserializeBoundarySnapshot } from "./codec"
import { MAGIC_NUMBER, FORMAT_VERSION } from "./format.t"
import type { BoundarySnapshot } from "./format.t"

describe("serializeBoundarySnapshot / deserializeBoundarySnapshot", () => {
  test("должен сериализовать и десериализовать простое состояние", () => {
    const state: BoundarySnapshot = {
      heap: new Uint32Array([1, 2, 3, 4, 5]),
      bytecode: new Uint32Array([10, 20, 30]),
      bytecodeOffsets: new Uint32Array([0, 4, 8]),
      states: new Uint32Array([0, 1, 2]),
      stringRegistry: new Uint32Array([100, 200]),
      stringHeap: new Uint32Array([1, 2, 3, 4, 5, 6]),
      fields: [{ type: 0 as const }],
      metadata: {
        arrayReserveSize: 64,
        heapAllocOffset: 456,
        braneBlockPtrs: [0, 10, 20],
      },
    }

    // Сериализация
    const serialized = serializeBoundarySnapshot(state)

    // Проверка заголовка
    const view = new DataView(serialized.buffer, serialized.byteOffset, serialized.byteLength)
    expect(view.getUint32(0, true)).toBe(MAGIC_NUMBER)
    expect(view.getUint32(4, true)).toBe(FORMAT_VERSION)
    expect(view.getUint32(8, true)).toBe(8) // 8 секций

    // Десериализация
    const deserialized = deserializeBoundarySnapshot(serialized)

    // Проверка данных
    expect(deserialized.heap).toEqual(state.heap)
    expect(deserialized.bytecode).toEqual(state.bytecode)
    expect(deserialized.bytecodeOffsets).toEqual(state.bytecodeOffsets)
    expect(deserialized.states).toEqual(state.states)
    expect(deserialized.stringRegistry).toEqual(state.stringRegistry)
    expect(deserialized.stringHeap).toEqual(state.stringHeap)
    expect(deserialized.fields).toEqual(state.fields)
    expect(deserialized.metadata).toEqual(state.metadata)
  })

  test("должен бросить ошибку при невалидном magic number", () => {
    const buffer = new Uint8Array(12)
    new DataView(buffer.buffer).setUint32(0, 0x00000000, true)

    expect(() => deserializeBoundarySnapshot(buffer)).toThrow("Invalid magic number")
  })

  test("должен бросить ошибку при несовместимой версии", () => {
    const buffer = new Uint8Array(12)
    new DataView(buffer.buffer).setUint32(0, MAGIC_NUMBER, true)
    new DataView(buffer.buffer).setUint32(4, 999, true) // Невалидная версия

    expect(() => deserializeBoundarySnapshot(buffer)).toThrow("Unsupported version")
  })

  test("должен сериализовать пустое состояние", () => {
    const state: BoundarySnapshot = {
      heap: new Uint32Array([]),
      bytecode: new Uint32Array([]),
      bytecodeOffsets: new Uint32Array([]),
      states: new Uint32Array([]),
      stringRegistry: new Uint32Array([]),
      stringHeap: new Uint32Array([]),
      fields: [],
      metadata: {
        arrayReserveSize: 0,
        heapAllocOffset: 0,
        braneBlockPtrs: [],
      },
    }

    const serialized = serializeBoundarySnapshot(state)
    const deserialized = deserializeBoundarySnapshot(serialized)

    expect(deserialized.heap).toEqual(state.heap)
    expect(deserialized.metadata).toEqual(state.metadata)
  })

  test("должен сериализовать состояние с большими данными", () => {
    const state: BoundarySnapshot = {
      heap: new Uint32Array(1000).map((_, i) => i),
      bytecode: new Uint32Array(500).map((_, i) => i * 2),
      bytecodeOffsets: new Uint32Array(10).map((_, i) => i * 50),
      states: new Uint32Array(100).map((_, i) => i % 10),
      stringRegistry: new Uint32Array(200),
      stringHeap: new Uint32Array(1000),
      fields: Array(10).fill({ type: 0 as const }),
      metadata: {
        arrayReserveSize: 128,
        heapAllocOffset: 872,
        braneBlockPtrs: Array(10).fill(0).map((_, i) => i * 100),
      },
    }

    const serialized = serializeBoundarySnapshot(state)
    const deserialized = deserializeBoundarySnapshot(serialized)

    expect(deserialized.heap).toEqual(state.heap)
    expect(deserialized.bytecode).toEqual(state.bytecode)
    expect(deserialized.metadata.braneBlockPtrs).toEqual(state.metadata.braneBlockPtrs)
  })

  test("должен сохранять lock флаги при сериализации", () => {
    // heap с 2 бранами: брана 0 заблокирована (lock=1), брана 1 разблокирована (lock=0)
    const state: BoundarySnapshot = {
      heap: new Uint32Array([
        // Brane 0: local=1, entangled=0, lock=1
        1, 0, 1, 0, 0x00010004, 100,
        // Brane 1: local=1, entangled=0, lock=0
        1, 0, 0, 0, 0x00010004, 200,
      ]),
      bytecode: new Uint32Array([1, 2, 3]),
      bytecodeOffsets: new Uint32Array([0]),
      states: new Uint32Array([0, 1]),
      stringRegistry: new Uint32Array([]),
      stringHeap: new Uint32Array([]),
      fields: [{ type: 0 as const }],
      metadata: {
        arrayReserveSize: 0,
        heapAllocOffset: 0,
        braneBlockPtrs: [0, 6],
      },
    }

    // Сериализовать
    const serialized = serializeBoundarySnapshot(state)

    // Десериализовать
    const deserialized = deserializeBoundarySnapshot(serialized)

    // Проверить lock флаги
    expect(deserialized.heap[2]).toBe(1)   // Brane 0: lock=1
    expect(deserialized.heap[8]).toBe(0)   // Brane 1: lock=0
  })
})
