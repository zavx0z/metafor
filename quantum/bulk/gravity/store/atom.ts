/**
 * Модуль CRUD операций для атомов.
 * @packageDocumentation
 *
 * Отвечает за создание, чтение, обновление и удаление записей атомов.
 * Интегрируется с модулями order и graph для управления порядком и иерархией.
 *
 * ## Структуры данных
 *
 * - atoms: Map<uuid, AtomRecord> — основное хранилище записей
 */

import type { BulkAtomRecord } from "@bulk/types/weak"
import { appendChild, removeChild, getChildren, resetGraphStore } from "./graph"

// Состояние модуля
let atoms: Map<string, BulkAtomRecord> = new Map()

/**
 * Создаёт нового атома и добавляет в иерархию.
 *
 * @param uuid - Уникальный идентификатор атома (UUID v4)
 * @param src - Исходный код или ссылка на модуль
 * @param parentUuid - UUID родителя (null для корневого уровня)
 * @param orderKey - Лексикографический ключ для упорядочивания
 * @returns созданную запись атома
 *
 * @example
 * ```typescript
 * const atom = createAtom(
 *   "uuid-123",
 *   "./component.ts",
 *   null,
 *   first()
 * )р
 * ```
 */
export function createAtom(uuid: string, src: string, parentUuid: string | null, orderKey: Uint8Array): BulkAtomRecord {
  const record: BulkAtomRecord = {
    uuid,
    src,
    parentUuid,
    orderKey,
    status: "pending",
  }

  atoms.set(uuid, record)
  appendChild(parentUuid, uuid)

  return record
}

/**
 * Получает атома по UUID.
 *
 * @param uuid - UUID атома
 * @returns запись атома или undefined если не найден
 *
 * @example
 * ```typescript
 * const atom = getAtom("uuid-123")
 * if (atom) { ... }
 * ```
 */
export function getAtom(uuid: string): BulkAtomRecord | undefined {
  return atoms.get(uuid)
}

/**
 * Обновляет поля атома.
 *
 * @param uuid - UUID атома
 * @param updates - поля для обновления (Partial<AtomRecord>)
 * @returns обновлённую запись или undefined если атом не найден
 *
 * @example
 * ```typescript
 * updateAtom("uuid-123", { status: "active", src: "./next.ts" })
 * ```
 */
export function updateAtom(uuid: string, updates: Partial<BulkAtomRecord>): BulkAtomRecord | undefined {
  const atom = atoms.get(uuid)
  if (!atom) {
    return undefined
  }

  const updated: BulkAtomRecord = { ...atom, ...updates }
  atoms.set(uuid, updated)

  return updated
}

/**
 * Удаляет атома из хранилища.
 *
 * @param uuid - UUID атома
 *
 * @example
 * ```typescript
 * deleteAtom("uuid-123")
 * ```
 */
export function deleteAtom(uuid: string): void {
  const atom = atoms.get(uuid)
  if (atom) {
    atoms.delete(uuid)
    removeChild(atom.parentUuid, uuid)
  }
}

/**
 * Получает все записи атомов.
 *
 * @returns массив всех атомов
 *
 * @example
 * ```typescript
 * const all = getAllAtoms()
 * ```
 */
export function getAllAtoms(): BulkAtomRecord[] {
  return Array.from(atoms.values())
}

/**
 * Получает атомов по родителю.
 *
 * @param parentUuid - UUID родителя
 * @returns массив атомов-детей
 *
 * @example
 * ```typescript
 * const children = getAtomsByParent("uuid-456")
 * ```
 */
export function getAtomsByParent(parentUuid: string): BulkAtomRecord[] {
  const childUuids = getChildren(parentUuid)
  return childUuids.map((uuid) => atoms.get(uuid)).filter((atom): atom is BulkAtomRecord => atom !== undefined)
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
  atoms = new Map()
  resetGraphStore()
}
