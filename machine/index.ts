/**
 * Модуль machine для создания конечных автоматов с типизированными состояниями
 * @packageDocumentation
 */

import type { StateConfig, ActionsConfig } from "./index.t.ts"
import type { ContextSchema } from "../context"

/**
 * Класс конечного автомата с автоматическими переходами на основе контекста
 */
export class Machine<S extends string, C extends ContextSchema, R = any> {
  private _currentState: S
  private _isExecuting: boolean = false
  private config: StateConfig<S, C>
  private actions: ActionsConfig
  private updateSubscribers: Array<(patches: Array<{ op: "test" | "replace"; path: "/state"; value: S }>) => void> = []
  private updateFunction: (values: any) => any

  constructor(
    config: StateConfig<S, C>,
    actions: ActionsConfig,
    initialState: S,
    updateFunction: (values: any) => any
  ) {
    this.config = config
    this.actions = actions
    this._currentState = initialState
    this.updateFunction = updateFunction
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
   * Уведомляет подписчиков об изменении состояния
   */
  private notifySubscribers(patches: Array<{ op: "test" | "replace"; path: "/state"; value: S }>): void {
    for (const subscriber of this.updateSubscribers) {
      subscriber(patches)
    }
  }

  /**
   * Подписка на обновления состояния автомата.
   * Позволяет получать уведомления о каждом изменении состояния в формате JSON Patch.
   * Возвращает функцию для отписки.
   *
   * @param callback - функция, вызываемая при изменении состояния
   * @returns функция для отписки
   *
   * @example
   * const unsubscribe = machine.onUpdate((patches) => {
   *   console.log('Патчи состояния:', patches)
   * })
   * // ...
   * unsubscribe() // для отписки
   */
  onUpdate(callback: (patches: Array<{ op: "test" | "replace"; path: "/state"; value: S }>) => void): () => void {
    this.updateSubscribers.push(callback)
    return () => {
      const idx = this.updateSubscribers.indexOf(callback)
      if (idx !== -1) this.updateSubscribers.splice(idx, 1)
    }
  }

  /**
   * Обновляет контекст и выполняет автоматические переходы
   * Возвращает результат выполнения процесса, если он был запущен
   */
  async update(context: any): Promise<R | undefined> {
    let result: R | undefined = undefined
    let currentContext = { ...context }
    let hasTransitioned = true
    let maxIterations = 100 // Защита от бесконечных циклов
    let iteration = 0
    let visitedStates = new Set<S>()

    // Выполняем переходы пока есть возможность
    while (hasTransitioned && iteration < maxIterations) {
      hasTransitioned = false
      iteration++

      // Проверяем все возможные переходы из текущего состояния
      const currentStateConfig = this.config[this._currentState]
      if (!currentStateConfig) break

      for (const [targetState, conditions] of Object.entries(currentStateConfig)) {
        if (this.checkTransitionConditions(conditions as any, currentContext)) {
          // Выполняем переход
          this._currentState = targetState as S
          hasTransitioned = true

          // Уведомляем подписчиков об изменении состояния
          const patches: Array<{ op: "test" | "replace"; path: "/state"; value: S }> = []

          // Определяем тип операции на основе наличия процесса
          if (this.actions[this._currentState]) {
            // Если есть процесс - это test операция
            patches.push({ op: "test", path: "/state", value: this._currentState })
          } else {
            // Если нет процесса - это replace операция
            patches.push({ op: "replace", path: "/state", value: this._currentState })
          }

          this.notifySubscribers(patches)

          // Если мы уже были в этом состоянии, это может быть цикл
          if (visitedStates.has(this._currentState)) {
            console.warn(`Обнаружен возможный цикл: повторное посещение состояния ${this._currentState}`)
            return result
          }

          visitedStates.add(this._currentState)
          break
        }
      }

      // Если перешли в состояние с процессом, выполняем его
      if (this.actions[this._currentState] && !this._isExecuting) {
        result = await this.executeAction(currentContext)
      }
    }

    if (iteration >= maxIterations) {
      console.warn(`Машина достигла максимального количества итераций (${maxIterations}). Возможен бесконечный цикл.`)
    }

    return result
  }

  /**
   * Проверяет условия перехода
   */
  private checkTransitionConditions(conditions: any, context: any): boolean {
    for (const [field, condition] of Object.entries(conditions)) {
      const value = context[field]
      if (field === "status") {
      }
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
      if ("eq" in condition && value !== condition.eq) {
        return false
      }
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
      if ("every" in condition) {
        const everyCondition = condition.every
        if (!value.every((item: any) => this.evaluateArrayItemCondition(everyCondition, item))) {
          return false
        }
      }
      if ("some" in condition) {
        const someCondition = condition.some
        if (!value.some((item: any) => this.evaluateArrayItemCondition(someCondition, item))) {
          return false
        }
      }
    }

    return true
  }

  /**
   * Вычисляет условие для элемента массива
   */
  private evaluateArrayItemCondition(condition: any, item: any): boolean {
    // Числовые элементы
    if (typeof item === "number") {
      if ("gt" in condition && item <= condition.gt) {
        return false
      }
      if ("gte" in condition && item < condition.gte) {
        return false
      }
      if ("lt" in condition && item >= condition.lt) {
        return false
      }
      if ("lte" in condition && item > condition.lte) {
        return false
      }
      if ("eq" in condition && item !== condition.eq) {
        return false
      }
    }

    // Строковые элементы
    if (typeof item === "string") {
      if ("include" in condition && !item.includes(condition.include)) {
        return false
      }
      if ("startsWith" in condition && !item.startsWith(condition.startsWith)) {
        return false
      }
      if ("endsWith" in condition && !item.endsWith(condition.endsWith)) {
        return false
      }
      if ("pattern" in condition && !condition.pattern.test(item)) {
        return false
      }
    }

    return true
  }

  /**
   * Запускает процесс текущего состояния (внутренний метод)
   */
  private async executeAction(context: any): Promise<R | undefined> {
    if (this._isExecuting) {
      throw new Error(`Action уже выполняется в состоянии: ${this._currentState}`)
    }

    this._isExecuting = true

    try {
      const actionObj = this.actions[this._currentState]
      let result: any = undefined
      if (actionObj && typeof actionObj.action === "function") {
        result = await actionObj.action({ context })
      }
      if (actionObj && typeof actionObj.success === "function") {
        actionObj.success({ update: this.updateFunction, data: result })
      }
      return result
    } catch (error: any) {
      const actionObj = this.actions[this._currentState]
      if (actionObj && typeof actionObj.error === "function") {
        actionObj.error({ update: this.updateFunction, error })
      }
      throw error
    } finally {
      this._isExecuting = false
    }
  }
}
