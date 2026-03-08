/**
 * Weak Store — типы хранилища процессов.
 *
 * @packageDocumentation
 */

import type { MetaJson } from "@metafor/ast"
import type { Intention } from "../force.t"

/**
 * Хранилище схем процессов: ключ → схема.
 */
export type ProcessesStore = Map<Intention, MetaJson>

/**
 * Внутреннее состояние WEAK FORCE-домена.
 */
export interface WeakStoreState {
  /** Схемы процессов: ключ → схема */
  processes: ProcessesStore
}
