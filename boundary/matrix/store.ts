import { GPUBackend } from "./backend.ts"

/**
 * Состояние локального хранилища `@boundary/matrix`.
 *
 * Хранит ТОЛЬКО GPU-специфичные данные.
 *
 * ## Почему не хранит heap и braneBlockPtrs
 *
 * Эти данные вынесены в `@boundary/store` так как используются несколькими пакетами:
 * - `@boundary/fields` — для update()
 * - `@boundary/matrix` — для GPU операций
 * - `@boundary/monad` — для unlock()
 *
 * @see `@boundary/store` — общее хранилище для heap, braneBlockPtrs
 */
export interface MatrixStore {
  /** GPU бэкенд (buffers, device). */
  backend: GPUBackend | null
  /** Mutex для предотвращения конкурентных вызовов. */
  operationMutex: Promise<void> | null
}

/**
 * Глобальное состояние модуля `@boundary/matrix`.
 *
 * @property backend {@link MatrixStore.backend|GPU ресурсы (buffers, device)}
 * @property operationMutex {@link MatrixStore.operationMutex|mutex для предотвращения конкурентных вызовов}
 *
 * @see {@link MatrixStore} — тип состояния
 */
export const store: MatrixStore = {
  backend: null,
  operationMutex: null,
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
  store.operationMutex = null
}
