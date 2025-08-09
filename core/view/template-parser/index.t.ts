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
  | string  // статическое значение
  | { src: string; key?: string }  // простая интерполяция (key опционален для item без свойства)
  | { src: string; key?: string; result: string }  // смешанный контент

/**
 * Схема HTML элемента
 */
export interface ElementSchema {
  tag: string
  type: "el"
  attrs?: Record<string, AttributeValue>
  child?: Array<ElementSchema | TextSchema>
  item?: {
    src: string
    key: string
  }
}

/**
 * Схема текстового узла
 */
export interface TextSchema {
  type: "text"
  value: string | { src: string; key?: string }
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
