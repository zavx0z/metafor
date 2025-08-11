/**
 * Типы для HTML Template Parser
 * @module TemplateParserTypes
 */

/**
 * Информация о массиве из контекста или core
 */
export interface ArrayInfo {
  placeholder: string
  source: string
  contextKey: string
  itemTemplate: string
}

/**
 * Значение атрибута - может быть статическим или содержать интерполяции
 */
export type AttributeValue =
  | string // статическое значение
  | { src: string; key?: string | string[] } // простая интерполяция (key опционален для item без свойства)
  | { src: string; key?: string | string[]; result: string } // смешанный контент
  | {
      src: string
      key: string | string[]
      trueValue: string
      falseValue?: string
      type: "conditional"
      result?: string
    } // условный атрибут

/**
 * Условие для элемента
 */
export interface ConditionSchema {
  src: string
  key: string | string[]
  eq?: any // равно значению
  notEq?: any // не равно значению
  gt?: number // больше (для чисел)
  gte?: number // больше или равно
  lt?: number // меньше
  lte?: number // меньше или равно
}

/**
 * Схема HTML элемента
 */
export interface ElementSchema {
  tag: string | { src: "core"; key: string | string[] }
  type: "el" | "meta" | "wc"
  attrs?: Record<string, AttributeValue>
  child?: Array<ElementSchema | TextSchema>
  item?: {
    src: string
    key: string
  }
  cond?: ConditionSchema
  /**
   * Объектные привязки для meta-актеров: контекстные значения
   */
  context?: Record<string, string | number | boolean | null | { src: "context" | "core"; key: string }>
  /**
   * Объектные привязки для meta-актеров: core значения
   */
  core?: Record<string, string | number | boolean | null | { src: "context" | "core"; key: string }>
}

/**
 * Схема текстового узла
 */
export interface TextSchema {
  type: "text"
  value: string | { src: string; key?: string | string[]; result?: string }
}

/**
 * Полная схема шаблона
 */
export type Schema = Array<ElementSchema | TextSchema>

/**
 * Интерфейс парсера шаблонов
 */
export interface ITemplateParser {
  /**
   * Парсит HTML строку в JSON схему
   */
  parseHtmlToSchema(htmlString: string): Schema
}

/**
 * Функция для быстрого парсинга шаблона
 */
export type ParseTemplateFunction = (htmlString: string) => Schema
