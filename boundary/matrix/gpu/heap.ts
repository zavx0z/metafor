export interface GpuHeapWordUpdate {
  offset: number
  value1: number
  value2?: number
}

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
