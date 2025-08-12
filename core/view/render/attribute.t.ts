/**
 * Значение атрибута — статическое, интерполяция, шаблон или условное значение.
 *
 * Базовые правила:
 * - Для смешанного контента используется унифицированный формат `{ template, items }`, где `${0}`, `${1}`, ...
 *   соответствуют элементам массива `items` по порядку
 * - В `items` допускаются источники: `state`, `context|core` c `key`, глобальный путь `string[]` с `key?`, `item` с `key?`
 * - Для простой интерполяции используйте `{ src, key? }` (в массивах `src` может быть `string[]` — накопленный путь)
 *
 * Условные значения атрибутов поддерживаются двумя способами:
 * 1) По источнику: `{ src, key?, true, false? }` — условие трактуется как строго `value === true`
 * 2) По выражению: `{ template, items, true, false? }` — логическое выражение над позиционными значениями из `items`
 *
 * Упрощения синтаксиса (рекомендации):
 * - Если выражение — это просто значение одной переменной (эквивалент шаблона `"${0}"`), `template` опускаем
 * - Если в выражении используется ровно одна переменная, `items` опускаем и используйте форму по источнику `{ src, key? }`
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
  /**
   * Условное значение по источнику.
   * Истина определяется как строгое равенство `value === true`.
   *
   * Ветви `true` и `false` могут быть строкой или шаблоном `{ template, items }`.
   * Рекомендация: для булевых атрибутов (disabled, readonly, ...) строка `"disabled"/"readonly"` включает атрибут; пустая строка — не устанавливает.
   */
  | {
      /** Источник значения условия: context/core/state/item или глобальный путь */
      src: string | string[]
      /** Ключ/путь внутри источника (для составных путей используйте массив строк) */
      key?: string | string[]
      /** Значение ветви при true: строка или шаблон */
      true:
        | string
        | {
            template: string
            items: Array<
              | { src: "state" }
              | { src: "context" | "core"; key: string | string[] }
              | { src: string[]; key?: string | string[] }
              | { src: "item"; key?: string | string[] }
            >
          }
      /** Значение ветви при false: строка или шаблон (может отсутствовать) */
      false?:
        | string
        | {
            template: string
            items: Array<
              | { src: "state" }
              | { src: "context" | "core"; key: string | string[] }
              | { src: string[]; key?: string | string[] }
              | { src: "item"; key?: string | string[] }
            >
          }
    }
  /**
   * Условное значение по выражению.
   * `template` — логическое выражение над позиционными значениями из `items`.
   * Пример: `template: "${0}===${1}"`, где `items` содержит два источника.
   * Ветви `true`/`false` аналогично могут быть строкой или шаблоном.
   */
  | {
      /** Логическое выражение над позиционными значениями items */
      template: string
      /** Источники переменных для выражения */
      items: Array<
        | { src: "state" }
        | { src: "context" | "core"; key: string | string[] }
        | { src: string[]; key?: string | string[] }
        | { src: "item"; key?: string | string[] }
      >
      /** Значение ветви при true: строка или шаблон */
      true:
        | string
        | {
            template: string
            items: Array<
              | { src: "state" }
              | { src: "context" | "core"; key: string | string[] }
              | { src: string[]; key?: string | string[] }
              | { src: "item"; key?: string | string[] }
            >
          }
      /** Значение ветви при false: строка или шаблон (может отсутствовать) */
      false?:
        | string
        | {
            template: string
            items: Array<
              | { src: "state" }
              | { src: "context" | "core"; key: string | string[] }
              | { src: string[]; key?: string | string[] }
              | { src: "item"; key?: string | string[] }
            >
          }
    }
