import type { Fields, Values } from "./fields.t"
import type { Mass, Self } from "./metafor.t"

/**
 * Параметры для action.
 */
export type ActionParams<ɸ extends Fields, m extends Mass, v = Values<ɸ>> = {
  /**
   * Декларация полей (схема, тип, валидатор).
   * Используется для валидации и доступа к типам полей.
   */
  field: ɸ
  /**
   * Текущие значения полей.
   */
  value: v
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
