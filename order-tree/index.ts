/**
 * Order Tree - TypeScript версия для управления деревом акторов
 *
 * Арена с фракционным порядком и ленивой витриной для ActorCommunication
 * Использует позиционные пути VDOM в виде строк индексов через слеш
 */

import type { ActorCommunication } from "../core/communication"

/** Узел в дереве акторов */
export interface ActorNode {
  /** Позиционный путь актора в VDOM (строка индексов через слеш, например "0/1/2") */
  readonly path: string
  /** Ссылка на родительский узел (null для корня) */
  parent: string | null
  /** Порядок среди соседей (фракционный) */
  order: number
  /** Ссылка на актор */
  actor: ActorCommunication
}

/** Хранилище дерева акторов */
export interface ActorStore {
  /** Арена узлов: path -> ActorNode */
  readonly arena: Map<string, ActorNode>
  /** Витрина детей: parentPath -> path[] (отсортированные по order) */
  readonly childrenView: Map<string, string[]>
  /** Родители, требующие пересортировки витрины */
  readonly dirty: Set<string>
}

/** Опции для перепривязки актора */
export interface ReparentOptions {
  /** Позиция вставки */
  at: "start" | "end" | "after"
  /** После какого актора вставить (только для at: "after") */
  after?: string | null
}

/** Создает новое хранилище дерева акторов */
export function createActorStore(): ActorStore {
  return {
    arena: new Map(),
    childrenView: new Map(),
    dirty: new Set(),
  }
}

/** Получает родительский путь из позиционного пути */
function getParentPath(path: string): string | null {
  if (path === "") return null
  const lastSlash = path.lastIndexOf("/")
  return lastSlash === -1 ? null : path.substring(0, lastSlash)
}

/** Получает индекс актора в родителе из позиционного пути */
function getIndexInParent(path: string): number {
  if (path === "") return 0
  const lastSlash = path.lastIndexOf("/")
  const indexStr = lastSlash === -1 ? path : path.substring(lastSlash + 1)
  return parseInt(indexStr, 10)
}

/** Создает дочерний путь */
function createChildPath(parentPath: string | null, index: number): string {
  if (parentPath === null || parentPath === "") return index.toString()
  return `${parentPath}/${index}`
}

/** Вычисляет среднее между двумя порядками */
function midOrder(a: number | null, b: number | null): number {
  if (a == null && b == null) return 0
  if (a == null) return b! - 1
  if (b == null) return a! + 1
  return (a + b) / 2
}

/** Помечает родителя как требующего пересортировки */
function markDirty(store: ActorStore, parentPath: string | null): void {
  const key = parentPath ?? ""
  store.dirty.add(key)
}

/** Создает новый узел актора */
export function createActorNode(store: ActorStore, path: string, actor: ActorCommunication): void {
  if (store.arena.has(path)) {
    throw new Error(`Actor node already exists: ${path}`)
  }

  const node: ActorNode = {
    path,
    parent: getParentPath(path),
    order: 0,
    actor,
  }

  store.arena.set(path, node)
}

/** Возвращает отсортированный массив детей (с ленивой сортировкой) */
export function getChildren(store: ActorStore, parentPath: string | null): readonly string[] {
  const key = parentPath ?? ""

  if (!store.childrenView.has(key)) {
    store.childrenView.set(key, [])
  }

  const children = store.childrenView.get(key)!

  if (store.dirty.has(key)) {
    children.sort((a, b) => {
      const nodeA = store.arena.get(a)!
      const nodeB = store.arena.get(b)!
      return nodeA.order - nodeB.order
    })
    store.dirty.delete(key)
  }

  // Возвращаем неизменяемую копию для безопасности
  return Object.freeze([...children])
}

/** Добавляет актора в конец списка детей */
export function appendChild(store: ActorStore, parentPath: string | null, actorPath: string): void {
  const node = store.arena.get(actorPath)

  if (!node) {
    throw new Error(`Unknown actor: ${actorPath}`)
  }

  const children = getChildren(store, parentPath) as string[]
  const lastKey = children.length > 0 ? children[children.length - 1] : null
  const lastOrder = lastKey ? store.arena.get(lastKey)!.order : null

  node.parent = parentPath
  node.order = midOrder(lastOrder, null)

  // Добавляем в витрину
  const parentKey = parentPath ?? ""
  const childrenArray = store.childrenView.get(parentKey)!
  childrenArray.push(actorPath)

  markDirty(store, parentPath)
}

/** Вставляет актора между двумя соседями */
export function insertBetween(
  store: ActorStore,
  leftPath: string | null,
  rightPath: string | null,
  actorPath: string
): void {
  const node = store.arena.get(actorPath)

  if (!node) {
    throw new Error(`Unknown actor: ${actorPath}`)
  }

  // Определяем родителя на основе соседей
  const leftNode = leftPath ? store.arena.get(leftPath) : null
  const rightNode = rightPath ? store.arena.get(rightPath) : null

  let parentPath: string | null = null

  if (leftNode && rightNode) {
    // Проверяем, что соседи имеют одного родителя
    const leftParentKey = leftNode.parent ?? ""
    const rightParentKey = rightNode.parent ?? ""

    if (leftParentKey !== rightParentKey) {
      throw new Error("Neighbors must share the same parent")
    }
    parentPath = leftNode.parent
  } else if (leftNode) {
    parentPath = leftNode.parent
  } else if (rightNode) {
    parentPath = rightNode.parent
  }

  node.parent = parentPath

  const leftOrder = leftNode ? leftNode.order : null
  const rightOrder = rightNode ? rightNode.order : null
  node.order = midOrder(leftOrder, rightOrder)

  // Вставляем в витрину по порядку
  const parentKey = parentPath ?? ""
  if (!store.childrenView.has(parentKey)) {
    store.childrenView.set(parentKey, [])
  }

  const children = store.childrenView.get(parentKey)!
  const insertPos = binarySearchByOrder(store, children, node.order)
  children.splice(insertPos, 0, actorPath)

  markDirty(store, parentPath)
}

/** Бинарный поиск позиции для вставки по order */
function binarySearchByOrder(store: ActorStore, children: string[], order: number): number {
  let lo = 0
  let hi = children.length

  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    const childPath = children[mid]
    if (!childPath) throw new Error(`Child at index ${mid} is undefined`)
    const node = store.arena.get(childPath)
    if (!node) throw new Error(`Node not found: ${childPath}`)
    const midOrder = node.order

    if (midOrder <= order) {
      lo = mid + 1
    } else {
      hi = mid
    }
  }

  return lo
}

/** Отвязывает актора от родителя */
export function unlinkActor(store: ActorStore, actorPath: string): void {
  const node = store.arena.get(actorPath)

  if (!node || !node.parent) return

  const parentKey = node.parent
  const children = store.childrenView.get(parentKey)

  if (children) {
    const index = children.indexOf(actorPath)
    if (index !== -1) {
      children.splice(index, 1)
    }
  }

  markDirty(store, node.parent)
  node.parent = null
}

/** Перемещает актора после указанного */
export function moveAfter(store: ActorStore, targetPath: string, actorPath: string): void {
  if (targetPath === actorPath) return

  const targetNode = store.arena.get(targetPath)
  if (!targetNode) {
    throw new Error(`Target actor not found: ${targetPath}`)
  }

  unlinkActor(store, actorPath)

  const nextSibling = getNextSibling(store, targetNode.parent, targetPath)
  insertBetween(store, targetPath, nextSibling, actorPath)
}

/** Перемещает актора перед указанным */
export function moveBefore(store: ActorStore, targetPath: string, actorPath: string): void {
  if (targetPath === actorPath) return

  const targetNode = store.arena.get(targetPath)
  if (!targetNode) {
    throw new Error(`Target actor not found: ${targetPath}`)
  }

  const prevSibling = getPrevSibling(store, targetNode.parent, targetPath)

  unlinkActor(store, actorPath)
  insertBetween(store, prevSibling, targetPath, actorPath)
}

/** Перепривязывает актора к новому родителю */
export function reparentActor(
  store: ActorStore,
  newParentPath: string | null,
  actorPath: string,
  options: ReparentOptions = { at: "end" }
): void {
  unlinkActor(store, actorPath)

  if (options.at === "start") {
    const firstChild = getFirstChild(store, newParentPath)
    insertBetween(store, null, firstChild, actorPath)
  } else if (options.at === "after" && options.after) {
    const nextSibling = getNextSibling(store, newParentPath, options.after)
    insertBetween(store, options.after, nextSibling, actorPath)
  } else {
    appendChild(store, newParentPath, actorPath)
  }
}

/** Получает первого ребенка */
function getFirstChild(store: ActorStore, parentPath: string | null): string | null {
  const children = getChildren(store, parentPath)
  return children.length > 0 ? (children[0] ?? null) : null
}

/** Получает следующего соседа */
function getNextSibling(store: ActorStore, parentPath: string | null, actorPath: string): string | null {
  const children = getChildren(store, parentPath)
  const index = children.indexOf(actorPath)

  return index >= 0 && index + 1 < children.length ? (children[index + 1] ?? null) : null
}

/** Получает предыдущего соседа */
function getPrevSibling(store: ActorStore, parentPath: string | null, actorPath: string): string | null {
  const children = getChildren(store, parentPath)
  const index = children.indexOf(actorPath)

  return index > 0 ? (children[index - 1] ?? null) : null
}

/** Доступ к актору по пути индексов */
export function getByIndexPath(store: ActorStore, rootPath: string, indexPath: number[]): string | null {
  let currentPath = rootPath

  for (const index of indexPath) {
    const children = getChildren(store, currentPath)
    if (index >= children.length) return null
    const nextPath = children[index]
    if (!nextPath) return null
    currentPath = nextPath
  }

  return currentPath
}

/** Нормализует порядок детей в целые числа */
export function normalizeChildren(store: ActorStore, parentPath: string | null): void {
  const children = getChildren(store, parentPath) as string[]

  children.forEach((childPath, index) => {
    const node = store.arena.get(childPath)!
    node.order = index
  })

  markDirty(store, parentPath)
}

/** Удаляет актора и все его поддерево */
export function removeActor(store: ActorStore, actorPath: string, recursive = false): void {
  const node = store.arena.get(actorPath)

  if (!node) return

  if (recursive) {
    // Рекурсивно удаляем всех детей
    const children = getChildren(store, actorPath)
    for (const childPath of children) {
      removeActor(store, childPath, true)
    }
  }

  // Отвязываем от родителя
  unlinkActor(store, actorPath)

  // Удаляем из арены
  store.arena.delete(actorPath)

  // Очищаем витрину детей
  store.childrenView.delete(actorPath)
  store.dirty.delete(actorPath)
}

/** Получает актора по пути */
export function getActor(store: ActorStore, actorPath: string): ActorCommunication | null {
  const node = store.arena.get(actorPath)
  return node ? node.actor : null
}

/** Проверяет существование актора */
export function hasActor(store: ActorStore, actorPath: string): boolean {
  return store.arena.has(actorPath)
}
