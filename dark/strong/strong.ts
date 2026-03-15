import type {
  DarkStore,
  GlobalTopologyEntanglement,
  GlobalTopologyMetaIndex,
  GlobalTopologyPlacement,
  GlobalTopologyReference,
} from "@dark/types"
import { strong$ } from "./store.ts"

/**
 * Добавляет значение в массив, если оно ещё не присутствует.
 *
 * Чистая функция.
 */
export function appendUnique<T>(target: T[], value: T): T[] {
  if (!target.includes(value)) {
    target.push(value)
  }
  return target
}

/**
 * Находит или создаёт meta index.
 *
 * Мутирует strong$.
 */
export function ensureMetaIndex(meta: string): GlobalTopologyMetaIndex {
  let metaIndex = strong$.sourceMetaIndex.get(meta)
  if (!metaIndex) {
    metaIndex = {
      objectIds: [],
      placementIds: [],
      referenceIds: [],
      entanglementIds: [],
    }
    strong$.sourceMetaIndex.set(meta, metaIndex)
  }
  return metaIndex
}

/**
 * Индексирует placement.
 *
 * Мутирует strong$.
 */
export function indexPlacement(placement: GlobalTopologyPlacement, meta: string): void {
  strong$.placementAddressIndex.set(placement.address, placement.id)
  strong$.objectPlacementsIndex.set(
    placement.objectId,
    appendUnique(strong$.objectPlacementsIndex.get(placement.objectId) ?? [], placement.id),
  )
  const metaIndex = ensureMetaIndex(meta)
  metaIndex.placementIds = appendUnique(metaIndex.placementIds, placement.id)
}

/**
 * Индексирует reference.
 *
 * Мутирует strong$.
 */
export function indexReference(reference: GlobalTopologyReference, meta: string): void {
  strong$.metaSourceLookup.set(
    reference.src,
    appendUnique(strong$.metaSourceLookup.get(reference.src) ?? [], reference.id),
  )
  const metaIndex = ensureMetaIndex(meta)
  metaIndex.referenceIds = appendUnique(metaIndex.referenceIds, reference.id)
}

/**
 * Индексирует entanglement.
 *
 * Мутирует strong$.
 */
export function indexEntanglement(entanglement: GlobalTopologyEntanglement, meta: string): void {
  strong$.entanglementAddressIndex.set(entanglement.entanglementAddress, entanglement.id)
  const metaIndex = ensureMetaIndex(meta)
  metaIndex.entanglementIds = appendUnique(metaIndex.entanglementIds, entanglement.id)
}

/**
 * Индексирует объект.
 *
 * Мутирует strong$.
 */
export function indexObject(objectId: string, meta: string): void {
  const metaIndex = ensureMetaIndex(meta)
  appendUnique(metaIndex.objectIds, objectId)
}

/**
 * Перестраивает индексы strong$ из данных dark$.
 *
 * Pipeline функция — мутирует strong$.
 */
export function rebuildStrongIndexes(dark$: DarkStore): void {
  for (const object of dark$.objects.values()) {
    const metaIndex = ensureMetaIndex(object.meta)
    metaIndex.objectIds = appendUnique(metaIndex.objectIds, object.id)
  }
  for (const placement of dark$.placements.values()) {
    strong$.placementAddressIndex.set(placement.address, placement.id)
    strong$.objectPlacementsIndex.set(
      placement.objectId,
      appendUnique(strong$.objectPlacementsIndex.get(placement.objectId) ?? [], placement.id),
    )
    const metaIndex = ensureMetaIndex(placement.meta)
    metaIndex.placementIds = appendUnique(metaIndex.placementIds, placement.id)
  }
  for (const reference of dark$.references.values()) {
    strong$.metaSourceLookup.set(
      reference.src,
      appendUnique(strong$.metaSourceLookup.get(reference.src) ?? [], reference.id),
    )
    const metaIndex = ensureMetaIndex(reference.meta)
    metaIndex.referenceIds = appendUnique(metaIndex.referenceIds, reference.id)
  }
  for (const entanglement of dark$.entanglements.values()) {
    strong$.entanglementAddressIndex.set(entanglement.entanglementAddress, entanglement.id)
    const metaIndex = ensureMetaIndex(entanglement.meta)
    metaIndex.entanglementIds = appendUnique(metaIndex.entanglementIds, entanglement.id)
  }
}
