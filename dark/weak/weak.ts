/**
 * `@dark/weak` — mutation orchestrator topology-слоя поверх глобального `dark$`.
 *
 * **Dark × Weak:**
 * - эволюция схем и активный скрытый переход через `W boson`
 * - нейтральная переходная медиция через `Z boson`
 * - мутация и преобразование скрытой структуры
 * - изменение модели до её проекций в `Boundary` и `Bulk`
 *
 * **Topology mutation:**
 * - `Higgs boson` изменяет topology-fields (`enum` → branch selection, `array` → branch multiplicity)
 * - `W boson` проводит активный переход между состояниями
 * - `Z boson` удерживает нейтральную медицию перехода
 *
 * @see {@link https://github.com/zavx0z/metafor/blob/main/docs/ONTOLOGY.md#dark--weak | ONTOLOGY.md} — онтология Dark × Weak
 * @see {@link https://github.com/zavx0z/metafor/blob/main/docs/ARCHITECTURE.md#dark--weak | ARCHITECTURE.md} — архитектура Dark × Weak
 * @see {@link https://github.com/zavx0z/metafor/blob/main/docs/TOPOLOGY.md | TOPOLOGY.md} — topology как скрытая карта построения
 * @see {@link https://github.com/zavx0z/metafor/blob/main/docs/proto/weak.md | proto/weak.md} — протокол Weak и W/Z boson
 * @see {@link https://github.com/zavx0z/metafor/blob/main/docs/proto/higgs.md | proto/higgs.md} — протокол Higgs и topology-field change
 */

import type { DarkStore, GravityStore, StrongIndexes, LocalTopologyFragment } from "@dark/gravity"
import type {
  InsertFragmentAtPlacementOptions,
  InsertFragmentAtPlacementResult,
  MovePlacementOptions,
  MovePlacementResult,
  RemovePlacementSubtreeOptions,
  RemovePlacementSubtreeResult,
  ReplaceFragmentOptions,
  ReplaceFragmentResult,
  RebuildFragmentOptions,
  RebuildFragmentResult,
} from "./store.t.ts"
import { dark$, gravity$, ingestFragment } from "@dark/gravity"
import { strong$, getPlacementIdsByMeta, removeEntanglementIndexes, removePlacementIndexes, removeReferenceIndexes } from "@dark/strong"

/**
 * Находит все descendant placement IDs.
 *
 * @param store — store с placements и links
 * @param rootPlacementId — ID корневого размещения
 * @returns массив IDs всех потомков
 */
function getDescendantPlacementIds(store: Pick<DarkStore, "placements" | "links">, rootPlacementId: string): string[] {
  const descendants: string[] = []
  const queue = [rootPlacementId]

  while (queue.length > 0) {
    const currentId = queue.shift()!
    if (!store.placements.get(currentId)) continue

    for (const [, link] of store.links.entries()) {
      if (link.from === currentId) {
        descendants.push(link.to)
        queue.push(link.to)
      }
    }
  }

  return descendants
}

/**
 * Находит все subtree placement IDs (root + descendants).
 *
 * @param store — store с placements и links
 * @param rootPlacementId — ID корневого размещения
 * @returns массив IDs всех placements в subtree
 */
function getSubtreePlacementIds(store: Pick<DarkStore, "placements" | "links">, rootPlacementId: string): string[] {
  return [rootPlacementId, ...getDescendantPlacementIds(store, rootPlacementId)]
}

/**
 * Удаляет placement и связанные links.
 *
 * @param store$ — dark store
 * @param placementId — ID размещения для удаления
 * @param indexes$ — strong indexes (по умолчанию `strong$`)
 */
function removePlacement(store$: DarkStore, placementId: string, indexes$: StrongIndexes = strong$): void {
  const placement = store$.getPlacement(placementId)
  if (!placement) return

  removePlacementIndexes(placement, placement.objectId, placement.meta, indexes$)
  store$.deletePlacement(placementId)

  for (const [linkId, link] of store$.links.entries()) {
    if (link.from === placementId || link.to === placementId) {
      store$.deleteLink(linkId)
    }
  }
}

/**
 * Удаляет reference и индексы.
 *
 * @param store$ — dark store
 * @param referenceId — ID ссылки для удаления
 * @param indexes$ — strong indexes (по умолчанию `strong$`)
 */
function removeReference(store$: DarkStore, referenceId: string, indexes$: StrongIndexes = strong$): void {
  const reference = store$.getReference(referenceId)
  if (!reference) return

  removeReferenceIndexes(reference, reference.meta, indexes$)
  store$.deleteReference(referenceId)
}

/**
 * Удаляет entanglement и индексы.
 *
 * @param store$ — dark store
 * @param entanglementId — ID запутанности для удаления
 * @param indexes$ — strong indexes (по умолчанию `strong$`)
 */
function removeEntanglement(store$: DarkStore, entanglementId: string, indexes$: StrongIndexes = strong$): void {
  const entanglement = store$.getEntanglement(entanglementId)
  if (!entanglement) return

  removeEntanglementIndexes(entanglement, entanglement.meta, indexes$)
  store$.deleteEntanglement(entanglementId)
}

/**
 * Заменяет фрагмент meta-схемы на новый.
 *
 * Удаляет все существующие сущности meta и вставляет новый фрагмент.
 *
 * @param meta — адрес meta-схемы для замены
 * @param newFragment — новый local topology fragment
 * @param options — опции замены (по умолчанию `{}`)
 * @param store$ — dark store (по умолчанию `dark$`)
 * @param gravityState$ — gravity store (по умолчанию `gravity$`)
 * @param indexes$ — strong indexes (по умолчанию `strong$`)
 * @returns результат замены с IDs созданных и удалённых сущностей
 */
export function replaceFragment(
  meta: string,
  newFragment: LocalTopologyFragment,
  options: ReplaceFragmentOptions = {},
  store$: DarkStore = dark$,
  gravityState$: GravityStore = gravity$,
  indexes$: StrongIndexes = strong$,
): ReplaceFragmentResult {
  const result: ReplaceFragmentResult = {
    meta,
    rootPlacementIds: [],
    placementIds: [],
    referenceIds: [],
    entanglementIds: [],
    removedPlacementIds: [],
    removedReferenceIds: [],
    removedEntanglementIds: [],
  }

  const existingPlacementIds = getPlacementIdsByMeta(meta, indexes$)
  const allToRemove = new Set<string>()

  for (const placementId of existingPlacementIds) {
    const placement = store$.getPlacement(placementId)
    if (placement && !placement.parentId) {
      for (const subtreeId of getSubtreePlacementIds(store$, placementId)) {
        allToRemove.add(subtreeId)
      }
    }
  }

  for (const placementId of allToRemove) {
    if (store$.getPlacement(placementId)) {
      result.removedPlacementIds.push(placementId)
    }
    removePlacement(store$, placementId, indexes$)
  }

  for (const [referenceId, reference] of store$.references.entries()) {
    if (reference.meta === meta) {
      result.removedReferenceIds.push(referenceId)
      removeReference(store$, referenceId, indexes$)
    }
  }

  for (const [entanglementId, entanglement] of store$.entanglements.entries()) {
    if (entanglement.meta === meta) {
      result.removedEntanglementIds.push(entanglementId)
      removeEntanglement(store$, entanglementId, indexes$)
    }
  }

  const ingested = ingestFragment(meta, newFragment, options, store$, gravityState$, indexes$)
  result.rootPlacementIds = ingested.rootPlacementIds
  result.placementIds = ingested.placementIds
  result.referenceIds = ingested.referenceIds
  result.entanglementIds = ingested.entanglementIds

  return result
}

/**
 * Удаляет subtree размещений.
 *
 * @param rootPlacementId — ID корневого размещения для удаления
 * @param options — опции удаления cascade (по умолчанию `{ cascadeReferences: true, cascadeEntanglements: true }`)
 * @param store$ — dark store (по умолчанию `dark$`)
 * @param indexes$ — strong indexes (по умолчанию `strong$`)
 * @returns результат удаления с IDs удалённых сущностей
 */
export function removePlacementSubtree(
  rootPlacementId: string,
  options: RemovePlacementSubtreeOptions = {},
  store$: DarkStore = dark$,
  indexes$: StrongIndexes = strong$,
): RemovePlacementSubtreeResult {
  const result: RemovePlacementSubtreeResult = {
    placementIds: [],
    referenceIds: [],
    entanglementIds: [],
    removedPlacementIds: [],
    removedReferenceIds: [],
    removedEntanglementIds: [],
  }

  const { cascadeReferences = true, cascadeEntanglements = true } = options
  const subtreeIds = getSubtreePlacementIds(store$, rootPlacementId)

  const relatedReferenceIds: string[] = []
  if (cascadeReferences) {
    for (const [referenceId, reference] of store$.references.entries()) {
      if (subtreeIds.includes(reference.placementId)) {
        relatedReferenceIds.push(referenceId)
      }
    }
  }

  const relatedEntanglementIds: string[] = []
  if (cascadeEntanglements) {
    for (const [entanglementId, entanglement] of store$.entanglements.entries()) {
      if (subtreeIds.includes(entanglement.placementId)) {
        relatedEntanglementIds.push(entanglementId)
      }
    }
  }

  for (const entanglementId of relatedEntanglementIds) {
    result.removedEntanglementIds.push(entanglementId)
    removeEntanglement(store$, entanglementId, indexes$)
  }

  for (const referenceId of relatedReferenceIds) {
    result.removedReferenceIds.push(referenceId)
    removeReference(store$, referenceId, indexes$)
  }

  for (const placementId of [...subtreeIds].reverse()) {
    result.removedPlacementIds.push(placementId)
    removePlacement(store$, placementId, indexes$)
  }

  return result
}

/**
 * Вставляет фрагмент в placement.
 *
 * @param parentPlacementId — ID родительского размещения
 * @param fragment — local topology fragment для вставки
 * @param fragmentMeta — адрес meta-схемы фрагмента
 * @param options — опции вставки (по умолчанию `{}`)
 * @param store$ — dark store (по умолчанию `dark$`)
 * @param gravityState$ — gravity store (по умолчанию `gravity$`)
 * @param indexes$ — strong indexes (по умолчанию `strong$`)
 * @returns результат вставки с IDs созданных сущностей
 */
export function insertFragmentAtPlacement(
  parentPlacementId: string,
  fragment: LocalTopologyFragment,
  fragmentMeta: string,
  options: InsertFragmentAtPlacementOptions = {},
  store$: DarkStore = dark$,
  gravityState$: GravityStore = gravity$,
  indexes$: StrongIndexes = strong$,
): InsertFragmentAtPlacementResult {
  const ingested = ingestFragment(
    fragmentMeta,
    fragment,
    {
      parentPlacementId,
      ...options,
    },
    store$,
    gravityState$,
    indexes$,
  )

  return {
    placementIds: ingested.placementIds,
    referenceIds: ingested.referenceIds,
    entanglementIds: ingested.entanglementIds,
    removedPlacementIds: [],
    removedReferenceIds: [],
    removedEntanglementIds: [],
  }
}

/**
 * Перемещает placement в новый parent.
 *
 * @param placementId — ID размещения для перемещения
 * @param options — опции перемещения с newParentPlacementId
 * @param store$ — dark store (по умолчанию `dark$`)
 * @param indexes$ — strong indexes (по умолчанию `strong$`)
 * @returns результат перемещения с новыми адресами
 */
export function movePlacement(
  placementId: string,
  options: MovePlacementOptions,
  store$: DarkStore = dark$,
  indexes$: StrongIndexes = strong$,
): MovePlacementResult {
  const result: MovePlacementResult = {
    movedPlacementId: placementId,
    newAddresses: new Map(),
    placementIds: [],
    referenceIds: [],
    entanglementIds: [],
    removedPlacementIds: [],
    removedReferenceIds: [],
    removedEntanglementIds: [],
  }

  const placement = store$.getPlacement(placementId)
  if (!placement) {
    throw new Error(`Placement ${placementId} не найден для перемещения.`)
  }

  const newParent = store$.getPlacement(options.newParentPlacementId)
  if (!newParent) {
    throw new Error(`Parent placement ${options.newParentPlacementId} не найден.`)
  }

  placement.parentId = options.newParentPlacementId
  placement.relation = "contains"

  for (const [, link] of store$.links.entries()) {
    if (link.to === placementId) {
      link.from = options.newParentPlacementId
      link.relation = "contains"
      break
    }
  }

  if (options.rebuildAddresses !== false) {
    result.newAddresses = remapPlacementAddresses(placementId, newParent.address, store$, indexes$)
  }

  return result
}

/**
 * Перестраивает fragment по meta.
 *
 * @param meta — адрес meta-схемы
 * @param options — опции перестройки (по умолчанию `{}`)
 * @param indexes$ — strong indexes (по умолчанию `strong$`)
 * @returns результат перестройки с IDs сущностей
 */
export function rebuildFragment(
  meta: string,
  options: RebuildFragmentOptions = {},
  indexes$: Pick<StrongIndexes, "sourceMetaIndex"> = strong$,
): RebuildFragmentResult {
  void options
  return {
    placementIds: getPlacementIdsByMeta(meta, indexes$),
    referenceIds: [],
    entanglementIds: [],
    removedPlacementIds: [],
    removedReferenceIds: [],
    removedEntanglementIds: [],
  }
}

/**
 * Отсоединяет subtree от parent.
 *
 * @param placementId — ID корневого размещения subtree
 * @param store$ — dark store (по умолчанию `dark$`)
 * @returns массив IDs всех placements в отсоединённом subtree
 */
export function detachSubtree(
  placementId: string,
  store$: DarkStore = dark$,
): string[] {
  const placement = store$.getPlacement(placementId)
  if (!placement) return []

  for (const [linkId, link] of store$.links.entries()) {
    if (link.to === placementId) {
      store$.deleteLink(linkId)
      break
    }
  }

  delete placement.parentId

  return getSubtreePlacementIds(store$, placementId)
}

/**
 * Перестраивает адреса subtree.
 *
 * @param rootPlacementId — ID корневого размещения
 * @param newAddressPrefix — новый префикс адреса
 * @param store$ — dark store (по умолчанию `dark$`)
 * @param indexes$ — strong indexes (по умолчанию `strong$`)
 * @returns карту старых адресов → новые адреса
 */
export function remapPlacementAddresses(
  rootPlacementId: string,
  newAddressPrefix: string,
  store$: DarkStore = dark$,
  indexes$: StrongIndexes = strong$,
): Map<string, string> {
  const addressMap = new Map<string, string>()
  const root = store$.getPlacement(rootPlacementId)
  if (!root) return addressMap

  const oldPrefix = root.address
  root.address = newAddressPrefix
  addressMap.set(oldPrefix, newAddressPrefix)

  indexes$.placementAddressIndex.delete(oldPrefix)
  indexes$.placementAddressIndex.set(newAddressPrefix, root.id)

  const descendants = getDescendantPlacementIds(store$, rootPlacementId)
  for (const descId of descendants) {
    const desc = store$.getPlacement(descId)
    if (!desc) continue

    const oldDescAddress = desc.address
    const newDescAddress = desc.address.replace(oldPrefix, newAddressPrefix)
    desc.address = newDescAddress

    indexes$.placementAddressIndex.delete(oldDescAddress)
    indexes$.placementAddressIndex.set(newDescAddress, desc.id)
    addressMap.set(oldDescAddress, newDescAddress)
  }

  const subtreeIds = [rootPlacementId, ...descendants]
  for (const [, reference] of store$.references.entries()) {
    if (subtreeIds.includes(reference.placementId)) {
      const oldRefAddress = reference.address
      const newRefAddress = reference.address.replace(oldPrefix, newAddressPrefix)
      reference.address = newRefAddress
      addressMap.set(oldRefAddress, newRefAddress)
    }
  }

  for (const [, entanglement] of store$.entanglements.entries()) {
    if (subtreeIds.includes(entanglement.placementId)) {
      const oldEntAddress = entanglement.topologyAddress
      const newEntAddress = entanglement.topologyAddress.replace(oldPrefix, newAddressPrefix)
      entanglement.topologyAddress = newEntAddress

      const oldEntanglementAddress = entanglement.entanglementAddress
      entanglement.entanglementAddress = `ent:${entanglement.objectId}@${newEntAddress}`

      indexes$.entanglementAddressIndex.delete(oldEntanglementAddress)
      indexes$.entanglementAddressIndex.set(entanglement.entanglementAddress, entanglement.id)
      addressMap.set(oldEntAddress, newEntAddress)
    }
  }

  return addressMap
}
