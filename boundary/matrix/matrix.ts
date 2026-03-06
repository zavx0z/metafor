import { GPUBackend } from "./backend"
import { GPU } from "./device"
import type { MatrixStateExport, MatrixInitParams } from "./matrix.t"
import type { StringAtlasExport } from "@boundary/atlas"

// ============================================================================
// ГЛОБАЛЬНОЕ СОСТОЯНИЕ
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
export function matrixStateReset(): void {
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
 * Получает текущее состояние модуля для сериализации.
 *
 * @returns Текущее состояние matrix
 */
export function matrixStateGet(): MatrixStateExport {
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
export function matrixStateRestore(state: MatrixStateExport): void {
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
export async function matrixInit(
  params: MatrixInitParams,
  atlasExport: StringAtlasExport,
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
    matrixStateReset()

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
 */
export function matrixStep(): void {
  if (!backend) throw new Error("Matrix not initialized")
  backend.run()
}

/**
 * Читает изменённые состояния из GPU.
 */
export async function matrixReadChanges(): Promise<[number, number][]> {
  if (!backend) throw new Error("Matrix not initialized")
  return await backend.readChanges()
}

/**
 * Обновляет поля в heap на GPU.
 *
 * @param updates - Массив обновлений
 */
export function matrixHeapUpdate(updates: Array<{ offset: number; value1: number; value2?: number }>): void {
  if (!backend) throw new Error("Matrix not initialized")
  backend.updateHeapFields(updates)
}
