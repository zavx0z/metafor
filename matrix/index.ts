/**
 * matrix — функциональное API для GPU-эволюции суперпозиций.
 *
 * Архитектура:
 * - 2 функции: write(), update()
 * - step() вызывается автоматически внутри
 * - update() возвращает состояния [[braneIndex, state], ...]
 *
 * @example
 * ```ts
 * import { write, update } from "@metafor/matrix"
 *
 * await write({
 *   fields: [[0, { type: FieldType.F32 }]],
 *   branes: [{ params: [[0, 100]], state: 0, collapses: [[[1, { 0: { gt: 50 } }]], [null]] }]
 * })
 *
 * const states = await update(0, 0, 30)  // [[0, 0], [1, 1], ...]
 * ```
 */

import { GPUBackend } from "./gpu/Backend"
import { GPU } from "./gpu/device"
import { getStringAtlas, resetStringAtlas } from "./StringAtlas"
import type { Data, Brane } from "./index.t"

// ============================================================================
// ГЛОБАЛЬНОЕ СОСТОЯНИЕ МОДУЛЯ
// ============================================================================

let backend: GPUBackend | null = null
let heap: Uint32Array | null = null
let fields: Array<{ type: number; elementType?: string; enumValues?: any[] }> = []
let braneBlockPtrs: number[] = []
let bytecodeOffsets: number[] = []
let braneCount: number = 0

// ============================================================================
// ЭКСПОРТ: 2 ФУНКЦИИ
// ============================================================================

/**
 * Инициализирует матрицу (загружает данные на GPU).
 * @param data - Конфигурация полей и бран
 */
export async function write(data: Data): Promise<void> {
  // TODO: реализовать
  // 1. resetStringAtlas()
  // 2. Анализ entangled групп
  // 3. Компиляция superposition
  // 4. Построение heap
  // 5. backend.init()
  // 6. backend.run() — автоматический step
  
  braneCount = data.branes.length
  backend = new GPUBackend(GPU.device)
}

/**
 * Обновляет поле браны и возвращает новые состояния.
 * @param braneIndex - Индекс браны
 * @param fieldIndex - Индекс поля
 * @param value - Новое значение
 * @returns Массив состояний: [[braneIndex, state], ...]
 */
export async function update(
  braneIndex: number,
  fieldIndex: number,
  value: unknown
): Promise<[number, number][]> {
  // TODO: реализовать
  // 1. Найти смещение поля в heap
  // 2. Обновить значение
  // 3. backend.updateHeap()
  // 4. backend.run() — автоматический step
  // 5. backend.read() → вернуть [[braneIndex, state], ...]
  
  return []
}
