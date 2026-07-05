import type { ValueType } from "./index.ts"
import type { ValueVariable, ValueDynamic } from "../parser.ts"

/**
 * Строковые атрибуты.
 * Обычные HTML атрибуты со строковыми значениями.
 *
 * @group Значения атрибутов
 * @example
 * ```html
 * <img src=${fields.url} alt=${fields.alt} title=${fields.title} />
 * <a href="/user/${mass.user.id}">Профиль пользователя</a>
 * ```
 */

export type ValueString = string | ValueVariable | ValueDynamic

export interface RawAttrString {
  [key: string]: { type: ValueType; value: string }
}
