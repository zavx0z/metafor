import type { WeakRuntime } from "./weak.t.ts"
import type { BoundaryStore } from "../store.t.ts"

/**
 * Доступные реализации слабого runtime.
 */
export type WeakMode = "cpu" | "gpu"

/**
 * Локальное runtime-состояние слабой силы Boundary.
 */
export interface WeakStore {
  /** Активный runtime слабого слоя. */
  runtime: WeakRuntime | null

  /** Mutex для предотвращения конкурентных вызовов. */
  operationMutex: Promise<void> | null

  /** Флаг готовности runtime после boundary.write(). */
  initialized: boolean

  /** Выбранная среда выполнения слабого слоя. */
  mode: WeakMode

  /** Ссылка на канонический Boundary store, который слабый слой читает и синхронизирует. */
  boundary$: BoundaryStore | null

  /** Каноническая адресация состояний materialized runtime: `brane/stateIndex -> metaStateId`. */
  stateMetaStateIdsByBraneIndex: string[][]

  /** Процессная адресация materialized runtime: `brane/stateIndex -> metaProcessId`. */
  stateProcessIdsByBraneIndex: Array<Array<string | undefined>>

  /** Сбрасывает локальное runtime-состояние слабой силы. */
  reset(): void
}
