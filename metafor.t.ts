import type { ContextSchema, ExtractValues, SerializedSchema } from "./context"

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
 * Конфигурация для view
 */
export interface ViewConfig<C extends ContextSchema> {
  /** Шаблонизатор */
  render?: (params: { context: ExtractValues<C>; html: typeof html }) => TemplateResult
  /**  монтирования */
  onMount?: (...args: unknown[]) => unknown
  /**  уничтожения */
  onDestroy?: (...args: unknown[]) => unknown
  /** Стили */
  style?: ({ css }: { css: (strings: TemplateStringsArray, ...values: any[]) => CSSStyleSheet }) => void
}
