import type { WeakRuntime } from "./weak.t.ts"
import type { EnergyStore } from "../store.t.ts"

/**
 * Доступные реализации слабого runtime.
 */
export type WeakMode = "cpu" | "gpu"

/**
 * Локальное runtime-состояние слабой силы Energy.
 */
export interface WeakStore {
  /** Активный runtime слабого слоя. */
  runtime: WeakRuntime | null

  /** Mutex для предотвращения конкурентных вызовов. */
  operationMutex: Promise<void> | null

  /** Флаг готовности runtime после energy.write(). */
  initialized: boolean

  /** Выбранная среда выполнения слабого слоя. */
  mode: WeakMode

  /** Ссылка на канонический Energy store, который слабый слой читает и синхронизирует. */
  energy$: EnergyStore | null

  /** Каноническая адресация состояний materialized runtime: `brane/stateIndex -> metaStateId`. */
  stateMetaStateIdsByBraneIndex: number[][]

  /** Процессная адресация materialized runtime: `brane/stateIndex -> metaProcessId`. */
  stateProcessIdsByBraneIndex: Array<Array<number | undefined>>

  /** Сбрасывает локальное runtime-состояние слабой силы. */
  reset(): void
}
