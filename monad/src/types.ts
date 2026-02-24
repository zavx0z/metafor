/**
 * Типы для Monad.
 *
 * @packageDocumentation
 */

import type { Superposition } from "@metafor/boundary"

/**
 * Функция обновления параметров (не используется в execute).
 */
export type Update = (params: Record<string, unknown>) => void

/**
 * Действие — функция, выполняемая при изменении состояния.
 */
export type Action = (params: Record<string, unknown>) => void

/**
 * Карта действий по именам состояний.
 */
export type Actions = Record<string, Action | null>

/**
 * Брана — носитель состояния.
 */
export interface Brane {
  params: Record<string, unknown>
  state: string
  superposition: Superposition
}
