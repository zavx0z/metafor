import type { MatrixFieldRecord } from "../../store.t"
import type { GpuHeapWordUpdate, ArrayHeapSlot } from "./heap.t"
import { FIELD_TYPE } from "../constants"
import { unpackMeta } from "./layout-heap"

export type { GpuHeapWordUpdate, ArrayHeapSlot } from "./heap.t"

/**
 * Обновляет поля в GPU heap buffer (оркестрация).
 *
 * Мутабельный буфер: heapBuffer (запись данных)
 */
export function updateGpuHeapFields(device: GPUDevice, heapBuffer: GPUBuffer, updates: GpuHeapWordUpdate[]): void {
  for (const { offset, value1, value2 } of updates) {
    const byteOffset = offset * 4
    if (value2 !== undefined) {
      device.queue.writeBuffer(heapBuffer, byteOffset, new Uint32Array([value1, value2]))
    } else {
      device.queue.writeBuffer(heapBuffer, byteOffset, new Uint32Array([value1]))
    }
  }
}

export function createInitialArrayHeapIndex(
  heap: Uint32Array,
  blockPtrs: number[],
  sharedBlockPtrs: number[],
  fields: MatrixFieldRecord[],
): Map<number, ArrayHeapSlot> {
  const slots = new Map<number, ArrayHeapSlot>()
  const visited = new Set<number>()

  for (const blockPtr of [...sharedBlockPtrs, ...blockPtrs]) {
    if (!blockPtr || visited.has(blockPtr)) {
      continue
    }
    visited.add(blockPtr)

    const localCount = heap[blockPtr] ?? 0
    let descriptorOffset = blockPtr + 3
    for (let descriptorIndex = 0; descriptorIndex < localCount; descriptorIndex++) {
      const fieldIndex = heap[descriptorOffset] ?? -1
      const packedMeta = heap[descriptorOffset + 1] ?? 0
      descriptorOffset += 2

      const field = fields[fieldIndex]
      if (!field || field.type !== FIELD_TYPE.ARRAY_PTR) {
        continue
      }

      const valueOffset = blockPtr + unpackMeta(packedMeta).offset
      const ptr = heap[valueOffset] ?? 0
      if (ptr === 0) {
        continue
      }

      const length = heap[ptr] ?? 0
      slots.set(valueOffset, { ptr, size: 1 + length })
    }
  }

  return slots
}
