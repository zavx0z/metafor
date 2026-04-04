import type { ValueVariable, ValueDynamic } from "../parser.t.ts"

/**
 * Булевые атрибуты.
 * HTML атрибуты, которые присутствуют или отсутствуют (hidden, disabled, checked).
 *
 * @group Значения атрибутов
 * @example
 * ```html
 * <input type="checkbox" ${mass.user.isSubscribed && "checked"} />
 * <button ${!fields.canSubmit && "disabled"}>Отправить</button>
 * <div ${!fields.isVisible && "hidden"}>Скрытый контент</div>
 * ```
 */

export type ValueBoolean = boolean | ValueVariable | ValueDynamic
export type RawAttrBoolean = Record<string, { type: "dynamic" | "static"; value: boolean | string }>
