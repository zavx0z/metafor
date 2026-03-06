import type {MatrixStateExport} from "./matrix.t.ts"
import {GPUBackend} from "./backend.ts"

/**
 * Глобальное состояние модуля.
 */
export const store = {
  /** GPU бэкенд. */
  backend: null as GPUBackend | null,
  /** Heap данные — только для поиска смещений полей и сериализации. */
  heap: null as Uint32Array | null,
  /** Смещения блоков бран в heap — для update(). */
  braneBlockPtrs: [] as number[],
  /** Смещение для динамических аллокаций ARRAY в heap. */
  heapAllocOffset: 0,
  /** Размер резервированной зоны для ARRAY в heap. */
  arrayReserveSize: 0,
  /** Флаг: данные ARRAY невалидны после update(). */
  arrayDataInvalidated: false,
  /** Mutex для предотвращения конкурентных вызовов. */
  operationMutex: null as Promise<void> | null,
}

/**
 * Сбрасывает состояние модуля.
 * @internal
 */
export function matrixStoreReset(): void {
  if (store.backend) {
    store.backend.clear()
  }
  store.backend = null
  store.heap = null
  store.braneBlockPtrs = []
  store.heapAllocOffset = 0
  store.arrayReserveSize = 0
  store.arrayDataInvalidated = false
  store.operationMutex = null
}

/**
 * Получает текущее состояние модуля для сериализации.
 *
 * @returns Текущее состояние matrix
 */
export function matrixStoreGet(): MatrixStateExport {
  return {
    heap: store.heap!,
    braneBlockPtrs: store.braneBlockPtrs,
    heapAllocOffset: store.heapAllocOffset,
    arrayReserveSize: store.arrayReserveSize,
    arrayDataInvalidated: store.arrayDataInvalidated,
  }
}

/**
 * Восстанавливает состояние модуля из сериализованных данных.
 *
 * @param state - Состояние для восстановления
 * @internal
 */
export function matrixStoreRestore(state: MatrixStateExport): void {
  store.heap = state.heap
  store.braneBlockPtrs = state.braneBlockPtrs
  store.heapAllocOffset = state.heapAllocOffset
  store.arrayReserveSize = state.arrayReserveSize
  store.arrayDataInvalidated = state.arrayDataInvalidated
}