import type { MatrixRuntime } from "./matrix.t.ts"

/**
 * Доступные реализации runtime матрицы.
 */
export type MatrixMode = "cpu" | "gpu"

/**
 * Состояние локального хранилища `@boundary/matrix`.
 */
export interface MatrixStore {
  /** Активный runtime матрицы. */
  runtime: MatrixRuntime | null

  /** Mutex для предотвращения конкурентных вызовов. */
  operationMutex: Promise<void> | null

  /** Флаг готовности runtime после boundary.write(). */
  initialized: boolean

  /** Выбранная среда выполнения матрицы. */
  mode: MatrixMode

  /** Снимок состояний для CPU-режима. */
  cpuStates: Uint32Array
}
