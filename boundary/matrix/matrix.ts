import type { MatrixChanges, MatrixHeapUpdate } from "./matrix.t"
import { matrixStoreReset, store } from "./state"
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
 * @internal
 */
export async function matrixInit(
  store$: BoundaryStore,
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
    const selected = await createMatrixRuntime(store$)
    store.initialized = true
    store.mode = selected.mode
    store.runtime = selected.runtime
    store.boundary = store$

    const snapshot = selected.runtime.statesSnapshot()
    if (snapshot) {
      store$.states = snapshot
    }
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
  if (snapshot && store.boundary) {
    store.boundary.states = snapshot
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
