import type {TriggerType} from "./trigger.ts"
import type {ContextDefinition} from "./context.ts"

/**
 * Переход к состоянию
 *
 * Используется для описания целевого состояния и условий триггера, необходимых для перехода.
 *
 * @interface CollapseTo
 * @template C - Тип данных контекста
 * @template S - Тип состояния
 * @property state - Целевое состояние
 * @property trigger - Условия триггера для перехода
 * @example
 * ```js
 * Atom("test").states("INITIAL", "ACTIVE").collapses([
 *   {
 *     from: "INITIAL",
 *     to: [{state: "ACTIVE", trigger: {status: "active"}}]
 *   }
 * ])
 * ```
 */
export type CollapseTo<C extends ContextDefinition, S> = {
  state: S
  trigger: TriggerType<C>
}

/**
 * Переход
 *
 * Описывает переход между состояниями, включая исходное состояние, действие, триггеры и целевые состояния.
 *
 * @interface Collapse
 * @template C - Тип данных контекста
 * @template S - Тип состояния
 * @property from - Исходное состояние
 * @property action - Действие, выполняемое при переходе
 * @property to - Массив целевых состояний с условиями триггеров
 * @example
 * ```js
 * Atom("test").states("INITIAL", "ACTIVE").collapses([
 *   {
 *     from: "INITIAL",
 *     action: "activate",
 *     to: [{state: "ACTIVE", trigger: {status: "active"}}]
 *   }
 * ])
 * ```
 */
export type Collapse<C extends ContextDefinition, S> = {
  from: S
  action?: string
  to: CollapseTo<C, S>[]
}

/**
 * Массив переходов
 *
 * Представляет собой массив объектов типа Collapse, описывающих все возможные переходы для атома.
 *
 * @type Collapses
 * @template C - Тип данных контекста
 * @template S - Тип состояния
 * @example
 * ```js
 * Atom("test").states("INITIAL", "ACTIVE").collapses([
 *   {
 *     from: "INITIAL",
 *     to: [{state: "ACTIVE", trigger: {status: "active"}}]
 *   }
 * ])
 * ```
 */
export type Collapses<C extends ContextDefinition, S> = Array<Collapse<C, S>>
