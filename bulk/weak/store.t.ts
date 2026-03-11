/**
 * Weak Store — типы хранилища процессов.
 *
 * @packageDocumentation
 */

import type { MetaJson } from "@metafor/ast"

export type Intention = string

/**
 * Хранилище схем процессов: ключ → схема.
 */
export type ProcessesStore = Map<Intention, MetaJson>

/**
 * Внутреннее состояние `Bulk × Weak`.
 */
export interface WeakStoreState {
  /** Схемы процессов: ключ → схема */
  processes: ProcessesStore
}
