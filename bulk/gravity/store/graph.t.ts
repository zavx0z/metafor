/**
 * Типы для модуля graph.
 * @packageDocumentation
 */

/**
 * Строковое представление позиции в иерархии.
 * Формат: "0/1/2" где каждое число — индекс от корня.
 */
export type IndexPath = string

/**
 * Карта детей для каждого родителя.
 * Ключ: UUID родителя (или null для корня)
 * Значение: массив UUID детей в порядке orderKey
 */
export type ChildrenView = Map<string, string[]>
