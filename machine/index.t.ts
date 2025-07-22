/**
 * Типы для модуля machine
 * @packageDocumentation
 */

import type { TransitionConditions } from "./transition.t.ts"
import type { ContextSchema, ExtractValues, UpdateValues } from "../context"

// Экспортируем типы из transition.t.ts
export type { TransitionConditions } from "./transition.t.ts"

/**
 * Тип StateTransitions — переходы только к ключам из T с условиями
 */
export type StateTransitions<T extends string, C extends ContextSchema> = {
  [K in T]?: TransitionConditions<C>
}

/**
 * Конфигурация одного состояния — теперь это просто карта переходов
 */
export type StateDefinition<T extends string, C extends ContextSchema> = StateTransitions<T, C>

/**
 * Конфигурация всех состояний — карта переходов для каждого состояния
 */
export type StateConfig<S extends string, C extends ContextSchema> = Record<S, StateDefinition<S, C>>

export type ActionsConfig<C extends ContextSchema = any, Res = any> = Partial<
  Record<
    string,
    {
      action: (params: { context: ExtractValues<C> }) => Res | Promise<Res>
      success?: (params: { update: (values: UpdateValues<ExtractValues<C>>) => void; data: Res }) => void
      error?: (params: { update: (values: UpdateValues<ExtractValues<C>>) => void; error: Error }) => void
    }
  >
>
