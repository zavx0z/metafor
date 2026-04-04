/**
 * Типы для runtime-модуля исполнения действий процессов.
 *
 * @packageDocumentation
 */

import type { Self } from "index.ts"

/**
 * Параметры для выполнения действия.
 *
 * @template ɸ - Тип схемы полей атома
 * @template m - Тип массы атома
 */
export interface ExecuteParams {
  /** Функция действия */
  action: Function
  /** Контекст self */
  self?: Self
  /** Декларация полей (схема) */
  field?: Record<string, any>
  /** Значения полей атома */
  value?: Record<string, any>
  /** Масса атома */
  mass?: Record<string, any>
}
