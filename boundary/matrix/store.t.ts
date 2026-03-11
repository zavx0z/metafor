import type { MatrixRuntime } from "./matrix.t.ts"
import type { BoundaryStore } from "../store.t.ts"

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

  /** Ссылка на канонический Boundary store, который Matrix читает и мутирует во время выполнения. */
  boundary$: BoundaryStore | null

  /** Сбрасывает runtime-состояние Matrix и освобождает активную среду. */
  reset(): void
}
