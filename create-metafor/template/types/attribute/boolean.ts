import type { ValueVariable, ValueDynamic } from "../parser.ts"

/**
 * Булевые атрибуты.
 * HTML атрибуты, которые присутствуют или отсутствуют (hidden, disabled, checked).
 *
 * @group Значения атрибутов
 * @example
 * ```html
 * <input type="checkbox" ${value.isSubscribed && "checked"} />
 * <button ${!fields.canSubmit && "disabled"}>Отправить</button>
 * <div ${!fields.isVisible && "hidden"}>Скрытый контент</div>
 * ```
 */

export type ValueBoolean = boolean | ValueVariable | ValueDynamic

export interface RawAttrBoolean {
  [key: string]: { type: "dynamic" | "static"; value: boolean | string }
}
