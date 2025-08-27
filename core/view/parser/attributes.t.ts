import type { PartText } from "./hierarchy.t"

export type Attribute = "boolean" | "array" | "event" | "string"

export type AttributeValue = {
  name: string
  type: Attribute
  value: string
}

export type ValueType = "dynamic" | "static" | "mixed"

export type AttributeEvent = Record<string, string>

export type AttributeArray = Record<string, { value: string; type: ValueType }[]>

export type AttributeString = Record<string, { type: ValueType; value: string }>

export type AttributeBoolean = Record<string, { type: "dynamic" | "static"; value: boolean | string }>

export type AttributeObject = Record<string, string>

export type PartAttrElement = {
  /** Имя HTML тега */
  tag: string
  /** Тип узла */
  type: "el"
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
  /** Дочерние элементы (опционально) */
  child?: (PartAttrElement | PartAttrMeta | PartAttrCondition | PartAttrMap | PartText)[]
}

export type PartAttrMeta = {
  /** Имя мета-тега */
  tag: string
  /** Тип узла */
  type: "meta"
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
  /** Дочерние элементы (опционально) */
  child?: (PartAttrElement | PartAttrMeta | PartAttrCondition | PartAttrMap | PartText)[]
}

export type PartAttrCondition = {
  /** Тип узла */
  type: "cond"
  /** Исходный текст условия */
  text: string
  /** Элемент, рендерящийся когда условие истинно */
  true: PartAttrElement | PartAttrMeta | PartAttrCondition
  /** Элемент, рендерящийся когда условие ложно */
  false: PartAttrElement | PartAttrMeta | PartAttrCondition
}
export type PartAttrMap = {
  /** Тип узла */
  type: "map"
  /** Исходный текст map-выражения */
  text: string
  /** Дочерние элементы, повторяемые для каждого элемента коллекции */
  child: (PartAttrElement | PartText | PartAttrMap | PartAttrCondition | PartAttrMeta)[]
}
export type PartAttrs = (PartAttrElement | PartAttrMeta | PartAttrCondition | PartAttrMap | PartText)[]
