/**
 * ActorHierarchy - класс для управления иерархическим деревом акторов
 *
 * Отвечает за:
 * - Управление позиционными путями VDOM (например, "0/1/2")
 * - Иерархическое хранилище акторов (order-tree)
 * - Операции с деревом: добавление, перемещение, удаление
 * - Генерацию уникальных корневых путей
 * - Интеграцию с системой сообщений MetaFor
 *
 * @example
 * ```typescript
 * const hierarchy = new ActorHierarchy()
 *
 * // Создание корневого узла
 * const rootPath = hierarchy.generateRootPath() // "0"
 *
 * // Создание дочернего узла
 * const childPath = hierarchy.createNode("0", actor) // "0/0"
 *
 * // Поиск актора по пути
 * const actor = hierarchy.getActor("0/1")
 * ```
 */

import type { ActorCommunication } from "./communication"
import {
  createActorStore,
  createActorNode,
  appendChild,
  removeActor,
  getActor,
  hasActor,
  getChildren,
  insertBetween,
  moveAfter,
  moveBefore,
  reparentActor,
  getByIndexPath,
  normalizeChildren,
  type ActorStore,
  type ReparentOptions,
} from "../order-tree/index"

// Экспортируем типы для удобства
export type { ReparentOptions } from "../order-tree/index"

/**
 * Класс для управления иерархией акторов с позиционными путями VDOM
 *
 * Предоставляет методы для:
 * - Создания и удаления узлов иерархии
 * - Поиска акторов по путям и ID
 * - Генерации уникальных корневых путей
 * - Управления порядком дочерних элементов
 * - Интеграции с системой сообщений MetaFor
 *
 * @example
 * ```typescript
 * const hierarchy = new ActorHierarchy()
 *
 * // Создание корневого узла
 * const rootPath = hierarchy.generateRootPath() // "0"
 *
 * // Создание дочернего узла
 * const childPath = hierarchy.createNode("0", actor) // "0/0"
 *
 * // Поиск актора по пути
 * const actor = hierarchy.getActor("0/1")
 * ```
 */
export class ActorHierarchy {
  /** Иерархическое хранилище акторов */
  private readonly store: ActorStore = createActorStore()

  /** Индекс для быстрого поиска по id актора */
  private readonly idIndex = new Map<string, string>()

  /** Счетчик для генерации уникальных корневых путей */
  private pathCounter = 0

  /** Генерирует уникальный корневой путь для актора */
  generateRootPath(): string {
    return (this.pathCounter++).toString()
  }

  /** Сбрасывает счетчик путей (для тестирования) */
  resetPathCounter(): void {
    this.pathCounter = 0
  }

  /** Создает новый узел актора в иерархии */
  createNode(path: string, actor: ActorCommunication): void {
    createActorNode(this.store, path, actor)
    this.idIndex.set(actor.id, path)
  }

  /** Добавляет актора как дочерний к указанному родителю */
  appendChild(parentPath: string | null, childPath: string): void {
    appendChild(this.store, parentPath, childPath)
  }

  /** Вставляет актора между двумя соседями */
  insertBetween(leftPath: string | null, rightPath: string | null, actorPath: string): void {
    insertBetween(this.store, leftPath, rightPath, actorPath)
  }

  /** Перемещает актора после указанного */
  moveAfter(targetPath: string, actorPath: string): void {
    moveAfter(this.store, targetPath, actorPath)
  }

  /** Перемещает актора перед указанным */
  moveBefore(targetPath: string, actorPath: string): void {
    moveBefore(this.store, targetPath, actorPath)
  }

  /** Перепривязывает актора к новому родителю */
  reparent(newParentPath: string | null, actorPath: string, options?: ReparentOptions): void {
    reparentActor(this.store, newParentPath, actorPath, options)
  }

  /** Удаляет актора из иерархии */
  removeNode(actorPath: string, recursive = false): void {
    const actor = getActor(this.store, actorPath)
    if (actor) {
      this.idIndex.delete(actor.id)
    }
    removeActor(this.store, actorPath, recursive)
  }

  /** Получает актора по пути */
  getActor(actorPath: string): ActorCommunication | null {
    return getActor(this.store, actorPath)
  }

  /** Получает актора по id */
  getActorById(actorId: string): ActorCommunication | null {
    const path = this.idIndex.get(actorId)
    return path ? getActor(this.store, path) : null
  }

  /** Получает путь актора по id */
  getPathById(actorId: string): string | null {
    return this.idIndex.get(actorId) ?? null
  }

  /** Проверяет существование актора */
  hasActor(actorPath: string): boolean {
    return hasActor(this.store, actorPath)
  }

  /** Получает детей актора */
  getChildren(parentPath: string | null): readonly string[] {
    return getChildren(this.store, parentPath)
  }

  /** Получает актора по индексному пути */
  getByIndexPath(rootPath: string, indexPath: number[]): string | null {
    return getByIndexPath(this.store, rootPath, indexPath)
  }

  /** Нормализует порядок детей в целые числа */
  normalizeChildren(parentPath: string | null): void {
    normalizeChildren(this.store, parentPath)
  }

  /** Получает всех акторов в иерархии */
  getAllActors(): ActorCommunication[] {
    const actors: ActorCommunication[] = []
    for (const node of this.store.arena.values()) {
      actors.push(node.actor)
    }
    return actors
  }

  /** Получает количество акторов в иерархии */
  getActorCount(): number {
    return this.store.arena.size
  }

  /** Очищает всю иерархию (для тестирования) */
  clear(): void {
    this.store.arena.clear()
    this.store.childrenView.clear()
    this.store.dirty.clear()
    this.idIndex.clear()
    this.pathCounter = 0
  }

  /** Получает корневые узлы (без родителя) */
  getRootNodes(): string[] {
    return Array.from(getChildren(this.store, null))
  }

  /** Проверяет, является ли узел корневым */
  isRootNode(actorPath: string): boolean {
    const node = this.store.arena.get(actorPath)
    return node ? node.parent === null : false
  }

  /** Получает родительский путь для актора */
  getParentPath(actorPath: string): string | null {
    const node = this.store.arena.get(actorPath)
    return node ? node.parent : null
  }

  /** Получает глубину узла в дереве */
  getDepth(actorPath: string): number {
    if (actorPath === "") return 0
    return actorPath.split("/").length
  }

  /** Проверяет, является ли один узел предком другого */
  isAncestor(ancestorPath: string, descendantPath: string): boolean {
    if (ancestorPath === descendantPath) return false
    return descendantPath.startsWith(ancestorPath + "/") || (ancestorPath === "" && !descendantPath.includes("/"))
  }

  /** Получает всех потомков узла */
  getDescendants(actorPath: string): string[] {
    const descendants: string[] = []
    const children = getChildren(this.store, actorPath)

    for (const childPath of children) {
      descendants.push(childPath)
      descendants.push(...this.getDescendants(childPath))
    }

    return descendants
  }

  /** Получает путь от корня до указанного узла */
  getPathToRoot(actorPath: string): string[] {
    const path: string[] = []
    let currentPath: string | null = actorPath

    while (currentPath !== null) {
      path.unshift(currentPath)
      currentPath = this.getParentPath(currentPath)
    }

    return path
  }
}
