import type { ValueVariable, ValueDynamic } from "../parser.ts"

/**
 * Событийные атрибуты.
 * Содержит обработчики событий (onclick, onchange, onsubmit и т.д.)
 *
 * @group Значения атрибутов
 * @example Простая функция без параметров
 * ```html
 * <button onclick=${mass.handleClick}>Кнопка</button>
 * ```
 *
 * Результат:
 * ```json
 * {
 *   "onclick": {
 *     "data": "/mass/handleClick"
 *   }
 * }
 * ```
 *
 * @example Функция с параметрами
 * ```html
 * <input onchange=${(e) => update({ value: e.target.value })} />
 * ```
 *
 * Результат:
 * ```json
 * {
 *   "onchange": {
 *     "upd": "value",
 *     "expr": "(e) => update({ value: e.target.value })"
 *   }
 * }
 * ```
 *
 * @example Событие в массиве
 * ```html
 * <li onclick=${() => mass.item.onClick()}>${mass.item.name}</li>
 * ```
 *
 * Результат:
 * ```json
 * {
 *   "onclick": {
 *     "data": "/mass/item/onClick",
 *     "expr": "() => ${[0]}()"
 *   }
 * }
 * ```
 */
export type ValueEvent =
  | {
      /** Обновляемые ключи контекста в функции Update */
      upd?: string | string[]
      /**
       * Путь(и) к данным для выражения
       *
       * @example
       * ```typescript
       * data: "/fields/value"
       * data: ["/fields/value", "[item]/nested/variable"]
       * ```
       */
      data: string | string[]
      /**
       * Выражение с индексами
       *
       * @example
       * ```typescript
       * expr: "${[0]} === 'admin' ? 'admin' : 'user'"
       * ```
       */
      expr: string
    }
  | {
      /** Обновляемые ключи контекста в функции Update */
      upd?: string | string[]
      /**
       * Выражение с индексами
       *
       * @example
       * ```typescript
       * expr: "${[0]} === 'admin' ? 'admin' : 'user'"
       * ```
       */
      expr: string
    }
  | {
      /**
       * Путь(и) к данным для выражения
       *
       * @example
       * ```typescript
       * data: "/fields/value"
       * data: ["/fields/value", "[item]/nested/variable"]
       * ```
       */
      data: string | string[]
    }

export interface RawAttrEvent {
  [key: string]: string
}
