/**
 * Значение атрибута — статическое, простая интерполяция или унифицированный шаблон (template/items).
 *
 * Правила:
 * - Для смешанного контента используется `{ template, items }`, где `${0}`, `${1}`... соответствуют items по порядку
 * - В items допускаются источники: `state`, `context|core` с `key`, глобальный путь `string[]` с `key?`, и `item` с `key?`
 * - Для простой интерполяции допустим `{ src, key? }` (в массивах src может быть `string[]` — накопленный путь)
 * - Условные атрибуты представлены типом `conditional`
 */

export type AttributeValue =
  | string // статическое значение
  | { src: string | string[]; key?: string | string[] } // простая интерполяция (key опционален для item без свойства)
  | {
      /**
       * Шаблон атрибута с позиционными подстановками `${0}`, `${1}`, ...
       * Индексы соответствуют элементам массива `items` по порядку
       */
      template: string
      /**
       * Набор источников значений для шаблона (по аналогии с текстовыми узлами)
       * - { src: "state" } — текущее состояние
       * - { src: "context" | "core", key } — доступ к полю по ключу/пути
       * - { src: string[], key? } — глобальный путь (например, ["context", "user"]) + необязательный ключ
       * - { src: "item", key? } — текущее значение элемента массива (и/или его поле)
       */
      items: Array<
        | { src: "state" }
        | { src: "context" | "core"; key: string | string[] }
        | { src: string[]; key?: string | string[] }
        | { src: "item"; key?: string | string[] }
      >
    } // смешанный контент (шаблон)
  | {
      src: string | string[]
      key: string | string[]
      trueValue: string
      falseValue?: string
      type: "conditional"
    } // условный атрибут
