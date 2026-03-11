/**
 * Модуль управления иерархией акторов.
 * @packageDocumentation
 *
 * Отвечает за управление древовидной структурой через childrenView и indexPath.
 * Поддерживает корневой уровень через специальный ключ "__ROOT__".
 *
 * ## Структуры данных
 *
 * - childrenView: Map<parentUuid, childUuids[]> — карта детей для каждого родителя
 * - indexPaths: Map<uuid, indexPath> — карта индекс-путей для навигации
 */

import type { IndexPath, ChildrenView } from "./graph.t"
import type { OrderKey } from "./order.t"
import { compare } from "./order"

// Специальный ключ для корневого уровня
const ROOT_KEY = "__ROOT__"

// Состояние модуля
let childrenView: ChildrenView = new Map()
let indexPaths: Map<string, IndexPath> = new Map()
let orderKeys: Map<string, OrderKey> = new Map()

/**
 * Добавляет актора в конец списка детей.
 *
 * @param parentUuid - UUID родителя (null для корневого уровня)
 * @param childUuid - UUID дочернего актора
 *
 * @example
 * ```typescript
 * appendChild(null, "uuid-1")  // корневой актор
 * appendChild("uuid-1", "uuid-2")  // дочерний актор
 * ```
 */
export function appendChild(parentUuid: string | null, childUuid: string): void {
  const parentKey = parentUuid ?? ROOT_KEY

  const children = childrenView.get(parentKey) || []
  children.push(childUuid)
  childrenView.set(parentKey, children)

  // Вычисляем indexPath для нового ребёнка
  const indexPath = computeIndexPath(parentUuid, childUuid)
  indexPaths.set(childUuid, indexPath)
}

/**
 * Вставляет актора перед указанным sibling.
 *
 * @param parentUuid - UUID родителя (null для корневого уровня)
 * @param newChildUuid - UUID вставляемого актора
 * @param referenceChildUuid - UUID sibling, перед которым вставляем
 *
 * @example
 * ```typescript
 * // Вставить "uuid-3" перед "uuid-2"
 * insertBefore(null, "uuid-3", "uuid-2")
 * ```
 */
export function insertBefore(
  parentUuid: string | null,
  newChildUuid: string,
  referenceChildUuid: string
): void {
  const parentKey = parentUuid ?? ROOT_KEY
  const children = childrenView.get(parentKey) || []

  const refIndex = children.indexOf(referenceChildUuid)
  if (refIndex === -1) {
    throw new Error(`Reference child ${referenceChildUuid} not found`)
  }

  children.splice(refIndex, 0, newChildUuid)
  childrenView.set(parentKey, children)

  // Вычисляем indexPath для нового ребёнка
  const indexPath = computeIndexPath(parentUuid, newChildUuid)
  indexPaths.set(newChildUuid, indexPath)
}

/**
 * Удаляет актора из иерархии (без потомков).
 *
 * @param parentUuid - UUID родителя (null для корневого уровня)
 * @param childUuid - UUID дочернего актора
 *
 * @example
 * ```typescript
 * removeChild(null, "uuid-1")  // удалить корневого (дети остаются)
 * removeChild("uuid-1", "uuid-2")  // удалить дочернего
 * ```
 */
export function removeChild(parentUuid: string | null, childUuid: string): void {
  const parentKey = parentUuid ?? ROOT_KEY
  const children = childrenView.get(parentKey)

  if (!children) {
    return
  }

  const index = children.indexOf(childUuid)
  if (index !== -1) {
    children.splice(index, 1)
    childrenView.set(parentKey, children)
  }

  // Удаляем indexPath
  indexPaths.delete(childUuid)
}

/**
 * Заменяет одного актора на другого.
 *
 * @param parentUuid - UUID родителя (null для корневого уровня)
 * @param newChildUuid - UUID нового актора
 * @param oldChildUuid - UUID заменяемого актора
 *
 * @example
 * ```typescript
 * replaceChild(null, "uuid-new", "uuid-old")  // заменить корневой
 * ```
 */
export function replaceChild(
  parentUuid: string | null,
  newChildUuid: string,
  oldChildUuid: string
): void {
  const parentKey = parentUuid ?? ROOT_KEY
  const children = childrenView.get(parentKey)

  if (!children) {
    return
  }

  const index = children.indexOf(oldChildUuid)
  if (index !== -1) {
    children[index] = newChildUuid
    childrenView.set(parentKey, children)

    // Переносим indexPath
    const oldPath = indexPaths.get(oldChildUuid)
    if (oldPath) {
      indexPaths.delete(oldChildUuid)
      indexPaths.set(newChildUuid, oldPath)
    }
  }
}

/**
 * Перемещает актора к новому родителю.
 *
 * @param childUuid - UUID перемещаемого актора
 * @param newParentUuid - UUID нового родителя (null для корня)
 *
 * @example
 * ```typescript
 * moveChild("uuid-123", null)  // в корень
 * moveChild("uuid-123", "uuid-456")  // к родителю
 * ```
 */
export function moveChild(
  childUuid: string,
  newParentUuid: string | null
): void {
  // Находим текущего родителя
  let oldParentKey: string | null = null
  for (const [parentKey, children] of childrenView.entries()) {
    if (children.includes(childUuid)) {
      oldParentKey = parentKey
      break
    }
  }

  if (!oldParentKey) {
    return
  }

  // Удаляем из старого родителя
  const oldChildren = childrenView.get(oldParentKey)!
  const index = oldChildren.indexOf(childUuid)
  if (index !== -1) {
    oldChildren.splice(index, 1)
    childrenView.set(oldParentKey, oldChildren)
  }

  // Добавляем к новому родителю
  const newParentKey = newParentUuid ?? ROOT_KEY
  const newChildren = childrenView.get(newParentKey) || []
  newChildren.push(childUuid)
  childrenView.set(newParentKey, newChildren)

  // Пересчитываем indexPath
  const indexPath = computeIndexPath(newParentUuid, childUuid)
  indexPaths.set(childUuid, indexPath)
}

/**
 * Удаляет актора и всех потомков.
 *
 * @param parentUuid - UUID родителя (null для корневого уровня)
 * @param childUuid - UUID дочернего актора
 *
 * @example
 * ```typescript
 * removeChildWithDescendants(null, "uuid-1")  // удалить корень + все потомки
 * ```
 */
export function removeChildWithDescendants(
  parentUuid: string | null,
  childUuid: string
): void {
  // Рекурсивно удаляем всех потомков
  const children = getChildren(childUuid)
  for (const grandchild of children) {
    removeChildWithDescendants(childUuid, grandchild)
  }

  // Удаляем самого актора
  removeChild(parentUuid, childUuid)
}

/**
 * Проверяет наличие детей.
 *
 * @param parentUuid - UUID родителя
 * @returns true если есть дети
 *
 * @example
 * ```typescript
 * hasChildren("uuid-1")  // true/false
 * ```
 */
export function hasChildren(parentUuid: string): boolean {
  const children = childrenView.get(parentUuid)
  return children ? children.length > 0 : false
}

/**
 * Получает детей актора.
 *
 * @param parentUuid - UUID родителя
 * @returns массив UUID детей в порядке orderKey
 *
 * @example
 * ```typescript
 * getChildren("uuid-1")  // ["uuid-2", "uuid-3"]
 * ```
 */
export function getChildren(parentUuid: string): string[] {
  const children = childrenView.get(parentUuid) || []

  // Сортируем по orderKey
  return [...children].sort((a, b) => {
    const keyA = orderKeys.get(a)
    const keyB = orderKeys.get(b)

    if (!keyA || !keyB) {
      return 0
    }

    return compare(keyA, keyB)
  })
}

/**
 * Получает корневые акторы.
 *
 * @returns массив UUID корневых акторов
 *
 * @example
 * ```typescript
 * getRoots()  // ["uuid-1", "uuid-4"]
 * ```
 */
export function getRoots(): string[] {
  return getChildren(ROOT_KEY)
}

/**
 * Получает индекс-путь актора.
 *
 * @param uuid - UUID актора
 * @returns indexPath строка "0/1/2" или undefined если не найден
 *
 * @example
 * ```typescript
 * getIndexPathByUuid("uuid-3")  // "0/1/2"
 * ```
 */
export function getIndexPathByUuid(uuid: string): IndexPath | undefined {
  return indexPaths.get(uuid)
}

/**
 * Получает uuid по индекс-пути.
 *
 * @param indexPath - путь "0/1/2"
 * @returns uuid актора или undefined если не найден
 *
 * @example
 * ```typescript
 * getUuidByIndexPath("0/1/2")  // "uuid-3"
 * ```
 */
export function getUuidByIndexPath(indexPath: IndexPath): string | undefined {
  for (const [uuid, path] of indexPaths.entries()) {
    if (path === indexPath) {
      return uuid
    }
  }
  return undefined
}

/**
 * Вычисляет индекс-путь для нового актора.
 *
 * @param parentUuid - UUID родителя (null для корневого уровня)
 * @param childUuid - UUID дочернего актора
 * @returns indexPath строка "0/1/2"
 *
 * @example
 * ```typescript
 * computeIndexPath(null, "uuid-1")  // "0"
 * computeIndexPath("uuid-1", "uuid-2")  // "0/0"
 * ```
 */
export function computeIndexPath(
  parentUuid: string | null,
  childUuid: string
): IndexPath {
  const parentKey = parentUuid ?? ROOT_KEY
  const children = childrenView.get(parentKey) || []

  // Находим индекс ребёнка в списке (без учёта orderKey, просто позиция в массиве)
  const index = children.indexOf(childUuid)
  const childIndex = index !== -1 ? index : children.length

  if (parentUuid === null) {
    return `${childIndex}`
  }

  const parentPath = indexPaths.get(parentUuid)
  if (!parentPath) {
    return `${childIndex}`
  }

  return `${parentPath}/${childIndex}`
}

/**
 * Устанавливает orderKey для актора.
 *
 * @param uuid - UUID актора
 * @param key - orderKey
 */
export function setOrderKey(uuid: string, key: OrderKey): void {
  orderKeys.set(uuid, key)
}

/**
 * Сбрасывает состояние модуля (для тестов).
 *
 * @example
 * ```typescript
 * _resetStore()  // очистить всё состояние
 * ```
 */
export function _resetStore(): void {
  childrenView = new Map()
  indexPaths = new Map()
  orderKeys = new Map()
}
