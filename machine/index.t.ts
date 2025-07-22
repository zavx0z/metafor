/**
 * Типы для модуля machine
 * @packageDocumentation
 */

import type { TransitionConditions } from "./transition.t.ts"
import type { ContextSchema, UpdateValues, ExtractValues } from "../context"

// Экспортируем типы из transition.t.ts
export type { TransitionConditions } from "./transition.t.ts"

/**
 * Тип StateTransitions — переходы только к ключам из T с условиями
 */
export type StateTransitions<T extends string, C extends ContextSchema> = {
  [K in T]?: TransitionConditions<C>
}

/**
 * Конфигурация процесса состояния
 */
export type StateProcess<T extends ContextSchema, R = any> = {
  action: (params: { context: Partial<ExtractValues<T>> }) => R | Promise<R>
  error: (params: { update: (values: UpdateValues<ExtractValues<T>>) => void }) => void
  success?: (params: { update: (values: UpdateValues<ExtractValues<T>>) => void; data: R }) => void
}

/**
 * Конфигурация одного состояния — теперь это просто карта переходов
 */
export type StateDefinition<T extends string, C extends ContextSchema> = StateTransitions<T, C>

/**
 * Конфигурация всех состояний — карта переходов для каждого состояния
 */
export type StateConfig<S extends string, C extends ContextSchema> = Record<S, StateDefinition<S, C>>

/**
 * Интерфейс для экземпляра конечного автомата
 */
export interface MachineInstance<S extends string, C extends ContextSchema, R = any> {
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
export type CreateMachine = <S extends string, C extends ContextSchema>(
  config: StateConfig<S, C>,
  initialState: S
) => MachineInstance<S, C>

export type ActionsConfig = Record<
  string,
  {
    action: (params: { context: any }) => any
    success?: (params: { update: any; data: any }) => void
    error?: (params: { update: any; error: any }) => void
  }
>
