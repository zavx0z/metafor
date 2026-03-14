import type { DarkStore, DarkGravityStore } from "@dark/types"
import type { DarkStrongStore } from "@dark/types/strong"
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
} from "@dark/types/weak"
import type { LocalTopologyFragment } from "@metafor/dsl/types"
import { ingestFragment } from "@dark/gravity"
import { getPlacementIdsByMeta, removeEntanglementIndexes, removePlacementIndexes, removeReferenceIndexes } from "@dark/strong"

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
 * @param dark$ — dark store
 * @param placementId — ID размещения для удаления
 * @param strong$ — strong indexes
 */
function removePlacement(dark$: DarkStore, placementId: string, strong$: DarkStrongStore): void {
  const placement = dark$.getPlacement(placementId)
  if (!placement) return

  removePlacementIndexes(placement, placement.objectId, placement.meta, strong$)
  dark$.deletePlacement(placementId)

  for (const [linkId, link] of dark$.links.entries()) {
    if (link.from === placementId || link.to === placementId) {
      dark$.deleteLink(linkId)
    }
  }
}

/**
 * Удаляет reference и индексы.
 *
 * @param dark$ — dark store
 * @param referenceId — ID ссылки для удаления
 * @param strong$ — strong indexes
 */
function removeReference(dark$: DarkStore, referenceId: string, strong$: DarkStrongStore): void {
  const reference = dark$.getReference(referenceId)
  if (!reference) return

  removeReferenceIndexes(reference, reference.meta, strong$)
  dark$.deleteReference(referenceId)
}

/**
 * Удаляет entanglement и индексы.
 *
 * @param dark$ — dark store
 * @param entanglementId — ID запутанности для удаления
 * @param strong$ — strong indexes
 */
function removeEntanglement(dark$: DarkStore, entanglementId: string, strong$: DarkStrongStore): void {
  const entanglement = dark$.getEntanglement(entanglementId)
  if (!entanglement) return

  removeEntanglementIndexes(entanglement, entanglement.meta, strong$)
  dark$.deleteEntanglement(entanglementId)
}

/**
 * Заменяет фрагмент meta-схемы на новый.
 *
 * Удаляет все существующие сущности meta и вставляет новый фрагмент.
 *
 * @param meta — адрес meta-схемы для замены
 * @param newFragment — новый local topology fragment
 * @param options — опции замены (по умолчанию `{}`)
 * @param dark$ — dark store (по умолчанию `dark$`)
 * @param gravity$ — gravity store (по умолчанию `gravity$`)
 * @param strong$ — strong indexes
 * @returns результат замены с IDs созданных и удалённых сущностей
 */
export function replaceFragment(
  dark$: DarkStore,
  gravity$: DarkGravityStore,
  strong$: DarkStrongStore,
  meta: string,
  newFragment: LocalTopologyFragment,
  options: ReplaceFragmentOptions = {},
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

  const existingPlacementIds = getPlacementIdsByMeta(meta, strong$)
  const allToRemove = new Set<string>()

  for (const placementId of existingPlacementIds) {
    const placement = dark$.getPlacement(placementId)
    if (placement && !placement.parentId) {
      for (const subtreeId of getSubtreePlacementIds(dark$, placementId)) {
        allToRemove.add(subtreeId)
      }
    }
  }

  for (const placementId of allToRemove) {
    if (dark$.getPlacement(placementId)) {
      result.removedPlacementIds.push(placementId)
    }
    removePlacement(dark$, placementId, strong$)
  }

  for (const [referenceId, reference] of dark$.references.entries()) {
    if (reference.meta === meta) {
      result.removedReferenceIds.push(referenceId)
      removeReference(dark$, referenceId, strong$)
    }
  }

  for (const [entanglementId, entanglement] of dark$.entanglements.entries()) {
    if (entanglement.meta === meta) {
      result.removedEntanglementIds.push(entanglementId)
      removeEntanglement(dark$, entanglementId, strong$)
    }
  }

  const ingested = ingestFragment(dark$, gravity$, strong$, meta, newFragment, options)
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
 * @param dark$ — dark store
 * @param strong$ — strong indexes
 * @returns результат удаления с IDs удалённых сущностей
 */
export function removePlacementSubtree(
  dark$: DarkStore,
  strong$: DarkStrongStore,
  rootPlacementId: string,
  options: RemovePlacementSubtreeOptions = {},
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
  const subtreeIds = getSubtreePlacementIds(dark$, rootPlacementId)

  const relatedReferenceIds: string[] = []
  if (cascadeReferences) {
    for (const [referenceId, reference] of dark$.references.entries()) {
      if (subtreeIds.includes(reference.placementId)) {
        relatedReferenceIds.push(referenceId)
      }
    }
  }

  const relatedEntanglementIds: string[] = []
  if (cascadeEntanglements) {
    for (const [entanglementId, entanglement] of dark$.entanglements.entries()) {
      if (subtreeIds.includes(entanglement.placementId)) {
        relatedEntanglementIds.push(entanglementId)
      }
    }
  }

  for (const entanglementId of relatedEntanglementIds) {
    result.removedEntanglementIds.push(entanglementId)
    removeEntanglement(dark$, entanglementId, strong$)
  }

  for (const referenceId of relatedReferenceIds) {
    result.removedReferenceIds.push(referenceId)
    removeReference(dark$, referenceId, strong$)
  }

  for (const placementId of [...subtreeIds].reverse()) {
    result.removedPlacementIds.push(placementId)
    removePlacement(dark$, placementId, strong$)
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
 * @param dark$ — dark store
 * @param gravity$ — gravity store
 * @param strong$ — strong indexes
 * @returns результат вставки с IDs созданных сущностей
 */
export function insertFragmentAtPlacement(
  dark$: DarkStore,
  gravity$: DarkGravityStore,
  strong$: DarkStrongStore,
  parentPlacementId: string,
  fragment: LocalTopologyFragment,
  fragmentMeta: string,
  options: InsertFragmentAtPlacementOptions = {},
): InsertFragmentAtPlacementResult {
  const ingested = ingestFragment(
    dark$,
    gravity$,
    strong$,
    fragmentMeta,
    fragment,
    {
      parentPlacementId,
      ...options,
    },
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
 * @param dark$ — dark store
 * @param strong$ — strong indexes
 * @returns результат перемещения с новыми адресами
 */
export function movePlacement(
  dark$: DarkStore,
  strong$: DarkStrongStore,
  placementId: string,
  options: MovePlacementOptions,
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

  const placement = dark$.getPlacement(placementId)
  if (!placement) {
    throw new Error(`Placement ${placementId} не найден для перемещения.`)
  }

  const newParent = dark$.getPlacement(options.newParentPlacementId)
  if (!newParent) {
    throw new Error(`Parent placement ${options.newParentPlacementId} не найден.`)
  }

  placement.parentId = options.newParentPlacementId
  placement.relation = "contains"

  for (const [, link] of dark$.links.entries()) {
    if (link.to === placementId) {
      link.from = options.newParentPlacementId
      link.relation = "contains"
      break
    }
  }

  if (options.rebuildAddresses !== false) {
    result.newAddresses = remapPlacementAddresses(dark$, strong$, placementId, newParent.address)
  }

  return result
}

/**
 * Перестраивает fragment по meta.
 *
 * @param meta — адрес meta-схемы
 * @param options — опции перестройки (по умолчанию `{}`)
 * @param strong$ — strong indexes
 * @returns результат перестройки с IDs сущностей
 */
export function rebuildFragment(
  strong$: Pick<DarkStrongStore, "sourceMetaIndex">,
  meta: string,
  options: RebuildFragmentOptions = {},
): RebuildFragmentResult {
  void options
  return {
    placementIds: getPlacementIdsByMeta(meta, strong$),
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
 * @param dark$ — dark store
 * @returns массив IDs всех placements в отсоединённом subtree
 */
export function detachSubtree(dark$: DarkStore, placementId: string): string[] {
  const placement = dark$.getPlacement(placementId)
  if (!placement) return []

  for (const [linkId, link] of dark$.links.entries()) {
    if (link.to === placementId) {
      dark$.deleteLink(linkId)
      break
    }
  }

  delete placement.parentId

  return getSubtreePlacementIds(dark$, placementId)
}

/**
 * Перестраивает адреса subtree.
 *
 * @param rootPlacementId — ID корневого размещения
 * @param newAddressPrefix — новый префикс адреса
 * @param dark$ — dark store
 * @param strong$ — strong indexes
 * @returns карту старых адресов → новые адреса
 */
export function remapPlacementAddresses(
  dark$: DarkStore,
  strong$: DarkStrongStore,
  rootPlacementId: string,
  newAddressPrefix: string,
): Map<string, string> {
  const addressMap = new Map<string, string>()
  const root = dark$.getPlacement(rootPlacementId)
  if (!root) return addressMap

  const oldPrefix = root.address
  root.address = newAddressPrefix
  addressMap.set(oldPrefix, newAddressPrefix)

  strong$.placementAddressIndex.delete(oldPrefix)
  strong$.placementAddressIndex.set(newAddressPrefix, root.id)

  const descendants = getDescendantPlacementIds(dark$, rootPlacementId)
  for (const descId of descendants) {
    const desc = dark$.getPlacement(descId)
    if (!desc) continue

    const oldDescAddress = desc.address
    const newDescAddress = desc.address.replace(oldPrefix, newAddressPrefix)
    desc.address = newDescAddress

    strong$.placementAddressIndex.delete(oldDescAddress)
    strong$.placementAddressIndex.set(newDescAddress, desc.id)
    addressMap.set(oldDescAddress, newDescAddress)
  }

  const subtreeIds = [rootPlacementId, ...descendants]
  for (const [, reference] of dark$.references.entries()) {
    if (subtreeIds.includes(reference.placementId)) {
      const oldRefAddress = reference.address
      const newRefAddress = reference.address.replace(oldPrefix, newAddressPrefix)
      reference.address = newRefAddress
      addressMap.set(oldRefAddress, newRefAddress)
    }
  }

  for (const [, entanglement] of dark$.entanglements.entries()) {
    if (subtreeIds.includes(entanglement.placementId)) {
      const oldEntAddress = entanglement.topologyAddress
      const newEntAddress = entanglement.topologyAddress.replace(oldPrefix, newAddressPrefix)
      entanglement.topologyAddress = newEntAddress

      const oldEntanglementAddress = entanglement.entanglementAddress
      entanglement.entanglementAddress = `ent:${entanglement.objectId}@${newEntAddress}`

      strong$.entanglementAddressIndex.delete(oldEntanglementAddress)
      strong$.entanglementAddressIndex.set(entanglement.entanglementAddress, entanglement.id)
      addressMap.set(oldEntAddress, newEntAddress)
    }
  }

  return addressMap
}
