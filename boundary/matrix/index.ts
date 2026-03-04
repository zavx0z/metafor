/**
 * @boundary/matrix — GPU runtime для эволюции суперпозиций.
 *
 * @packageDocumentation
 *
 * ## Ответственность
 *
 * Низкоуровневый GPU-драйвер:
 * - `GPUBackend` — класс для управления GPU-ресурсами
 * - `GPU` — глобальное GPU-устройство
 * - `_initMatrix()` — инициализация GPU
 * - `_stepMatrix()` — выполнение шага
 * - `_readMatrixChanges()` — чтение изменений
 * - `_updateMatrixHeap()` — обновление heap на GPU
 *
 * ## Состояние
 *
 * Хранит только необходимое для координации с GPU:
 * - `backend` — GPU-ресурсы
 * - `heap` — для поиска смещений полей
 * - `braneBlockPtrs` — для update()
 * - `heapAllocOffset`, `arrayReserveSize`, `arrayDataInvalidated` — tracking ARRAY
 *
 * ## Чего НЕ делает
 *
 * - НЕ содержит `write()`/`update()` — это оркестрация в `@boundary/fields`
 * - НЕ зависит от `@boundary/fields`
 * - НЕ содержит бизнес-логику
 *
 * @example
 * ```typescript
 * import { GPUBackend, GPU, _initMatrix, _stepMatrix } from "@boundary/matrix"
 *
 * // Инициализация GPU
 * await _initMatrix({ ... }, atlasExport, blockPtrs, reserveSize)
 *
 * // Выполнение шага
 * _stepMatrix()
 * const changes = await _readMatrixChanges()
 * ```
 */

import { GPUBackend } from "./backend"
import { GPU } from "./device"

// ============================================================================
// ГЛОБАЛЬНОЕ СОСТОЯНИЕ (fp.md п.5)
// ============================================================================

/**
 * GPU бэкенд.
 */
let backend: GPUBackend | null = null

/**
 * Heap данные — только для поиска смещений полей и сериализации.
 */
let heap: Uint32Array | null = null

/**
 * Смещения блоков бран в heap — для update().
 */
let braneBlockPtrs: number[] = []

/**
 * Смещение для динамических аллокаций ARRAY в heap.
 */
let heapAllocOffset: number = 0

/**
 * Размер резервированной зоны для ARRAY в heap.
 */
let arrayReserveSize: number = 0

/**
 * Флаг: данные ARRAY невалидны после update().
 */
let arrayDataInvalidated = false

/**
 * Mutex для предотвращения конкурентных вызовов.
 */
let operationMutex: Promise<void> | null = null

/**
 * Сбрасывает состояние модуля (для тестов).
 * @internal
 */
export function resetMatrix(): void {
  if (backend) {
    backend.clear()
    backend = null
  }
  heap = null
  braneBlockPtrs = []
  heapAllocOffset = 0
  arrayReserveSize = 0
  arrayDataInvalidated = false
  operationMutex = null
}

/**
 * Состояние Matrix для сериализации.
 */
export interface MatrixStateExport {
  heap: Uint32Array
  braneBlockPtrs: number[]
  heapAllocOffset: number
  arrayReserveSize: number
  arrayDataInvalidated: boolean
}

/**
 * Получает текущее состояние модуля для сериализации.
 *
 * @returns Текущее состояние matrix
 */
export function getMatrixState(): MatrixStateExport {
  return {
    heap: heap!,
    braneBlockPtrs,
    heapAllocOffset,
    arrayReserveSize,
    arrayDataInvalidated,
  }
}

/**
 * Восстанавливает состояние модуля из сериализованных данных.
 *
 * @param state - Состояние для восстановления
 * @internal
 */
export function _restoreFromState(state: MatrixStateExport): void {
  heap = state.heap
  braneBlockPtrs = state.braneBlockPtrs
  heapAllocOffset = state.heapAllocOffset
  arrayReserveSize = state.arrayReserveSize
  arrayDataInvalidated = state.arrayDataInvalidated
}

/**
 * Инициализирует GPU backend с данными.
 *
 * @param params - Параметры инициализации
 * @param atlasExport - Экспорт StringAtlas
 * @param blockPtrs - Смещения блоков бран в heap
 * @param reserveSize - Размер резервированной зоны для ARRAY
 * @internal
 */
export async function _initMatrix(
  params: {
    bytecode: Uint32Array
    bytecodeOffsets: Uint32Array
    states: Uint32Array
    braneDescriptors: Uint32Array
    heap: Uint32Array
  },
  atlasExport: { registry: Uint32Array; heap: Uint32Array; count: number },
  blockPtrs: number[],
  reserveSize: number,
): Promise<void> {
  if (operationMutex) {
    await operationMutex
  }

  let resolveMutex: (() => void) | undefined
  operationMutex = new Promise<void>((resolve) => {
    resolveMutex = resolve
  })

  try {
    resetMatrix()

    backend = new GPUBackend(GPU.device)
    await backend.init(
      {
        braneCount: params.states.length,
        ...params,
      },
      atlasExport,
      false,
    )

    heap = params.heap
    braneBlockPtrs = blockPtrs
    arrayReserveSize = reserveSize
    heapAllocOffset = heap.length - reserveSize
    arrayDataInvalidated = false
  } finally {
    resolveMutex?.()
  }
}

/**
 * Выполняет шаг эволюции GPU.
 *
 * @internal
 */
export function _stepMatrix(): void {
  if (!backend) {
    throw new Error("Matrix not initialized")
  }
  backend.run()
}

/**
 * Читает изменённые состояния из GPU.
 *
 * @internal
 */
export async function _readMatrixChanges(): Promise<[number, number][]> {
  if (!backend) {
    throw new Error("Matrix not initialized")
  }
  return await backend.readChanges()
}

/**
 * Обновляет поля в heap на GPU.
 *
 * @param updates - Массив обновлений
 * @internal
 */
export function _updateMatrixHeap(
  updates: Array<{ offset: number; value1: number; value2?: number }>,
): void {
  if (!backend) {
    throw new Error("Matrix not initialized")
  }
  backend.updateHeapFields(updates)
}

/**
 * Получает GPU backend для прямого доступа.
 *
 * @internal
 */
export function _getBackend(): GPUBackend | null {
  return backend
}

// Ре-экспорт типов и GPU
export { GPUBackend } from "./backend"
export { GPU } from "./device"
export type { BackendInitParams } from "./backend.t"

// Ре-экспорт типов данных
export {
  FieldType,
  type FieldTypeValue,
  type BraneValue,
  type Field,
  type Collapse,
  type Brane,
  type Data,
} from "./types"
