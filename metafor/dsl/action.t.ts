import type { Schema, Values } from "@zavx0z/context"
import type { Mass, Self } from "./metafor.t"

/**
 * Параметры для action.
 */
export type ActionParams<ɸ extends Schema, m extends Mass> = {
  /**
   * Декларация полей (схема, тип, валидатор).
   * Используется для валидации и доступа к типам полей.
   */
  field: ɸ
  /**
   * Текущие значения полей.
   */
  value: Values<ɸ>
  /** Масса */
  mass: m
  /** Полный идентификатор атома */
  self: Self
}

/**
 * Результат анализа action/reaction-функции по полям контекста.
 */
export type ActionFieldUsage = {
  /** Поля, которые читаются из `value` */
  read: string[]
  /** Поля, которые записываются через `update(...)` */
  write: string[]
}

/**
 * Результат валидации структуры process-action функции.
 */
export type ActionStructureValidationResult = {
  valid: boolean
  error?: string
}
