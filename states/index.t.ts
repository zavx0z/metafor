/**
 * Типы для модуля states
 * @packageDocumentation
 */

import type { TransitionConditions } from "./transition.t.ts"
import type { ContextSchema, UpdateValues, ExtractValues } from "../context/index.t.ts"

/**
 * Тип StateTransitions — переходы только к ключам из T с условиями
 */
export type StateTransitions<T extends string, C extends ContextSchema = any> = {
  [K in T]?: TransitionConditions<C>
}

/**
 * Конфигурация процесса состояния
 */
export type StateProcess<T extends ContextSchema = any, R = any> = {
  action: (params: { context: ExtractValues<T> }) => R
  error: (params: { update: (values: UpdateValues<ExtractValues<T>>) => ExtractValues<T> }) => void
  success?: (params: { update: (values: UpdateValues<ExtractValues<T>>) => ExtractValues<T>; data: R }) => void
}

/**
 * Конфигурация одного состояния
 */
export type StateDefinition<T extends string, C extends ContextSchema = any, R = any> = {
  process?: StateProcess<C, R>
  to: StateTransitions<T, C>
}

/**
 * Конфигурация всех состояний
 */
export type StateConfig<S extends string, C extends ContextSchema = any, R = any> = Record<S, StateDefinition<S, C, R>>
