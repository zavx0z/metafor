/**
 * `@dark/weak` — structural transformation path домена Dark.
 *
 * Ответственность:
 * - замена фрагментов
 * - удаление placement subtree
 * - вставка фрагментов
 * - перемещение placements
 * - перестройка topology после изменений
 *
 * @see {@link weak$} — явный object store
 */

import type { LocalTopologyFragment } from "../../metafor/dsl/topology.t.ts"
import type {
  GlobalTopologyEntanglement,
  GlobalTopologyLink,
  GlobalTopologyPlacement,
  GlobalTopologyReference,
} from "../gravity/store.t.ts"
import type {
  MovePlacementOptions,
  MovePlacementResult,
  RemovePlacementSubtreeOptions,
  RemovePlacementSubtreeResult,
  ReplaceFragmentOptions,
  ReplaceFragmentResult,
  TopologyMutationResult,
  InsertFragmentAtPlacementOptions,
  InsertFragmentAtPlacementResult,
  RebuildFragmentOptions,
  RebuildFragmentResult,
  WeakMutationStore,
} from "./store.t.ts"
import { gravity$ } from "../gravity/store.ts"
import { strong$ } from "../strong/store.ts"

/**
 * Получить все descendant placement IDs для данного placement.
 */
function getDescendantPlacementIds(
  rootPlacementId: string,
): string[] {
  const descendants: string[] = []
  const queue = [rootPlacementId]

  while (queue.length > 0) {
    const currentId = queue.shift()!
    const current = gravity$.placements.get(currentId)
    if (!current) continue

    for (const [linkId, link] of gravity$.links.entries()) {
      if (link.from === currentId) {
        descendants.push(link.to)
        queue.push(link.to)
      }
    }
  }

  return descendants
}

/**
 * Получить все placement IDs в subtree (включая root).
 */
function getSubtreePlacementIds(
  rootPlacementId: string,
): string[] {
  return [rootPlacementId, ...getDescendantPlacementIds(rootPlacementId)]
}

/**
 * Удалить placement и его индексы из store.
 */
function removePlacement(placementId: string): void {
  const placement = gravity$.placements.get(placementId)
  if (!placement) return

  // Удалить из индексов strong
  strong$.removePlacementIndexes(placement, placement.objectId, placement.meta)

  // Удалить placement
  gravity$.placements.delete(placementId)

  // Удалить связанные links
  for (const [linkId, link] of gravity$.links.entries()) {
    if (link.from === placementId || link.to === placementId) {
      gravity$.links.delete(linkId)
    }
  }
}

/**
 * Удалить reference и его индексы из store.
 */
function removeReference(referenceId: string): void {
  const reference = gravity$.references.get(referenceId)
  if (!reference) return

  // Удалить из индексов strong
  strong$.removeReferenceIndexes(reference, reference.meta)

  // Удалить reference
  gravity$.references.delete(referenceId)
}

/**
 * Удалить entanglement и его индексы из store.
 */
function removeEntanglement(entanglementId: string): void {
  const entanglement = gravity$.entanglements.get(entanglementId)
  if (!entanglement) return

  // Удалить из индексов strong
  strong$.removeEntanglementIndexes(entanglement, entanglement.meta)

  // Удалить entanglement
  gravity$.entanglements.delete(entanglementId)
}

/**
 * Явный object store `@dark/weak`.
 *
 * Источник истины для мутаций topology.
 */
export const weak$ = {
  /**
   * Заменить существующий фрагмент на новый.
   */
  replaceFragment(
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

    // Получить существующие placements для этой meta
    const existingPlacementIds = strong$.getPlacementIdsByMeta(meta)

    // Собрать все placement IDs для удаления (включая descendants)
    const allToRemove = new Set<string>()
    for (const placementId of existingPlacementIds) {
      const placement = gravity$.placements.get(placementId)
      if (placement && !placement.parentId) {
        // Это root placement, удалить весь subtree
        const subtree = getSubtreePlacementIds(placementId)
        subtree.forEach((id) => allToRemove.add(id))
      }
    }

    // Удалить старые placements, references, entanglements
    for (const placementId of allToRemove) {
      const placement = gravity$.placements.get(placementId)
      if (placement) {
        result.removedPlacementIds.push(placementId)
      }
      removePlacement(placementId)
    }

    // Удалить старые references для этой meta
    for (const [referenceId, reference] of gravity$.references.entries()) {
      if (reference.meta === meta) {
        result.removedReferenceIds.push(referenceId)
        removeReference(referenceId)
      }
    }

    // Удалить старые entanglements для этой meta
    for (const [entanglementId, entanglement] of gravity$.entanglements.entries()) {
      if (entanglement.meta === meta) {
        result.removedEntanglementIds.push(entanglementId)
        removeEntanglement(entanglementId)
      }
    }

    // Вставить новый фрагмент через ingest
    const ingested = gravity$.ingestFragment(meta, newFragment, options)
    result.rootPlacementIds = ingested.rootPlacementIds
    result.placementIds = ingested.placementIds
    result.referenceIds = ingested.referenceIds
    result.entanglementIds = ingested.entanglementIds

    return result
  },

  /**
   * Удалить placement subtree и очистить индексы.
   */
  removePlacementSubtree(
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

    // Получить все placements в subtree
    const subtreeIds = getSubtreePlacementIds(rootPlacementId)

    // Собрать связанные references
    const relatedReferenceIds: string[] = []
    if (cascadeReferences) {
      for (const [referenceId, reference] of gravity$.references.entries()) {
        if (subtreeIds.includes(reference.placementId)) {
          relatedReferenceIds.push(referenceId)
        }
      }
    }

    // Собрать связанные entanglements
    const relatedEntanglementIds: string[] = []
    if (cascadeEntanglements) {
      for (const [entanglementId, entanglement] of gravity$.entanglements.entries()) {
        if (subtreeIds.includes(entanglement.placementId)) {
          relatedEntanglementIds.push(entanglementId)
        }
      }
    }

    // Удалить entanglements
    for (const entanglementId of relatedEntanglementIds) {
      result.removedEntanglementIds.push(entanglementId)
      removeEntanglement(entanglementId)
    }

    // Удалить references
    for (const referenceId of relatedReferenceIds) {
      result.removedReferenceIds.push(referenceId)
      removeReference(referenceId)
    }

    // Удалить placements (в обратном порядке, чтобы сначала удалить детей)
    const reversed = [...subtreeIds].reverse()
    for (const placementId of reversed) {
      result.removedPlacementIds.push(placementId)
      removePlacement(placementId)
    }

    return result
  },

  /**
   * Вставить фрагмент в существующий placement.
   */
  insertFragmentAtPlacement(
    parentPlacementId: string,
    fragment: LocalTopologyFragment,
    fragmentMeta: string,
    options: InsertFragmentAtPlacementOptions = {},
  ): InsertFragmentAtPlacementResult {
    // Вставить фрагмент через ingest с parent
    const ingested = gravity$.ingestFragment(fragmentMeta, fragment, {
      parentPlacementId,
      ...options,
    })

    return {
      placementIds: ingested.placementIds,
      referenceIds: ingested.referenceIds,
      entanglementIds: ingested.entanglementIds,
      removedPlacementIds: [],
      removedReferenceIds: [],
      removedEntanglementIds: [],
    }
  },

  /**
   * Переместить placement в новое место.
   */
  movePlacement(
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

    const placement = gravity$.placements.get(placementId)
    if (!placement) {
      throw new Error(`Placement ${placementId} не найден для перемещения.`)
    }

    const newParent = gravity$.placements.get(options.newParentPlacementId)
    if (!newParent) {
      throw new Error(`Parent placement ${options.newParentPlacementId} не найден.`)
    }

    // Получить все descendant placements
    const descendants = getDescendantPlacementIds(placementId)

    // Обновить parent и relation для root перемещаемого placement
    placement.parentId = options.newParentPlacementId
    placement.relation = "contains"

    // Обновить link
    for (const [linkId, link] of gravity$.links.entries()) {
      if (link.to === placementId) {
        link.from = options.newParentPlacementId
        link.relation = "contains"
        break
      }
    }

    // Перестроить адреса если требуется
    if (options.rebuildAddresses !== false) {
      const newPrefix = newParent.address
      const addressMap = this.remapPlacementAddresses(placementId, newPrefix)
      result.newAddresses = addressMap
    }

    return result
  },

  /**
   * Перестроить фрагмент после изменений.
   */
  rebuildFragment(
    meta: string,
    options: RebuildFragmentOptions = {},
  ): RebuildFragmentResult {
    // Stub: перестройка фрагмента
    const placementIds = strong$.getPlacementIdsByMeta(meta)

    return {
      placementIds,
      referenceIds: [],
      entanglementIds: [],
      removedPlacementIds: [],
      removedReferenceIds: [],
      removedEntanglementIds: [],
    }
  },

  /**
   * Отсоединить subtree от parent.
   */
  detachSubtree(placementId: string): string[] {
    const placement = gravity$.placements.get(placementId)
    if (!placement) return []

    // Удалить link к parent
    for (const [linkId, link] of gravity$.links.entries()) {
      if (link.to === placementId) {
        gravity$.links.delete(linkId)
        break
      }
    }

    // Удалить parent reference
    placement.parentId = undefined

    return getSubtreePlacementIds(placementId)
  },

  /**
   * Перестроить адреса placements после перемещения.
   */
  remapPlacementAddresses(
    rootPlacementId: string,
    newAddressPrefix: string,
  ): Map<string, string> {
    const addressMap = new Map<string, string>()
    const root = gravity$.placements.get(rootPlacementId)
    if (!root) return addressMap

    const oldRootAddress = root.address
    const oldPrefix = oldRootAddress
    const newPrefix = newAddressPrefix

    // Обновить адрес root
    const oldAddress = root.address
    root.address = newPrefix
    addressMap.set(oldAddress, newPrefix)

    // Обновить индексы
    strong$.placementAddressIndex.delete(oldAddress)
    strong$.placementAddressIndex.set(newPrefix, root.id)

    // Обновить адреса descendants
    const descendants = getDescendantPlacementIds(rootPlacementId)
    for (const descId of descendants) {
      const desc = gravity$.placements.get(descId)
      if (!desc) continue

      const oldDescAddress = desc.address
      // Заменить префикс
      const newDescAddress = desc.address.replace(oldPrefix, newPrefix)
      desc.address = newDescAddress

      // Обновить индексы
      strong$.placementAddressIndex.delete(oldDescAddress)
      strong$.placementAddressIndex.set(newDescAddress, desc.id)

      addressMap.set(oldDescAddress, newDescAddress)
    }

    // Обновить адреса references в этом subtree
    const subtreeIds = [rootPlacementId, ...descendants]
    for (const [refId, ref] of gravity$.references.entries()) {
      if (subtreeIds.includes(ref.placementId)) {
        const oldRefAddress = ref.address
        const newRefAddress = ref.address.replace(oldPrefix, newPrefix)
        ref.address = newRefAddress
        addressMap.set(oldRefAddress, newRefAddress)
      }
    }

    // Обновить адреса entanglements в этом subtree
    for (const [entId, ent] of gravity$.entanglements.entries()) {
      if (subtreeIds.includes(ent.placementId)) {
        const oldEntAddress = ent.topologyAddress
        const newEntAddress = ent.topologyAddress.replace(oldPrefix, newPrefix)
        ent.topologyAddress = newEntAddress

        const oldEntanglementAddress = ent.entanglementAddress
        ent.entanglementAddress = `ent:${ent.objectId}@${newEntAddress}`

        // Обновить индекс
        strong$.entanglementAddressIndex.delete(oldEntanglementAddress)
        strong$.entanglementAddressIndex.set(ent.entanglementAddress, ent.id)

        addressMap.set(oldEntAddress, newEntAddress)
      }
    }

    return addressMap
  },
} satisfies WeakMutationStore
