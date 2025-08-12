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
   * Источник: "context" | "core" | "state".
   *
   * Правила ключей:
   * - для простого поля допускается строка: `"name"`
   * - для составного пути ключ ДОЛЖЕН быть массивом строк: `["user", "name"]`
   * - парсер никогда не возвращает составные ключи в виде строки с точками
   *
   * Пример шаблона: html`<span>${context.user.name}</span>`
   * Пример схем:
   *  - { type: "text", value: { src: "context", key: "name" } }
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
   * Шаблон со списком значений (унифицированный формат для смешанного текста).
   *
   * Правила:
   * - Индексы в шаблоне `${0}`, `${1}`, ... соответствуют элементам в `items` по порядку
   * - Для `state` используется элемент `{ src: "state" }`
   * - Для полей контекста/ядра используйте `{ src: "context"|"core", key }`
   * - Для глобального пути используйте `{ src: ["context"|"core"|"state", ...], key? }`
   *
   * Примеры:
   * - Один элемент: { template: "Hello ${0}", items: [{ src: "context", key: "name" }] }
   * - Несколько элементов: { template: "A=${0} B=${1}", items: [{ src: "state" }, { src: "core", key: "id" }] }
   */
  | {
      template: string
      items: Array<
        | { src: "state" }
        | { src: "context" | "core"; key: string | string[] }
        | { src: string[]; key?: string | string[] }
        | { src: "item"; key?: string | string[] }
      >
    }
  /**
   * Значение по составному пути с ключом (для массивов).
   * Пример шаблона: html`<li>${item.name}</li>` в массиве
   * Пример схемы: { type: "text", value: { src: ["core", "users"], key: "name" } }
   */
  | { src: string[]; key: string | string[] }
  /**
   * Смешанный вариант с шаблоном результата.
   * Источник: "context" | "core" | "state". Ключ — путь в источнике (string | string[]).
   * Для составных ключей используйте массив строк; парсер нормализует их в массивы.
   * Если указан result, он вычисляется при рендеринге как шаблонная строка
   * с доступом к state, context, core.
   * Пример шаблона: html`<span>${context.user.name}</span>`
   * Пример схем:
   *  - { type: "text", value: { src: "context", key: "name", result: "User: ${context.user.name}" } }
   *  - { type: "text", value: { src: "context", key: ["user", "name"], result: "User: ${context.user.name}" } }
   */
  | { src: string; key: string | string[]; result?: string } /**
   * Схема текстового узла
   */
  /**
   * Значение текущего состояния без ключа.
   * Пример шаблона: html`<span>${state}</span>`
   * Пример схемы: { type: "text", value: { src: "state" } }
   */
  | { src: "state" }
