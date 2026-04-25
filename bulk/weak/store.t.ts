/**
 * Weak Store — типы хранилища процессов.
 *
 * @packageDocumentation
 */

import type { MetaDSL } from "../../index.ts"

export type Intention = string

/**
 * Хранилище схем процессов: ключ → схема.
 */
export type ProcessesStore = Map<Intention, MetaDSL>

/**
 * Внутреннее состояние `Bulk × Weak`.
 */
export interface WeakStoreState {
  /** Схемы процессов: ключ → схема */
  processes: ProcessesStore
}
