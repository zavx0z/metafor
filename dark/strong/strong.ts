/**
 * `@dark/strong` — index orchestration и lookup поверх `strong$`.
 *
 * **Dark × Strong:**
 * - постоянство структурной памяти и согласованность схем
 * - изменение значений ordinary `Field` через `Gluon`
 * - удержание скрытой структурной рамки и скрытой устойчивости идентичности
 *
 * @see {@link https://github.com/zavx0z/metafor/blob/main/docs/ONTOLOGY.md#dark--strong | ONTOLOGY.md} — онтология Dark × Strong
 * @see {@link https://github.com/zavx0z/metafor/blob/main/docs/ARCHITECTURE.md#dark--strong | ARCHITECTURE.md} — архитектура Dark × Strong
 * @see {@link https://github.com/zavx0z/metafor/blob/main/docs/proto/strong.md | proto/strong.md} — протокол Strong и Gluon
 */

import type { GlobalTopologyEntanglement, GlobalTopologyPlacement, GlobalTopologyReference } from "@dark/gravity"
import type { GlobalTopologyMetaIndex } from "@dark/strong"
import type { StrongIndexes } from "./store.t.ts"
import { strong$ } from "./store.ts"

/**
 * Добавляет значение в массив, если оно ещё не присутствует.
 *
 * @param target — целевой массив
 * @param value — значение для добавления
 * @returns исходный или обновлённый массив
 */
function appendUnique(target: string[], value: string): string[] {
  return target.includes(value) ? target : [...target, value]
}

/**
 * Гарантирует наличие meta index для meta.
 *
 * @param store$ — strong indexes
 * @param meta — адрес meta-схемы
 * @returns существующий или новый meta index
 */
function ensureMetaIndex(store$: StrongIndexes, meta: string): GlobalTopologyMetaIndex {
  const existing = store$.sourceMetaIndex.get(meta)
  if (existing) return existing

  const created: GlobalTopologyMetaIndex = {
    objectIds: [],
    placementIds: [],
    referenceIds: [],
    entanglementIds: [],
  }
  store$.sourceMetaIndex.set(meta, created)
  return created
}

/**
 * Индексирует placement.
 *
 * Обновляет placementAddressIndex, objectPlacementsIndex и sourceMetaIndex.
 *
 * @param placement — размещение для индексации
 * @param meta — адрес meta-схемы
 * @param store$ — strong indexes (по умолчанию `strong$`)
 */
export function indexPlacement(
  placement: GlobalTopologyPlacement,
  meta: string,
  store$: StrongIndexes = strong$,
): void {
  store$.placementAddressIndex.set(placement.address, placement.id)
  store$.objectPlacementsIndex.set(
    placement.objectId,
    appendUnique(store$.objectPlacementsIndex.get(placement.objectId) ?? [], placement.id),
  )

  const metaIndex = ensureMetaIndex(store$, meta)
  metaIndex.placementIds = appendUnique(metaIndex.placementIds, placement.id)
}

/**
 * Удаляет индексы placement.
 *
 * @param placement — размещение для удаления
 * @param objectId — ID объекта размещения
 * @param meta — адрес meta-схемы
 * @param store$ — strong indexes (по умолчанию `strong$`)
 */
export function removePlacementIndexes(
  placement: GlobalTopologyPlacement,
  objectId: string,
  meta: string,
  store$: StrongIndexes = strong$,
): void {
  store$.placementAddressIndex.delete(placement.address)

  const objectPlacements = store$.objectPlacementsIndex.get(objectId)
  if (objectPlacements) {
    const filtered = objectPlacements.filter((id) => id !== placement.id)
    if (filtered.length === 0) {
      store$.objectPlacementsIndex.delete(objectId)
    } else {
      store$.objectPlacementsIndex.set(objectId, filtered)
    }
  }

  const metaIndex = store$.sourceMetaIndex.get(meta)
  if (metaIndex) {
    metaIndex.placementIds = metaIndex.placementIds.filter((id) => id !== placement.id)
  }
}

/**
 * Индексирует reference.
 *
 * Обновляет metaSourceLookup и sourceMetaIndex.
 *
 * @param reference — ссылка для индексации
 * @param meta — адрес meta-схемы
 * @param store$ — strong indexes (по умолчанию `strong$`)
 */
export function indexReference(
  reference: GlobalTopologyReference,
  meta: string,
  store$: StrongIndexes = strong$,
): void {
  store$.metaSourceLookup.set(
    reference.src,
    appendUnique(store$.metaSourceLookup.get(reference.src) ?? [], reference.id),
  )

  const metaIndex = ensureMetaIndex(store$, meta)
  metaIndex.referenceIds = appendUnique(metaIndex.referenceIds, reference.id)
}

/**
 * Удаляет индексы reference.
 *
 * @param reference — ссылка для удаления
 * @param meta — адрес meta-схемы
 * @param store$ — strong indexes (по умолчанию `strong$`)
 */
export function removeReferenceIndexes(
  reference: GlobalTopologyReference,
  meta: string,
  store$: StrongIndexes = strong$,
): void {
  const bySource = store$.metaSourceLookup.get(reference.src)
  if (bySource) {
    const filtered = bySource.filter((id) => id !== reference.id)
    if (filtered.length === 0) {
      store$.metaSourceLookup.delete(reference.src)
    } else {
      store$.metaSourceLookup.set(reference.src, filtered)
    }
  }

  const metaIndex = store$.sourceMetaIndex.get(meta)
  if (metaIndex) {
    metaIndex.referenceIds = metaIndex.referenceIds.filter((id) => id !== reference.id)
  }
}

/**
 * Индексирует entanglement.
 *
 * Обновляет entanglementAddressIndex и sourceMetaIndex.
 *
 * @param entanglement — запутанность для индексации
 * @param meta — адрес meta-схемы
 * @param store$ — strong indexes (по умолчанию `strong$`)
 */
export function indexEntanglement(
  entanglement: GlobalTopologyEntanglement,
  meta: string,
  store$: StrongIndexes = strong$,
): void {
  store$.entanglementAddressIndex.set(entanglement.entanglementAddress, entanglement.id)

  const metaIndex = ensureMetaIndex(store$, meta)
  metaIndex.entanglementIds = appendUnique(metaIndex.entanglementIds, entanglement.id)
}

/**
 * Удаляет индексы entanglement.
 *
 * @param entanglement — запутанность для удаления
 * @param meta — адрес meta-схемы
 * @param store$ — strong indexes (по умолчанию `strong$`)
 */
export function removeEntanglementIndexes(
  entanglement: GlobalTopologyEntanglement,
  meta: string,
  store$: StrongIndexes = strong$,
): void {
  store$.entanglementAddressIndex.delete(entanglement.entanglementAddress)

  const metaIndex = store$.sourceMetaIndex.get(meta)
  if (metaIndex) {
    metaIndex.entanglementIds = metaIndex.entanglementIds.filter((id) => id !== entanglement.id)
  }
}

/**
 * Индексирует объект.
 *
 * Добавляет objectId в sourceMetaIndex.
 *
 * @param objectId — ID объекта
 * @param meta — адрес meta-схемы
 * @param store$ — strong indexes (по умолчанию `strong$`)
 */
export function indexObject(
  objectId: string,
  meta: string,
  store$: StrongIndexes = strong$,
): void {
  const metaIndex = ensureMetaIndex(store$, meta)
  metaIndex.objectIds = appendUnique(metaIndex.objectIds, objectId)
}

/**
 * Удаляет индекс объекта.
 *
 * @param objectId — ID объекта
 * @param meta — адрес meta-схемы
 * @param store$ — strong indexes (по умолчанию `strong$`)
 */
export function removeObjectIndex(
  objectId: string,
  meta: string,
  store$: StrongIndexes = strong$,
): void {
  const metaIndex = store$.sourceMetaIndex.get(meta)
  if (metaIndex) {
    metaIndex.objectIds = metaIndex.objectIds.filter((id) => id !== objectId)
  }
}

/**
 * Находит ID placement по адресу.
 *
 * @param address — полный адрес размещения
 * @param store — strong indexes (по умолчанию `strong$`)
 * @returns ID placement или undefined
 */
export function getPlacementIdByAddress(
  address: string,
  store: Pick<StrongIndexes, "placementAddressIndex"> = strong$,
): string | undefined {
  return store.placementAddressIndex.get(address)
}

/**
 * Находит IDs placements объекта.
 *
 * @param objectId — ID объекта
 * @param store — strong indexes (по умолчанию `strong$`)
 * @returns массив IDs placements
 */
export function getPlacementIdsByObject(
  objectId: string,
  store: Pick<StrongIndexes, "objectPlacementsIndex"> = strong$,
): string[] {
  return store.objectPlacementsIndex.get(objectId) ?? []
}

/**
 * Находит IDs placements meta-схемы.
 *
 * @param meta — адрес meta-схемы
 * @param store — strong indexes (по умолчанию `strong$`)
 * @returns массив IDs placements
 */
export function getPlacementIdsByMeta(
  meta: string,
  store: Pick<StrongIndexes, "sourceMetaIndex"> = strong$,
): string[] {
  return store.sourceMetaIndex.get(meta)?.placementIds ?? []
}

/**
 * Находит IDs references по источнику.
 *
 * @param metaSource — адрес source meta-схемы
 * @param store — strong indexes (по умолчанию `strong$`)
 * @returns массив IDs references
 */
export function getReferenceIdsBySource(
  metaSource: string,
  store: Pick<StrongIndexes, "metaSourceLookup"> = strong$,
): string[] {
  return store.metaSourceLookup.get(metaSource) ?? []
}

/**
 * Находит ID entanglement по адресу.
 *
 * @param address — адрес entanglement
 * @param store — strong indexes (по умолчанию `strong$`)
 * @returns ID entanglement или undefined
 */
export function getEntanglementIdByAddress(
  address: string,
  store: Pick<StrongIndexes, "entanglementAddressIndex"> = strong$,
): string | undefined {
  return store.entanglementAddressIndex.get(address)
}

/**
 * Проверяет наличие placement в индексах.
 *
 * @param address — адрес размещения
 * @param store — strong indexes (по умолчанию `strong$`)
 * @returns true, если placement проиндексирован
 */
export function isPlacementIndexed(
  address: string,
  store: Pick<StrongIndexes, "placementAddressIndex"> = strong$,
): boolean {
  return store.placementAddressIndex.has(address)
}

/**
 * Проверяет наличие reference по источнику.
 *
 * @param metaSource — адрес source meta-схемы
 * @param referenceId — ID ссылки
 * @param store — strong indexes (по умолчанию `strong$`)
 * @returns true, если reference существует
 */
export function hasReferenceBySource(
  metaSource: string,
  referenceId: string,
  store: Pick<StrongIndexes, "metaSourceLookup"> = strong$,
): boolean {
  const bySource = store.metaSourceLookup.get(metaSource)
  return bySource ? bySource.includes(referenceId) : false
}
