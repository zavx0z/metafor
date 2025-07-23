/**
 * Модуль machine для создания конечных автоматов с типизированными состояниями
 * @packageDocumentation
 */

import type { StatesConfig } from "./index.t.ts"
import type { ActionsConfig } from "../actions/index.t.ts"
import type { ContextSchema, ExtractValues, UpdateValues } from "../context"
export type { StatesConfig as StateConfig }
/**
 * Класс конечного автомата с автоматическими переходами на основе контекста
 */
export class Machine<S extends string, C extends ContextSchema> {
  private _currentState: S
  private _isExecuting: boolean = false
  private config: StatesConfig<S, C>
  private actions: ActionsConfig<C, S>
  private updateSubscribers: ((prevState: S, nextState: S, process: boolean) => void)[] = []
  private updateFunction: (values: UpdateValues<ExtractValues<C>>) => Partial<ExtractValues<C>>

  constructor(
    config: StatesConfig<S, C>,
    actions: ActionsConfig<C, S>,
    initialState: S,
    updateFunction: (values: UpdateValues<ExtractValues<C>>) => Partial<ExtractValues<C>>
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
  private notifySubscribers(prevState: S, nextState: S, process: boolean): void {
    for (const subscriber of this.updateSubscribers) {
      subscriber(prevState, nextState, process)
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
  onUpdate(callback: (prevState: S, nextState: S, process: boolean) => void): () => void {
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
  async update(context: ExtractValues<C>): Promise<void> {
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
        if (this.checkTransitionConditions(conditions as any, context)) {
          // Выполняем переход

          // Если перешли в состояние с процессом, выполняем его
          if (this.actions[this._currentState]) {
            this.notifySubscribers(this._currentState, targetState as S, true)
            this._currentState = targetState as S
            this.executeAction(context).finally(() =>
              this.notifySubscribers(this._currentState, targetState as S, this._isExecuting)
            )
          } else {
            this._currentState = targetState as S
            this.notifySubscribers(this._currentState, targetState as S, this._isExecuting)
          }
          hasTransitioned = true

          // Если мы уже были в этом состоянии, это может быть цикл
          if (visitedStates.has(this._currentState)) {
            console.warn(`Обнаружен возможный цикл: повторное посещение состояния ${this._currentState}`)
            return
          }

          visitedStates.add(this._currentState)
          break
        }
      }
    }

    if (iteration >= maxIterations) {
      console.warn(`Машина достигла максимального количества итераций (${maxIterations}). Возможен бесконечный цикл.`)
    }
  }

  /**
   * Проверяет условия перехода
   */
  private checkTransitionConditions(conditions: any, context: Partial<ExtractValues<C>>): boolean {
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

  private _process: boolean = false
  private get process(): boolean {
    return this._process
  }
  private set process(value: boolean) {
    this._process = value
  }
  /**
   * Запускает процесс текущего состояния (внутренний метод)
   */
  private async executeAction(context: ExtractValues<C>): Promise<void> {
    if (this._isExecuting) {
      throw new Error(`Action уже выполняется в состоянии: ${this._currentState}`)
    }

    this._isExecuting = true
    this._process = true

    try {
      const process = this.actions[this._currentState]
      let result: any = undefined
      if (process && typeof process.action === "function") {
        result = await process.action({ context })
      }
      if (process && typeof process.success === "function") {
        process.success({ update: this.updateFunction, data: result })
      }
    } catch (error: any) {
      const actionObj = this.actions[this._currentState]
      if (actionObj && typeof actionObj.error === "function") {
        actionObj.error({ update: this.updateFunction, error })
      } else {
        throw new Error(`Обработчик ошибки не найден для состояния: ${this._currentState} \n ${error}`)
      }
    } finally {
      this._isExecuting = false
      this._process = false
    }
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
}
