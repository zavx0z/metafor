import type { ValueType } from "./index.ts"
import type { ValueVariable, ValueDynamic } from "../parser.ts"

/**
 * Массивы атрибутов.
 * Используется для атрибутов, которые могут содержать несколько значений (class, rel).
 *
 * @group Значения атрибутов
 * @example
 * ```html
 * <div class="container ${fields.theme} ${fields.isActive && 'active'}">
 *   Элемент с несколькими классами
 * </div>
 * ```
 */

export type ValueArray = string | ValueVariable | ValueDynamic

export interface RawAttrArray {
  [key: string]: { type: ValueType; value: string }[]
}
