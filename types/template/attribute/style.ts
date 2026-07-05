import type { ValueVariable, ValueDynamic } from "../parser.ts"

/**
 * Объект стилей.
 * CSS стили в виде JavaScript объекта (styled-components подход).
 *
 * @group Значения атрибутов
 * @example Простой объект стилей
 * ```html
 * <div style=${{backgroundColor: "red", color: "white"}}>
 *   Стилизованный элемент
 * </div>
 * ```
 *
 * @example Динамические стили
 * ```html
 * <div style=${{backgroundColor: mass.theme.primary, color: mass.theme.text}}>
 *   Элемент с темой
 * </div>
 * ```
 *
 * @example Условные стили
 * ```html
 * <div style=${{backgroundColor: fields.isActive ? "green" : "red", color: "white"}}>
 *   Условный стиль
 * </div>
 * ```
 */

export type ValueStyle = string | ValueVariable | ValueDynamic
