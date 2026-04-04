import type { ValueType } from "./index.t.ts"
import type { ValueStatic, ValueVariable, ValueDynamic } from "../parser.t.ts"

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

export type ValueString = ValueStatic | ValueVariable | ValueDynamic
export type RawAttrString = Record<string, { type: ValueType; value: string }>
