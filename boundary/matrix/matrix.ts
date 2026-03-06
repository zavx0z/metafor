import {GPUBackend} from "./backend"
import {GPU} from "./device"
import type {MatrixInitParams} from "./matrix.t"
import type {StringAtlasExport} from "@boundary/atlas"
import {matrixStoreReset, store} from "./store.ts"

// ============================================================================
// STORE
// ============================================================================

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
  if (store.operationMutex) {
    await store.operationMutex
  }

  let resolveMutex: (() => void) | undefined
  store.operationMutex = new Promise<void>((resolve) => {
    resolveMutex = resolve
  })

  try {
    matrixStoreReset()

    store.backend = new GPUBackend(GPU.device)
    await store.backend.init(
      {
        braneCount: params.states.length,
        ...params,
      },
      atlasExport,
      false,
    )

    store.heap = params.heap
    store.braneBlockPtrs = blockPtrs
    store.arrayReserveSize = reserveSize
    store.heapAllocOffset = store.heap.length - reserveSize
    store.arrayDataInvalidated = false
  } finally {
    resolveMutex?.()
  }
}

/**
 * Выполняет шаг эволюции GPU.
 */
export function matrixStep(): void {
  if (!store.backend) throw new Error("Matrix not initialized")
  store.backend.run()
}

/**
 * Читает изменённые состояния из GPU.
 */
export async function matrixReadChanges(): Promise<[number, number][]> {
  if (!store.backend) throw new Error("Matrix not initialized")
  return await store.backend.readChanges()
}

/**
 * Обновляет поля в heap на GPU.
 *
 * @param updates - Массив обновлений
 */
export function matrixHeapUpdate(updates: Array<{ offset: number; value1: number; value2?: number }>): void {
  if (!store.backend) throw new Error("Matrix not initialized")
  store.backend.updateHeapFields(updates)
}
