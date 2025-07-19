/**
 * Тип StateTransitions — переходы только к ключам из T с условиями
 */
import type { TransitionConditions } from "./transition.t.ts"
import type { ContextSchema } from "../context/index.t.ts"

export type StateTransitions<T extends string, C extends ContextSchema = any> = {
  [K in T]?: TransitionConditions<C>
}

/**
 * Конфигурация одного состояния
 */
import type { UpdateValues, ExtractValues } from "../context/index.t.ts"

export type StateProcess<T extends ContextSchema = any, R = any> = {
  action: (params: { context: ExtractValues<T> }) => R
  error: (params: { update: (values: UpdateValues<ExtractValues<T>>) => ExtractValues<T> }) => void
  success?: (params: { update: (values: UpdateValues<ExtractValues<T>>) => ExtractValues<T>; data: R }) => void
}

export type StateDefinition<T extends string, C extends ContextSchema = any, R = any> = {
  process?: StateProcess<C, R>
  to: StateTransitions<T, C>
}

/**
 * Конфигурация всех состояний
 */
export type StateConfig<S extends string, C extends ContextSchema = any, R = any> = Record<S, StateDefinition<S, C, R>>
