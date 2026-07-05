/**
 * Модуль CRUD операций для акторов.
 * @packageDocumentation
 *
 * Отвечает за создание, чтение, обновление и удаление записей акторов.
 * Интегрируется с модулями order и graph для управления порядком и иерархией.
 *
 * ## Структуры данных
 *
 * - actors: Map<uuid, ActorRecord> — основное хранилище записей
 */

import type { BulkActorRecord } from "@metafor/types/bulk"
import { appendChild, removeChild, getChildren, resetGraphStore } from "./graph"

// Состояние модуля
let actors: Map<string, BulkActorRecord> = new Map()

/**
 * Создаёт нового актора и добавляет в иерархию.
 *
 * @param uuid - Уникальный идентификатор актора (UUID v4)
 * @param src - Исходный код или ссылка на модуль
 * @param parentUuid - UUID родителя (null для корневого уровня)
 * @param orderKey - Лексикографический ключ для упорядочивания
 * @returns созданную запись актора
 *
 * @example
 * ```typescript
 * const actor = createActor(
 *   "uuid-123",
 *   "./component.ts",
 *   null,
 *   first()
 * )р
 * ```
 */
export function createActor(uuid: string, src: string, parentUuid: string | null, orderKey: Uint8Array): BulkActorRecord {
  const record: BulkActorRecord = {
    uuid,
    src,
    parentUuid,
    orderKey,
    status: "pending",
  }

  actors.set(uuid, record)
  appendChild(parentUuid, uuid)

  return record
}

/**
 * Получает актора по UUID.
 *
 * @param uuid - UUID актора
 * @returns запись актора или undefined если не найден
 *
 * @example
 * ```typescript
 * const actor = getActor("uuid-123")
 * if (actor) { ... }
 * ```
 */
export function getActor(uuid: string): BulkActorRecord | undefined {
  return actors.get(uuid)
}

/**
 * Обновляет поля актора.
 *
 * @param uuid - UUID актора
 * @param updates - поля для обновления (Partial<ActorRecord>)
 * @returns обновлённую запись или undefined если актор не найден
 *
 * @example
 * ```typescript
 * updateActor("uuid-123", { status: "active", src: "./next.ts" })
 * ```
 */
export function updateActor(uuid: string, updates: Partial<BulkActorRecord>): BulkActorRecord | undefined {
  const actor = actors.get(uuid)
  if (!actor) {
    return undefined
  }

  const updated: BulkActorRecord = { ...actor, ...updates }
  actors.set(uuid, updated)

  return updated
}

/**
 * Удаляет актора из хранилища.
 *
 * @param uuid - UUID актора
 *
 * @example
 * ```typescript
 * deleteActor("uuid-123")
 * ```
 */
export function deleteActor(uuid: string): void {
  const actor = actors.get(uuid)
  if (actor) {
    actors.delete(uuid)
    removeChild(actor.parentUuid, uuid)
  }
}

/**
 * Получает все записи акторов.
 *
 * @returns массив всех акторов
 *
 * @example
 * ```typescript
 * const all = getAllActors()
 * ```
 */
export function getAllActors(): BulkActorRecord[] {
  return Array.from(actors.values())
}

/**
 * Получает акторов по родителю.
 *
 * @param parentUuid - UUID родителя
 * @returns массив акторов-детей
 *
 * @example
 * ```typescript
 * const children = getActorsByParent("uuid-456")
 * ```
 */
export function getActorsByParent(parentUuid: string): BulkActorRecord[] {
  const childUuids = getChildren(parentUuid)
  return childUuids.map((uuid) => actors.get(uuid)).filter((actor): actor is BulkActorRecord => actor !== undefined)
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
  actors = new Map()
  resetGraphStore()
}
