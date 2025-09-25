/**
 * Типы для парсинга процессов
 * @module Processes
 */

import type { Schema } from "@zavx0z/context"
import type { Core } from "../core/index.t"
import type { ProcessChain, ActionChain } from "../core/proc/index.t"

/**
 * Обработчик действия процесса.
 * Содержит функцию и список полей контекста, которые читаются.
 */
type ParsedActionHandler = {
  /** Список полей контекста, которые читаются в обработчике */
  read?: string[]
  /** Строковое представление функции action для десериализации */
  src: string
}

/**
 * Обработчик успеха или ошибки процесса.
 * Содержит функцию, список полей для чтения и записи.
 */
type ParsedHandler = {
  /** Список полей контекста, которые читаются в обработчике */
  read?: string[]
  /** Список полей контекста, которые записываются в обработчике */
  write?: string[]
  /** Строковое представление функции для десериализации */
  src: string
}

/**
 * Распарсенный процесс с обработчиками.
 * Содержит обработчики для действия, успеха и ошибки.
 */
export type ParsedProcess = {
  /** Название процесса */
  title?: string
  /** Описание процесса */
  description?: string
  /** Обработчик основного действия процесса */
  action?: ParsedActionHandler
  /** Обработчик успешного завершения процесса */
  success?: ParsedHandler
  /** Обработчик ошибки процесса */
  error?: ParsedHandler
}

/**
 * Схема процессов
 * @description
 * Объект с распарсенными процессами
 */
export type ProcessesSchema = Record<string, ParsedProcess> /**

 * Тип билдера для декларации набора процессов автомата.
 *
 * Позволяет создавать типизированные процессы с удобным API.
 *
 * @template C - схема контекста автомата
 * @template S - строковые ключи состояний/процессов
 * @param process - фабрика для создания цепочки ProcessChain
 * @returns объект, где ключи — имена процессов, а значения — цепочки ActionChain
 *
 * @includeExample ./proc/test/actions.basic.spec.ts
 * @includeExample ./proc/test/actions.types.spec.ts
 */
export type ProcessesDeclaration<C extends Schema, S extends string, I extends Core> = (
  process: (config?: ProcessConfig) => ProcessChain<C, I>
) => Partial<Record<S, ActionChain<C, I, any>>>

export type ProcessConfig = {
  /** Название*/
  title?: string
  /** Описание */
  description?: string
}
