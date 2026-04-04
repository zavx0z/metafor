import type { ValueType } from "./index.t.ts"
import type { ValueStatic } from "../parser.t.ts"
import type { ValueVariable, ValueDynamic } from "../parser.t.ts"

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

export type ValueArray = ValueStatic | ValueVariable | ValueDynamic
export type RawAttrArray = Record<string, { type: ValueType; value: string }[]>
