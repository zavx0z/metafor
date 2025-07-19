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
  action: (params: { context: ExtractValues<T> }) => R | Promise<R>
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

/**
 * Интерфейс для экземпляра конечного автомата
 */
export interface MachineInstance<S extends string, C extends ContextSchema = any, R = any> {
  /** Текущее состояние автомата */
  readonly currentState: S
  /** Выполняется ли действие в текущем состоянии */
  readonly isExecuting: boolean
  /** Доступные переходы из текущего состояния */
  readonly availableTransitions: S[]
  /** Проверяет, возможен ли переход в указанное состояние */
  canTransitionTo: (targetState: S, context: ExtractValues<C>) => boolean
  /** Выполняет переход в указанное состояние */
  transitionTo: (targetState: S, context: ExtractValues<C>) => boolean
  /** Запускает процесс текущего состояния */
  execute: (context: ExtractValues<C>) => Promise<R | undefined>
}

/**
 * Функция для создания экземпляра конечного автомата
 */
export type CreateMachine = <S extends string, C extends ContextSchema = any, R = any>(
  config: StateConfig<S, C, R>,
  initialState: S
) => MachineInstance<S, C, R>
