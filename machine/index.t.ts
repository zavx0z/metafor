/**
 * Типы для модуля machine
 * @packageDocumentation
 */

import type { TransitionConditions } from "./transition.t.ts"
import type { ContextSchema, UpdateValues, ExtractValues } from "../context/index.t.ts"

// Экспортируем типы из transition.t.ts
export type { TransitionConditions } from "./transition.t.ts"

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
  action: (params: { context: Partial<ExtractValues<T>> }) => R | Promise<R>
  error: (params: { update: (values: UpdateValues<ExtractValues<T>>) => void }) => void
  success?: (params: { update: (values: UpdateValues<ExtractValues<T>>) => void; data: R }) => void
}

/**
 * Функция обновления контекста
 */
export type UpdateFunction<T extends ContextSchema = any> = (
  values: UpdateValues<ExtractValues<T>>
) => Partial<ExtractValues<T>>

/**
 * Конфигурация одного состояния
 */
export type StateDefinition<T extends string, C extends ContextSchema = any> = {
  to: StateTransitions<T, C>
}

/**
 * Конфигурация всех состояний
 */
export type StateConfig<S extends string, C extends ContextSchema = any> = Record<S, StateDefinition<S, C>>

/**
 * Интерфейс для экземпляра конечного автомата
 */
export interface MachineInstance<S extends string, C extends ContextSchema = any, R = any> {
  /** Текущее состояние автомата */
  readonly currentState: S
  /** Выполняется ли действие в текущем состоянии */
  readonly isExecuting: boolean
  /** Обновляет контекст и выполняет автоматические переходы */
  update: (context: ExtractValues<C>) => Promise<R | undefined>
  /** Подписка на обновления состояния автомата */
  onUpdate: (callback: (patches: Array<{ op: "test" | "replace"; path: "/state"; value: S }>) => void) => () => void
}

/**
 * Функция для создания экземпляра конечного автомата
 */
export type CreateMachine = <S extends string, C extends ContextSchema = any>(
  config: StateConfig<S, C>,
  initialState: S
) => MachineInstance<S, C>

// Новый тип для карты действий
export type ActionsConfig<S extends string, C extends ContextSchema = any> = Partial<Record<S, any>>
