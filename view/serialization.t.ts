/**
 * Типы для сериализации view
 * @module View.Serialization.Types
 */

import type { TemplateResult, CompiledTemplateResult, CompiledTemplate } from "../html/html.t"
import type { TemplatePart } from "../html/html.t"

/**
 * Сериализованный view
 */
export interface SerializedView {
  /** Скомпилированный шаблон */
  template: CompiledTemplate
  /** Значения для шаблона */
  values: unknown[]
  /** Метаданные для восстановления */
  metadata: {
    /** Тип view (html, svg, mathml) */
    type: number
    /** Версия сериализации */
    version: string
  }
}

/**
 * Контекст сериализации для восстановления директив
 */
export interface SerializationContext {
  /** Функции для восстановления директив */
  directives: {
    ref: any
    repeat: any
    when: any
    map: any
    styleMap: any
    choose: any
  }
  /** Утилиты для восстановления */
  utils: {
    html: any
    nothing: any
  }
}

/**
 * Маркер сериализованной директивы
 */
export interface SerializedDirective {
  /** Тип директивы */
  _$serializedDirective$: string
  /** Данные директивы */
  [key: string]: unknown
}

/**
 * Маркер функции для сериализации
 */
export interface FunctionMarker {
  /** Маркер функции */
  _$functionMarker$: true
  /** Имя функции */
  name: string
  /** Строковое представление функции */
  toString: string
}

/**
 * Сериализованный view в JSON формате
 */
export interface SerializedViewJSON {
  /** Скомпилированный шаблон */
  template: CompiledTemplate
  /** Сериализованные значения */
  values: (unknown | FunctionMarker)[]
  /** Метаданные для восстановления */
  metadata: {
    /** Тип view (html, svg, mathml) */
    type: number
    /** Версия сериализации */
    version: string
  }
}

/**
 * Конфигурация сериализации
 */
export interface SerializationConfig {
  /** Включить сериализацию директив */
  serializeDirectives?: boolean
  /** Включить сериализацию функций */
  serializeFunctions?: boolean
  /** Максимальная глубина сериализации */
  maxDepth?: number
  /** Исключить определенные типы значений */
  excludeTypes?: string[]
}
