import type { ContextSchema, ExtractValues, SerializedSchema, Update } from "./context"

import type { StatesConfig } from "./transition.t.ts"
import type { TemplateResult } from "./html/html.t.ts"
import type { html } from "./html/html.ts"

/**
 * @template C - схема контекста автомата
 * @template S - строковые ключи состояний
 */
export interface Snapshot<C extends ContextSchema, S extends string> {
  state: S
  states: StatesConfig<S, C>
  context: ExtractValues<C>
  schema: SerializedSchema<C>
  // actions: ActionsConfig<C, S>
}


/**
 Параметры функции рендеринга представления актора

 @template C - Тип контекста актора
 @template S - Тип состояний актора

 @property update - Функция обновления контекста актора
 @property context - Текущие данные контекста актора
 @property state - Текущее состояние актора
 @property html - Функция шаблонизации HTML с поддержкой lit-html
 @property ref - Директива для создания ссылок на DOM элементы
 */
 type ViewDefinitionParams<C extends ContextSchema, S extends string> = {
  update: Update<C>
  context: ExtractValues<C>
  state: S
  html: typeof html
  ref: typeof ref
}

/**
 * Конфигурация для view
 */
export interface ViewConfig<C extends ContextSchema, S extends string> {
  /** Шаблонизатор */
  render?: (params: ViewDefinitionParams<C, S>) => TemplateResult
  /**  монтирования */
  onMount?: (...args: unknown[]) => unknown
  /**  уничтожения */
  onDestroy?: (...args: unknown[]) => unknown
  /** Стили */
  style?: ({ css }: { css: (strings: TemplateStringsArray, ...values: any[]) => CSSStyleSheet }) => void
}

import { MetaFor as FrameWork } from "./metafor"
import type { ref } from "./html/directives/ref.ts"

declare global {
  interface Window {
    MetaFor: typeof FrameWork
    debugMetaFor: boolean
  }
  var debugMetaFor: boolean
  var htmlIssuedWarnings: Set<string>
  var MetaFor: typeof FrameWork
  var htmlPolyfillSupport: ((Template: any, ChildPart: any) => void) | undefined
  var htmlPolyfillSupportDevMode: ((Template: any, ChildPart: any) => void) | undefined
  var htmlVersions: string[]
  var emitHtmlDebugLogEvents: boolean
}
export {}
