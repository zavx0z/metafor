/**
 * Реализация конечного автомата с типизированными состояниями
 * @packageDocumentation
 */

import type { StateConfig, MachineInstance, StateProcess, TransitionConditions } from "./index.t.ts"
import type { ContextSchema, ExtractValues, UpdateValues } from "../context/index.t.ts"

/**
 * Класс конечного автомата
 */
export class Machine<S extends string, C extends ContextSchema, R = any> implements MachineInstance<S, C, R> {
  private _currentState: S
  private _isExecuting: boolean = false
  private config: StateConfig<S, C, R>

  constructor(config: StateConfig<S, C, R>, initialState: S) {
    this.config = config
    this._currentState = initialState
  }

  /**
   * Текущее состояние автомата
   */
  get currentState(): S {
    return this._currentState
  }

  /**
   * Выполняется ли действие в текущем состоянии
   */
  get isExecuting(): boolean {
    return this._isExecuting
  }

  /**
   * Доступные переходы из текущего состояния
   */
  get availableTransitions(): S[] {
    const currentStateConfig = this.config[this._currentState]
    if (!currentStateConfig) return []

    return Object.keys(currentStateConfig.to) as S[]
  }

  /**
   * Проверяет условия перехода
   */
  private checkTransitionConditions(conditions: TransitionConditions<C>, context: ExtractValues<C>): boolean {
    for (const [field, condition] of Object.entries(conditions)) {
      const value = context[field as keyof ExtractValues<C>]

      if (!this.evaluateCondition(condition, value)) {
        return false
      }
    }
    return true
  }

  /**
   * Вычисляет результат условия для значения
   */
  private evaluateCondition(condition: any, value: any): boolean {
    // Простые значения
    if (typeof condition === "string" || typeof condition === "number" || typeof condition === "boolean") {
      return value === condition
    }

    // null
    if (condition === null) {
      return value === null
    }

    // RegExp
    if (condition instanceof RegExp) {
      return typeof value === "string" && condition.test(value)
    }

    // Объект с условиями
    if (typeof condition === "object" && condition !== null) {
      return this.evaluateComplexCondition(condition, value)
    }

    return false
  }

  /**
   * Вычисляет сложные условия
   */
  private evaluateComplexCondition(condition: any, value: any): boolean {
    // Проверка на null
    if ("null" in condition) {
      if (condition.null !== (value === null)) {
        return false
      }
    }

    // Строковые условия
    if (typeof value === "string") {
      if ("startsWith" in condition && !value.startsWith(condition.startsWith)) {
        return false
      }
      if ("endsWith" in condition && !value.endsWith(condition.endsWith)) {
        return false
      }
      if ("include" in condition && !value.includes(condition.include)) {
        return false
      }
      if ("notInclude" in condition && value.includes(condition.notInclude)) {
        return false
      }
      if ("pattern" in condition && !condition.pattern.test(value)) {
        return false
      }
      if ("length" in condition) {
        const length = condition.length
        if (typeof length === "number" && value.length !== length) {
          return false
        }
        if (typeof length === "object") {
          if (length.min !== undefined && value.length < length.min) {
            return false
          }
          if (length.max !== undefined && value.length > length.max) {
            return false
          }
        }
      }
    }

    // Числовые условия
    if (typeof value === "number") {
      if ("eq" in condition && value !== condition.eq) {
        return false
      }
      if ("gt" in condition && value <= condition.gt) {
        return false
      }
      if ("gte" in condition && value < condition.gte) {
        return false
      }
      if ("lt" in condition && value >= condition.lt) {
        return false
      }
      if ("lte" in condition && value > condition.lte) {
        return false
      }
      if ("between" in condition) {
        const [min, max] = condition.between
        if (value < min || value > max) {
          return false
        }
      }
    }

    // Булевы условия
    if (typeof value === "boolean") {
      if ("eq" in condition && value !== condition.eq) {
        return false
      }
      if ("logicalEq" in condition && !!value !== condition.logicalEq) {
        return false
      }
    }

    // Массивы
    if (Array.isArray(value)) {
      if ("length" in condition) {
        const length = condition.length
        if (typeof length === "number" && value.length !== length) {
          return false
        }
        if (typeof length === "object") {
          if (length.min !== undefined && value.length < length.min) {
            return false
          }
          if (length.max !== undefined && value.length > length.max) {
            return false
          }
        }
      }
      if ("includes" in condition && !value.includes(condition.includes)) {
        return false
      }
      if ("notIncludes" in condition && value.includes(condition.notIncludes)) {
        return false
      }
      if ("isEmpty" in condition && (value.length === 0) !== condition.isEmpty) {
        return false
      }
      if ("every" in condition && !value.every(condition.every)) {
        return false
      }
      if ("some" in condition && !value.some(condition.some)) {
        return false
      }
    }

    return true
  }

  /**
   * Проверяет, возможен ли переход в указанное состояние
   */
  canTransitionTo(targetState: S, context: ExtractValues<C>): boolean {
    const currentStateConfig = this.config[this._currentState]
    if (!currentStateConfig) return false

    const transitionConditions = currentStateConfig.to[targetState]
    if (!transitionConditions) return false

    return this.checkTransitionConditions(transitionConditions, context)
  }

  /**
   * Выполняет переход в указанное состояние
   */
  transitionTo(targetState: S, context: ExtractValues<C>): boolean {
    if (!this.canTransitionTo(targetState, context)) {
      return false
    }

    this._currentState = targetState
    return true
  }

  /**
   * Запускает процесс текущего состояния
   */
  async execute(context: ExtractValues<C>): Promise<R | undefined> {
    const currentStateConfig = this.config[this._currentState]
    if (!currentStateConfig?.process) {
      return undefined
    }

    if (this._isExecuting) {
      throw new Error(`Процесс уже выполняется в состоянии: ${this._currentState}`)
    }

    this._isExecuting = true

    try {
      const process = currentStateConfig.process!
      const result = await process.action({ context })

      // Если есть success обработчик, вызываем его
      if (process.success) {
        // Создаем функцию update для обновления контекста
        const update = (values: UpdateValues<ExtractValues<C>>) => {
          // В реальной реализации здесь будет обновление контекста
          // Пока просто возвращаем обновленный контекст
          return { ...context, ...values } as ExtractValues<C>
        }

        process.success({ update, data: result })
      }

      return result
    } catch (error) {
      // Если есть error обработчик, вызываем его
      const process = currentStateConfig.process!
      if (process.error) {
        const update = (values: UpdateValues<ExtractValues<C>>) => {
          return { ...context, ...values } as ExtractValues<C>
        }

        process.error({ update })
      }

      throw error
    } finally {
      this._isExecuting = false
    }
  }
}
