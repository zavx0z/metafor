import type {TriggerType} from "./trigger.ts"
import type {ContextDefinition} from "./context.ts"

/**
 * Переход к состоянию
 *
 * Используется для описания целевого состояния и условий триггера, необходимых для перехода.
 *
 * @interface TransitionTo
 * @template C - Тип данных контекста
 * @template S - Тип состояния
 * @property state - Целевое состояние
 * @property trigger - Условия триггера для перехода
 */
export type TransitionTo<C extends ContextDefinition, S> = {
  state: S
  trigger: TriggerType<C>
}

/**
 * Переход
 *
 * Описывает переход между состояниями, включая исходное состояние, действие, триггеры и целевые состояния.
 *
 * @interface Transition
 * @template C - Тип данных контекста
 * @template S - Тип состояния
 * @property from - Исходное состояние
 * @property action - Действие, выполняемое при переходе
 * @property to - Массив целевых состояний с условиями триггеров
 */
export type Transition<C extends ContextDefinition, S> = {
  from: S
  action?: string
  to: TransitionTo<C, S>[]
}

/**
 * Массив переходов
 *
 * Представляет собой массив объектов типа Transition, описывающих все возможные переходы для частицы.
 *
 * @type Transitions
 * @template C - Тип данных контекста
 * @template S - Тип состояния
 */
export type Transitions<C extends ContextDefinition, S> = Array<Transition<C, S>>
Ï