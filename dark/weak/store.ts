/**
 * `@dark/weak` — structural transformation path домена Dark.
 *
 * Ответственность:
 * - замена фрагментов
 * - удаление placement subtree
 * - вставка фрагментов
 * - перемещение placements
 * - перестройка topology после изменений
 */

import type { LocalTopologyFragment } from "../../metafor/dsl/topology.t.ts"
import type {
  GlobalTopologyEntanglement,
  GlobalTopologyLink,
  GlobalTopologyPlacement,
  GlobalTopologyReference,
  GlobalTopologyStore,
} from "../gravity/store.t.ts"
import type {
  MovePlacementOptions,
  MovePlacementResult,
  RemovePlacementSubtreeOptions,
  RemovePlacementSubtreeResult,
  ReplaceFragmentOptions,
  ReplaceFragmentResult,
  WeakMutationStore,
} from "./store.t.ts"
import { getPlacementIdByAddress, getPlacementIdsByObject } from "../strong/store.ts"
import type { StrongIndexStore } from "../strong/store.t.ts"

/**
 * Получить все descendant placement IDs для данного placement.
 */
function getDescendantPlacementIds(
  store: GlobalTopologyStore,
  rootPlacementId: string,
): string[] {
  const descendants: string[] = []
  const queue = [rootPlacementId]

  while (queue.length > 0) {
    const currentId = queue.shift()!
    const current = store.placements.get(currentId)
    if (!current) continue

    for (const [linkId, link] of store.links.entries()) {
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
  store: GlobalTopologyStore,
  rootPlacementId: string,
): string[] {
  return [rootPlacementId, ...getDescendantPlacementIds(store, rootPlacementId)]
}

/**
 * Удалить placement и его индексы из store.
 */
function removePlacement(
  store: GlobalTopologyStore,
  strongIndex: StrongIndexStore,
  placementId: string,
): void {
  const placement = store.placements.get(placementId)
  if (!placement) return

  // Удалить из индексов strong
  strongIndex.removePlacementIndexes(placement, placement.objectId, placement.meta)

  // Удалить placement
  store.placements.delete(placementId)

  // Удалить связанные links
  for (const [linkId, link] of store.links.entries()) {
    if (link.from === placementId || link.to === placementId) {
      store.links.delete(linkId)
    }
  }
}

/**
 * Удалить reference и его индексы из store.
 */
function removeReference(
  store: GlobalTopologyStore,
  strongIndex: StrongIndexStore,
  referenceId: string,
): void {
  const reference = store.references.get(referenceId)
  if (!reference) return

  // Удалить из индексов strong
  strongIndex.removeReferenceIndexes(reference, reference.meta)

  // Удалить reference
  store.references.delete(referenceId)
}

/**
 * Удалить entanglement и его индексы из store.
 */
function removeEntanglement(
  store: GlobalTopologyStore,
  strongIndex: StrongIndexStore,
  entanglementId: string,
): void {
  const entanglement = store.entanglements.get(entanglementId)
  if (!entanglement) return

  // Удалить из индексов strong
  strongIndex.removeEntanglementIndexes(entanglement, entanglement.meta)

  // Удалить entanglement
  store.entanglements.delete(entanglementId)
}

/**
 * Создать store мутаций `@dark/weak`.
 */
export function createWeakMutationStore(
  topologyStore: GlobalTopologyStore,
  strongIndex: StrongIndexStore,
): WeakMutationStore {
  return {
    replaceFragment(meta, newFragment, options = {}) {
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
      const existingPlacementIds = strongIndex.getPlacementIdsByMeta(meta)

      // Собрать все placement IDs для удаления (включая descendants)
      const allToRemove = new Set<string>()
      for (const placementId of existingPlacementIds) {
        const placement = topologyStore.placements.get(placementId)
        if (placement && !placement.parentId) {
          // Это root placement, удалить весь subtree
          const subtree = getSubtreePlacementIds(topologyStore, placementId)
          subtree.forEach((id) => allToRemove.add(id))
        }
      }

      // Удалить старые placements, references, entanglements
      for (const placementId of allToRemove) {
        const placement = topologyStore.placements.get(placementId)
        if (placement) {
          result.removedPlacementIds.push(placementId)
        }
        removePlacement(topologyStore, strongIndex, placementId)
      }

      // Удалить старые references для этой meta
      for (const [referenceId, reference] of topologyStore.references.entries()) {
        if (reference.meta === meta) {
          result.removedReferenceIds.push(referenceId)
          removeReference(topologyStore, strongIndex, referenceId)
        }
      }

      // Удалить старые entanglements для этой meta
      for (const [entanglementId, entanglement] of topologyStore.entanglements.entries()) {
        if (entanglement.meta === meta) {
          result.removedEntanglementIds.push(entanglementId)
          removeEntanglement(topologyStore, strongIndex, entanglementId)
        }
      }

      // Вставить новый фрагмент через ingest
      const ingested = topologyStore.ingestFragment(meta, newFragment, options)
      result.rootPlacementIds = ingested.rootPlacementIds
      result.placementIds = ingested.placementIds
      result.referenceIds = ingested.referenceIds
      result.entanglementIds = ingested.entanglementIds

      return result
    },

    removePlacementSubtree(rootPlacementId, options = {}) {
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
      const subtreeIds = getSubtreePlacementIds(topologyStore, rootPlacementId)

      // Собрать связанные references
      const relatedReferenceIds: string[] = []
      if (cascadeReferences) {
        for (const [referenceId, reference] of topologyStore.references.entries()) {
          if (subtreeIds.includes(reference.placementId)) {
            relatedReferenceIds.push(referenceId)
          }
        }
      }

      // Собрать связанные entanglements
      const relatedEntanglementIds: string[] = []
      if (cascadeEntanglements) {
        for (const [entanglementId, entanglement] of topologyStore.entanglements.entries()) {
          if (subtreeIds.includes(entanglement.placementId)) {
            relatedEntanglementIds.push(entanglementId)
          }
        }
      }

      // Удалить entanglements
      for (const entanglementId of relatedEntanglementIds) {
        result.removedEntanglementIds.push(entanglementId)
        removeEntanglement(topologyStore, strongIndex, entanglementId)
      }

      // Удалить references
      for (const referenceId of relatedReferenceIds) {
        result.removedReferenceIds.push(referenceId)
        removeReference(topologyStore, strongIndex, referenceId)
      }

      // Удалить placements (в обратном порядке, чтобы сначала удалить детей)
      const reversed = [...subtreeIds].reverse()
      for (const placementId of reversed) {
        result.removedPlacementIds.push(placementId)
        removePlacement(topologyStore, strongIndex, placementId)
      }

      return result
    },

    insertFragmentAtPlacement(parentPlacementId, fragment, fragmentMeta, options = {}) {
      // Вставить фрагмент через ingest с parent
      const ingested = topologyStore.ingestFragment(fragmentMeta, fragment, {
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

    movePlacement(placementId, options) {
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

      const placement = topologyStore.placements.get(placementId)
      if (!placement) {
        throw new Error(`Placement ${placementId} не найден для перемещения.`)
      }

      const newParent = topologyStore.placements.get(options.newParentPlacementId)
      if (!newParent) {
        throw new Error(`Parent placement ${options.newParentPlacementId} не найден.`)
      }

      // Получить все descendant placements
      const descendants = getDescendantPlacementIds(topologyStore, placementId)
      const allMoved = [placementId, ...descendants]

      // Обновить parent и relation для root перемещаемого placement
      const oldParentId = placement.parentId
      placement.parentId = options.newParentPlacementId
      placement.relation = "contains"

      // Обновить link
      for (const [linkId, link] of topologyStore.links.entries()) {
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

    rebuildFragment(meta, options = {}) {
      // Stub: перестройка фрагмента
      const placementIds = strongIndex.getPlacementIdsByMeta(meta)

      return {
        placementIds,
        referenceIds: [],
        entanglementIds: [],
        removedPlacementIds: [],
        removedReferenceIds: [],
        removedEntanglementIds: [],
      }
    },

    detachSubtree(placementId) {
      const placement = topologyStore.placements.get(placementId)
      if (!placement) return []

      // Удалить link к parent
      for (const [linkId, link] of topologyStore.links.entries()) {
        if (link.to === placementId) {
          topologyStore.links.delete(linkId)
          break
        }
      }

      // Удалить parent reference
      placement.parentId = undefined

      return getSubtreePlacementIds(topologyStore, placementId)
    },

    remapPlacementAddresses(rootPlacementId, newAddressPrefix) {
      const addressMap = new Map<string, string>()
      const root = topologyStore.placements.get(rootPlacementId)
      if (!root) return addressMap

      const oldRootAddress = root.address
      const oldPrefix = oldRootAddress
      const newPrefix = newAddressPrefix

      // Обновить адрес root
      const oldAddress = root.address
      root.address = newPrefix
      addressMap.set(oldAddress, newPrefix)

      // Обновить индексы
      strongIndex.placementAddressIndex.delete(oldAddress)
      strongIndex.placementAddressIndex.set(newPrefix, root.id)

      // Обновить адреса descendants
      const descendants = getDescendantPlacementIds(topologyStore, rootPlacementId)
      for (const descId of descendants) {
        const desc = topologyStore.placements.get(descId)
        if (!desc) continue

        const oldDescAddress = desc.address
        // Заменить префикс
        const newDescAddress = desc.address.replace(oldPrefix, newPrefix)
        desc.address = newDescAddress

        // Обновить индексы
        strongIndex.placementAddressIndex.delete(oldDescAddress)
        strongIndex.placementAddressIndex.set(newDescAddress, desc.id)

        addressMap.set(oldDescAddress, newDescAddress)
      }

      // Обновить адреса references в этом subtree
      const subtreeIds = [rootPlacementId, ...descendants]
      for (const [refId, ref] of topologyStore.references.entries()) {
        if (subtreeIds.includes(ref.placementId)) {
          const oldRefAddress = ref.address
          const newRefAddress = ref.address.replace(oldPrefix, newPrefix)
          ref.address = newRefAddress
          addressMap.set(oldRefAddress, newRefAddress)
        }
      }

      // Обновить адреса entanglements в этом subtree
      for (const [entId, ent] of topologyStore.entanglements.entries()) {
        if (subtreeIds.includes(ent.placementId)) {
          const oldEntAddress = ent.topologyAddress
          const newEntAddress = ent.topologyAddress.replace(oldPrefix, newPrefix)
          ent.topologyAddress = newEntAddress

          const oldEntanglementAddress = ent.entanglementAddress
          ent.entanglementAddress = `ent:${ent.objectId}@${newEntAddress}`

          // Обновить индекс
          strongIndex.entanglementAddressIndex.delete(oldEntanglementAddress)
          strongIndex.entanglementAddressIndex.set(ent.entanglementAddress, ent.id)

          addressMap.set(oldEntAddress, newEntAddress)
        }
      }

      return addressMap
    },
  }
}

/**
 * Синглтон мутаций `@dark/weak`.
 *
 * Требует инициализации через setTopologyStore перед использованием.
 */
let _topologyStore: GlobalTopologyStore | null = null
let _strongIndex: StrongIndexStore | null = null

export function initWeakMutationStore(
  topologyStore: GlobalTopologyStore,
  strongIndex: StrongIndexStore,
): WeakMutationStore {
  _topologyStore = topologyStore
  _strongIndex = strongIndex
  return createWeakMutationStore(topologyStore, strongIndex)
}

export const weakMutation$ = {
  replaceFragment: notInitialized,
  removePlacementSubtree: notInitialized,
  insertFragmentAtPlacement: notInitialized,
  movePlacement: notInitialized,
  rebuildFragment: notInitialized,
  detachSubtree: notInitialized,
  remapPlacementAddresses: notInitialized,
}

function notInitialized(): never {
  throw new Error(
    "@dark/weak не инициализирован. Вызовите initWeakMutationStore(topology$, strongIndex$) перед использованием.",
  )
}
