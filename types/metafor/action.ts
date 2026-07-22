import type { Fields, Values } from "./fields.ts"
import type { Energy, Mass, Self } from "./schema.ts"

/**
 * Параметры для action.
 */
export interface ActionParams<
  ɸ extends Fields,
  m extends Mass,
  v = Values<ɸ>,
  e extends Energy = Energy,
> {
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
  /** Живые runtime-сущности Energy */
  energy: e
  /** Сигнал остановки старого execution после структурного перестроения. */
  signal: AbortSignal
  /** Полный идентификатор атома */
  self: Self
}

/**
 * Результат анализа action/reaction-функции по полям контекста.
 */
export interface ActionFieldUsage {
  /** Поля, которые читаются из `value` */
  read: string[]
  /** Поля, которые записываются через `update(...)` */
  write: string[]
}

/**
 * Результат валидации структуры process-action функции.
 */
export interface ActionStructureValidationResult {
  valid: boolean
  error?: string
}
