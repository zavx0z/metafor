import type { MatrixStore } from "./store.t.ts"

/**
 * Глобальное состояние модуля `@boundary/matrix`.
 *
 * @property runtime {@link MatrixStore.runtime|активный runtime матрицы}
 * @property operationMutex {@link MatrixStore.operationMutex|mutex для предотвращения конкурентных вызовов}
 * @property initialized {@link MatrixStore.initialized|флаг готовности boundary runtime}
 * @property mode {@link MatrixStore.mode|выбранная среда выполнения матрицы}
 * @property boundary {@link MatrixStore.boundary|canonical Boundary store}
 *
 * @see {@link MatrixStore} — тип состояния
 */
export const store: MatrixStore = {
  runtime: null,
  operationMutex: null,
  initialized: false,
  mode: "cpu",
  boundary: null,
}

/**
 * Сбрасывает состояние модуля.
 * @internal
 */
export function matrixStoreReset(): void {
  if (store.runtime) {
    store.runtime.clear()
  }
  store.runtime = null
  store.operationMutex = null
  store.initialized = false
  store.mode = "cpu"
  store.boundary = null
}
