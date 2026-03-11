import type { MatrixChanges, MatrixHeapUpdate } from "./matrix.t"
import { matrix$ } from "./store"
import type { BoundaryStore } from "../store"
import { createMatrixRuntime } from "./runtime"

// ============================================================================
// INIT
// ============================================================================

/**
 * Инициализирует runtime матрицы и фиксирует выбранную среду.
 *
 * @param store$ - Каноническое хранилище `Boundary`, из которого runtime читает данные.
 * @internal
 */
export async function matrixInit(
  store$: BoundaryStore,
): Promise<void> {
  if (matrix$.operationMutex) {
    await matrix$.operationMutex
  }

  let resolveMutex: (() => void) | undefined
  matrix$.operationMutex = new Promise<void>((resolve) => {
    resolveMutex = resolve
  })

  try {
    matrix$.reset()
    const selected = await createMatrixRuntime(store$)
    matrix$.initialized = true
    matrix$.mode = selected.mode
    matrix$.runtime = selected.runtime
    matrix$.boundary$ = store$

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
  if (!matrix$.initialized) throw new Error("Matrix not initialized")
  if (!matrix$.runtime) throw new Error("Matrix runtime not initialized")
  matrix$.runtime.step()
}

/**
 * Читает изменения состояний после последнего шага матрицы.
 */
export async function matrixReadChanges(): Promise<MatrixChanges> {
  if (!matrix$.initialized) throw new Error("Matrix not initialized")
  if (!matrix$.runtime) throw new Error("Matrix runtime not initialized")
  const changes = await matrix$.runtime.readChanges()
  const snapshot = matrix$.runtime.statesSnapshot()
  if (snapshot && matrix$.boundary$) {
    matrix$.boundary$.states = snapshot
  }
  return changes
}

/**
 * Синхронизирует канонические обновления store с активной средой матрицы.
 *
 * CPU читает канонический store напрямую. GPU локально переводит эти обновления
 * в частичную синхронизацию своих производных буферов.
 */
export function matrixHeapUpdate(updates: MatrixHeapUpdate[]): void {
  if (!matrix$.initialized) throw new Error("Matrix not initialized")
  if (!matrix$.runtime) throw new Error("Matrix runtime not initialized")
  matrix$.runtime.heapUpdate(updates)
}

/**
 * Выполняет шаг матрицы и возвращает список изменившихся состояний.
 */
export async function matrixRunStep(): Promise<MatrixChanges> {
  if (!matrix$.initialized) throw new Error("Matrix not initialized")
  matrixStep()
  return await matrixReadChanges()
}
