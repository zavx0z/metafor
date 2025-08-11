/**
 * Схема текстового узла
 */
export interface TextSchema {
  type: "text"
  value: TextValue
}

/** Возможные варианты значения текстового узла */
export type TextValue =
  /**
   * Статический текст без интерполяций.
   * Пример шаблона: html`<span>Hello</span>`
   * Пример схемы: { type: "text", value: "Hello" }
   */
  | string
  /**
   * Прямая интерполяция значения по ключу из источника.
   * Источник: "context" | "core". Ключ может быть строкой (в т.ч. составной через точку)
   * или массивом строк (нормализованный путь).
   * Пример шаблона: html`<span>${context.user.name}</span>`
   * Пример схем:
   *  - { type: "text", value: { src: "context", key: "user.name" } }
   *  - { type: "text", value: { src: "context", key: ["user", "name"] } }
   */
  | { src: string; key: string | string[] }
  /**
   * Значение по составному пути без явного ключа (обычно внутри массивов из примитивов).
   * Пример шаблона: html`<ul>${context.ids.map((id) => html`<li>${id}</li>`)}</ul>`
   * Пример схемы для текста <li>: { type: "text", value: { src: ["context", "ids"] } }
   */
  | { src: string[] }
  /**
   * Смешанный вариант с шаблоном результата.
   * Источник: "context" | "core". Ключ — путь в источнике (string | string[]).
   * Если указан result, он вычисляется при рендеринге как шаблонная строка
   * с доступом к state, context, core.
   * Пример шаблона: html`<span>${context.user.name}</span>`
   * Пример схем:
   *  - { type: "text", value: { src: "context", key: "user.name", result: "User: ${context.user.name}" } }
   *  - { type: "text", value: { src: "context", key: ["user", "name"], result: "User: ${context.user.name}" } }
   */
  | { src: string; key: string | string[]; result?: string } /**
 * Схема текстового узла
 */
