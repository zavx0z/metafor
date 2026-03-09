import type { MatrixChanges, MatrixHeapUpdate, MatrixInitParams } from "./matrix.t"
import type { StringAtlasExport } from "@boundary/atlas"
import { matrixStoreReset, store } from "./store.ts"
import type { BoundaryStore } from "../store"
import { createMatrixRuntime } from "./runtime"

// ============================================================================
// INIT
// ============================================================================

/**
 * Инициализирует runtime матрицы и фиксирует выбранную среду.
 *
 * @param store$ - Общее хранилище `@boundary/boundary` с heap и bytecode.
 * @param params - Подготовленные данные для запуска matrix runtime.
 * @param atlasExport - Экспорт `@boundary/atlas` для GPU-режима.
 * @param blockPtrs - Смещения блоков бран в heap.
 * @internal
 */
export async function matrixInit(
  store$: BoundaryStore,
  params: MatrixInitParams,
  atlasExport: StringAtlasExport,
  blockPtrs: number[],
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
    const selected = await createMatrixRuntime({ params, atlasExport, blockPtrs })
    store.initialized = true
    store.mode = selected.mode
    store.runtime = selected.runtime

    // Единый снимок boundary нужен обеим средам.
    store$.heap = params.heap
    store$.braneBlockPtrs = blockPtrs

    store.cpuStates = selected.runtime.statesSnapshot() ?? params.states.slice()
  } finally {
    resolveMutex?.()
  }
}

// ============================================================================
// OPERATIONS
// ============================================================================

/**
 * Выполняет один шаг активного runtime матрицы.
 */
export function matrixStep(): void {
  if (!store.initialized) throw new Error("Matrix not initialized")
  if (!store.runtime) throw new Error("Matrix runtime not initialized")
  store.runtime.step()
}

/**
 * Читает изменения состояний после последнего шага матрицы.
 */
export async function matrixReadChanges(): Promise<MatrixChanges> {
  if (!store.initialized) throw new Error("Matrix not initialized")
  if (!store.runtime) throw new Error("Matrix runtime not initialized")
  const changes = await store.runtime.readChanges()
  const snapshot = store.runtime.statesSnapshot()
  if (snapshot) {
    store.cpuStates = snapshot
  }
  return changes
}

/**
 * Синхронизирует обновления heap с активной средой матрицы.
 *
 * @param updates - Изменённые слова heap.
 */
export function matrixHeapUpdate(updates: MatrixHeapUpdate[]): void {
  if (!store.initialized) throw new Error("Matrix not initialized")
  if (!store.runtime) throw new Error("Matrix runtime not initialized")
  store.runtime.heapUpdate(updates)
}

/**
 * Выполняет шаг матрицы и возвращает список изменившихся состояний.
 */
export async function matrixRunStep(): Promise<MatrixChanges> {
  if (!store.initialized) throw new Error("Matrix not initialized")
  matrixStep()
  return await matrixReadChanges()
}
