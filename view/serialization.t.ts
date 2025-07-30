/**
 * Типы для сериализации view
 * @module View.Serialization.Types
 */

import type { CompiledTemplate } from "../html/html.t"
import type { Directive } from "../html/directive"
import type { ref } from "../html/directives/ref"
import type { repeat } from "../html/directives/repeat"
import type { when } from "../html/directives/when"
import type { map } from "../html/directives/map"
import type { styleMap } from "../html/directives/style-map"
import type { choose } from "../html/directives/choose"
import type { html, nothing } from "../html/html"

/**
 * Сериализованный view
 */
export interface SerializedView {
  /** Скомпилированный шаблон */
  template: CompiledTemplate
  /** Значения для шаблона */
  values: SerializedValue[]
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
    ref: typeof ref
    repeat: typeof repeat
    when: typeof when
    map: typeof map
    styleMap: typeof styleMap
    choose: typeof choose
  }
  /** Утилиты для восстановления */
  utils: {
    html: typeof html
    nothing: unknown
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
 * Сериализованное значение
 */
export type SerializedValue = unknown

/**
 * Сериализованный view в JSON формате
 */
export interface SerializedViewJSON {
  /** Скомпилированный шаблон */
  template: CompiledTemplate
  /** Сериализованные значения */
  values: (SerializedValue | FunctionMarker)[]
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

/**
 * Тип для проверки наличия свойства
 */
export type HasProperty<T, K extends string> = T extends { [P in K]: unknown } ? T : never

/**
 * Тип для проверки директивы
 */
export type DirectiveValue = {
  _$htmlDirective$: Directive & { name: string }
  values: unknown[]
}

/**
 * Тип для проверки, является ли значение директивой
 */
export type IsDirective<T> = T extends DirectiveValue ? true : false
