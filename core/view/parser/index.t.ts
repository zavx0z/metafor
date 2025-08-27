// Входные данные
export type Content = Record<string, string | number | boolean | null | Array<string | number | boolean | null>>
export type Core = Record<string, any>
export type State = string

export type Render<C extends Content = Content, I extends Core = Core, S extends State = State> = (args: {
  html: (strings: TemplateStringsArray, ...values: any[]) => string
  core: I
  context: C
  state: State
  update: (context: Partial<C>) => void
}) => void

import type { ParseAttributeResult } from "./data.t"

// Выходные данные
/**
 * Узел HTML элемента.
 * Представляет HTML тег с атрибутами и дочерними элементами.
 */
export interface NodeElement extends AttributesNode {
  /** Имя HTML тега */
  tag: string
  /** Тип узла - всегда "el" для элементов */
  type: "el"
  /** Дочерние узлы элемента */
  child?: Node[]
}
/**
 * Текстовый узел.
 * Представляет текст с путями к данным или статическими значениями.
 */

export interface NodeText {
  /** Тип узла - всегда "text" для текстовых узлов */
  type: "text"
  /** Путь(и) к данным (если текст динамический) */
  data?: string | string[]
  /** Статическое значение (если текст статический) */
  value?: string
  /** Выражение с индексами (если текст смешанный) */
  expr?: string
}
/**
 * Узел map операции.
 * Представляет итерацию по массиву данных с дочерними элементами.
 */

export interface NodeMap {
  /** Тип узла - всегда "map" для map операций */
  type: "map"
  /** Путь к массиву данных для итерации */
  data: string
  /** Дочерние узлы, которые будут повторены для каждого элемента массива */
  child: Node[]
}
/**
 * Узел условного оператора.
 * Представляет тернарный оператор с ветками true и false.
 */

export interface NodeCondition {
  /** Тип узла - всегда "cond" для условных операторов */
  type: "cond"
  /** Путь(и) к данным для условия */
  data: string | string[]
  /** Выражение с индексами (если условие сложное) */
  expr?: string
  /** Узел для случая когда условие истинно */
  true: Node
  /** Узел для случая когда условие ложно */
  false: Node
}

/**
 * Мета-узел.
 * Представляет мета-тег с динамическим именем тега.
 */
export interface NodeMeta extends AttributesNode {
  /** Имя мета-тега (может быть динамическим) */
  tag: string | ParseAttributeResult
  /** Тип узла - всегда "meta" для мета-узлов */
  type: "meta"

  /** Дочерние элементы (опционально) */
  child?: Node[]
}

interface AttributesNode {
  /** События */
  event?: AttributeEvent
  /** Булевые аттрибуты */
  boolean?: AttributeBoolean
  /** Массивы аттрибутов */
  array?: AttributeArray
  /** Строковые аттрибуты */
  string?: AttributeString
  /** Объектные аттрибуты (стили) */
  object?: AttributeObject
}

/**
 * Результат парсинга атрибута.
 */
export type AttributeParseResult = {
  /** Путь(и) к данным (необязательное) */
  data?: string | string[]
  /** Унифицированное выражение (необязательное) */
  expr?: string
  /** Ключи для обновления (необязательное) */
  upd?: string | string[]
}
type AttrVariable = { data: string }
type AttrDynamic = {
  data: string | string[]
  expr: string
}
type AttrUpdate = {
  data?: string | string[]
  expr?: string
  upd: string | string[]
}

export type AttributeEvent = Record<
  string,
  AttrVariable | AttrDynamic | AttrUpdate | { expr: string; upd?: string | string[] }
>

export type AttributeArray = Record<string, (AttrStaticArray | AttrVariable | AttrDynamic)[]>
type AttrStaticArray = { value: string }

export type AttributeString = Record<string, AttrStaticString | AttrVariable | AttrDynamic>
type AttrStaticString = string

export type AttributeBoolean = Record<string, boolean | AttrVariable | AttrDynamic>

export type AttributeObject = Record<string, Record<string, string>>

export type Node = NodeMap | NodeCondition | NodeText | NodeElement | NodeMeta
