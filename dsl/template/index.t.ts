import type { NodeType } from "./node/index.t"
export type { NodeType as Node }
export type { NodeMeta } from "./node/meta.t"
export type { NodeCondition } from "./node/condition.t"
export type { NodeLogical } from "./node/logical.t"
export type { NodeMap } from "./node/map.t"
export type { NodeText } from "./node/text.t"
export type { NodeElement } from "./node/element.t"

export type { ValueArray } from "./attribute/array.t"
export type { ValueBoolean } from "./attribute/boolean.t"
export type { ValueString } from "./attribute/string.t"
export type { ValueEvent } from "./attribute/event.t"
export type { ValueStyle } from "./attribute/style.t"
export type { ValueStatic, ValueVariable, ValueDynamic } from "./parser.t"

/**
 * Поля.
 *
 * {@link https://zavx0z.github.io/fields/types/Values | Значения полей}
 * содержат простые данные, доступные в шаблоне для рендеринга.
 * Поддерживает только примитивные типы и массивы примитивных типов.
 *
 * @group Шаблонизатор
 * @example
 * ```typescript
 * const fields: Fields = {
 *   framework: "MetaFor",
 *   isActive: true,
 *   tags: ["tag1", "tag2", "tag3"]
 *   count: 4444,
 * }
 * ```
 */
export type Fields = Record<string, string | number | boolean | null | Array<string | number | boolean>>

/**
 * Mass объект.
 * Содержит сложные данные, объекты, функции и утилиты, доступные в шаблоне.
 * Может содержать любые типы данных: объекты, массивы, функции, классы.
 *
 * @group Шаблонизатор
 * @example
 * ```typescript
 * const mass: Mass = {
 *   user: {
 *     name: "Иван",
 *     profile: {
 *       avatar: "avatar.jpg",
 *       settings: { theme: "dark", language: "ru" }
 *     }
 *   },
 *   posts: [
 *     { id: 1, title: "Заголовок", content: "Содержимое" },
 *     { id: 2, title: "Другой пост", content: "Еще содержимое" }
 *   ],
 *   api: {
 *     baseUrl: "https://api.example.com",
 *     endpoints: { users: "/users", posts: "/posts" }
 *   },
 *   utils: {
 *     formatDate: (date: Date) => date.toLocaleDateString(),
 *     escapeHtml: (str: string) => str.replace(/</g, "&lt")
 *   }
 * }
 * ```
 */
export type Mass = Record<string, any>

/**
 * Состояние приложения.
 * Строковое представление текущего состояния.
 *
 * @group Шаблонизатор
 * @example
 * ```typescript
 * const state: State = "loading" // "loading" | "ready" | "error"
 * ```
 */
export type State = string

/**
 * Параметры для функции шаблонизатора.
 * Содержит все необходимые данные и функции для шаблонизации.
 * {@includeCode ./index.spec.ts#params}
 *
 * @group Шаблонизатор
 */
export type Params<F extends Fields, M extends Mass = Mass, S extends State = State> = {
  /** Функция для создания HTML из template literals */
  html: (strings: TemplateStringsArray, ...values: any[]) => string
  /**
   * @inheritdoc Mass
   */
  mass: M
  /**
   * @inheritdoc Fields
   */
  fields: F
  /**
   * @inheritdoc State
   */
  state: S
  /**
   * Функция для обновления полей {@link https://zavx0z.github.io/fields/types/Update | Update}.
   * Используется в обработчиках событий для изменения состояния.
   *
   * @example
   * ```typescript
   * // Обновление одного поля
   * update({ count: 5 })
   *
   * // Обновление нескольких полей
   * update({ name: "John", age: 25 })
   *
   * // В обработчике события
   * html`<button onclick=${() => update({ active: !fields.active })}>Toggle</button>`
   * ```
   */
  update: (fields: Partial<F>) => void
}

/**
 * Парсит HTML-шаблон и возвращает обогащенную иерархию с метаданными о путях к данным.
 *
 * @param template - Функция шаблонизатора, которая принимает параметры { html, fields, mass, state, update }
 * @returns Массив узлов с полной структурой и метаданными о путях к данным
 */
export declare function parse<F extends Fields = Fields, M extends Mass = Mass, S extends State = State>(
  template: (params: Params<F, M, S>) => void
): NodeType[]
