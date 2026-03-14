import type {
  GlobalTopologyEntanglement,
  GlobalTopologyPlacement,
  GlobalTopologyReference,
} from "./store.t.ts"
import type { StrongIndexes } from "../strong/store.t.ts"
import { strong$ } from "../strong/store.ts"

interface PlacementAddressLookupState {
  placements: ReadonlyMap<string, GlobalTopologyPlacement>
}

interface ObjectPlacementLookupState {
  placements: ReadonlyMap<string, GlobalTopologyPlacement>
}

interface MetaPlacementLookupState {
  placements: ReadonlyMap<string, GlobalTopologyPlacement>
}

interface MetaSourceLookupState {
  references: ReadonlyMap<string, GlobalTopologyReference>
}

interface EntanglementAddressLookupState {
  entanglements: ReadonlyMap<string, GlobalTopologyEntanglement>
}

interface PlacementChildrenState {
  placements: ReadonlyMap<string, GlobalTopologyPlacement>
}

/**
 * Собирает элементы по IDs из map.
 *
 * @param items — map элементов
 * @param ids — массив IDs для выборки
 * @returns массив найденных элементов (пропускает отсутствующие)
 */
function collectByIds<T>(items: ReadonlyMap<string, T>, ids: readonly string[]): T[] {
  return ids.map((id) => items.get(id)).filter(Boolean) as T[]
}

/**
 * Находит placement по адресу.
 *
 * @param state — состояние с placements
 * @param address — полный адрес размещения
 * @param indexes — strong indexes для lookup (по умолчанию `strong$`)
 * @returns placement или undefined
 */
export function getPlacementByAddress(
  state: PlacementAddressLookupState,
  address: string,
  indexes: Pick<StrongIndexes, "placementAddressIndex"> = strong$,
): GlobalTopologyPlacement | undefined {
  const placementId = indexes.placementAddressIndex.get(address)
  return placementId ? state.placements.get(placementId) : undefined
}

/**
 * Находит все placements объекта.
 *
 * @param state — состояние с placements
 * @param objectId — ID объекта
 * @param indexes — strong indexes для lookup (по умолчанию `strong$`)
 * @returns массив placements
 */
export function getPlacementsByObject(
  state: ObjectPlacementLookupState,
  objectId: string,
  indexes: Pick<StrongIndexes, "objectPlacementsIndex"> = strong$,
): GlobalTopologyPlacement[] {
  return collectByIds(state.placements, indexes.objectPlacementsIndex.get(objectId) ?? [])
}

/**
 * Находит все placements meta-схемы.
 *
 * @param state — состояние с placements
 * @param meta — адрес meta-схемы
 * @param indexes — strong indexes для lookup (по умолчанию `strong$`)
 * @returns массив placements
 */
export function getPlacementsByMeta(
  state: MetaPlacementLookupState,
  meta: string,
  indexes: Pick<StrongIndexes, "sourceMetaIndex"> = strong$,
): GlobalTopologyPlacement[] {
  return collectByIds(state.placements, indexes.sourceMetaIndex.get(meta)?.placementIds ?? [])
}

/**
 * Находит дочерние placements родителя.
 *
 * @param state — состояние с placements
 * @param parentPlacementId — ID родительского размещения
 * @returns массив дочерних placements
 */
export function getChildren(
  state: PlacementChildrenState,
  parentPlacementId: string,
): GlobalTopologyPlacement[] {
  return Array.from(state.placements.values()).filter((placement) => placement.parentId === parentPlacementId)
}

/**
 * Находит все references по источнику.
 *
 * @param state — состояние с references
 * @param metaSource — адрес source meta-схемы
 * @param indexes — strong indexes для lookup (по умолчанию `strong$`)
 * @returns массив references
 */
export function getReferencesBySource(
  state: MetaSourceLookupState,
  metaSource: string,
  indexes: Pick<StrongIndexes, "metaSourceLookup"> = strong$,
): GlobalTopologyReference[] {
  return collectByIds(state.references, indexes.metaSourceLookup.get(metaSource) ?? [])
}

/**
 * Находит entanglement по адресу.
 *
 * @param state — состояние с entanglements
 * @param address — адрес entanglement
 * @param indexes — strong indexes для lookup (по умолчанию `strong$`)
 * @returns entanglement или undefined
 */
export function getEntanglementByAddress(
  state: EntanglementAddressLookupState,
  address: string,
  indexes: Pick<StrongIndexes, "entanglementAddressIndex"> = strong$,
): GlobalTopologyEntanglement | undefined {
  const entanglementId = indexes.entanglementAddressIndex.get(address)
  return entanglementId ? state.entanglements.get(entanglementId) : undefined
}
