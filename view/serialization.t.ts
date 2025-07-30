/**
 * Типы для сериализации view
 * @module View.Serialization.Types
 */

import type { TemplateResult, CompiledTemplateResult } from "../html/html.t"
import type { ref } from "../html/directives/ref"
import type { repeat } from "../html/directives/repeat"
import type { when } from "../html/directives/when"
import type { map } from "../html/directives/map"
import type { styleMap } from "../html/directives/style-map"
import type { choose } from "../html/directives/choose"
import type { html } from "../html/html"

/**
 * Сериализованное представление view
 */
export interface SerializedView {
  /** Шаблон с частями */
  template: {
    h: string[]
    parts: Array<{
      type: number
      index: number
    }>
  }
  /** Значения для подстановки */
  values: SerializedValue[]
  /** Метаданные */
  metadata: {
    version: string
    timestamp: number
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
  /** Метаданные для восстановления параметров view */
  meta: {
    update: (values: any) => any
    context: any
    core: any
    state: any
  }
}

/**
 * Сериализованная директива
 */
export interface SerializedDirective {
  type: "directive"
  name: string
  value: unknown
}

/**
 * Маркер функции для JSON сериализации
 */
export interface FunctionMarker {
  type: "function"
  name: string
  toString: string
}

/**
 * Сериализованное значение
 */
export type SerializedValue = unknown

/**
 * JSON структура для сериализации
 */
export interface SerializedViewJSON {
  template: {
    h: string[]
    parts: Array<{
      type: number
      index: number
    }>
  }
  values: SerializedValue[]
  metadata: {
    version: string
    timestamp: number
  }
}

/**
 * Конфигурация сериализации
 */
export interface SerializationConfig {
  /** Версия сериализации */
  version?: string
  /** Включить метаданные */
  includeMetadata?: boolean
}

/**
 * Параметры view для сериализации
 */
export interface ViewParams {
  update: (values: any) => any
  context: any
  core: any
  state: any
}

/**
 * Восстановленные параметры view
 */
export interface RestoredViewParams {
  update: (values: any) => any
  context: any
  core: any
  state: any
}

/**
 * Типы для строгой типизации директив
 */
export type DirectiveValue = typeof ref | typeof repeat | typeof when | typeof map | typeof styleMap | typeof choose

export type HasProperty<T, K extends string> = T extends { [P in K]: any } ? T : never

export type IsDirective<T> = T extends DirectiveValue ? true : false
