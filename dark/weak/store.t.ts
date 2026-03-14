import type { GlobalTopologyIngestOptions } from "../gravity/store.t.ts"

/**
 * Результат мутации скрытой topology.
 */
export interface TopologyMutationResult {
  /** Затронутые placement IDs. */
  placementIds: string[]

  /** Затронутые reference IDs. */
  referenceIds: string[]

  /** Затронутые entanglement IDs. */
  entanglementIds: string[]

  /** Удалённые placement IDs. */
  removedPlacementIds: string[]

  /** Удалённые reference IDs. */
  removedReferenceIds: string[]

  /** Удалённые entanglement IDs. */
  removedEntanglementIds: string[]
}

/**
 * Опции для замены фрагмента.
 */
export interface ReplaceFragmentOptions extends GlobalTopologyIngestOptions {
  /** Перестроить entanglement seeds после замены. */
  rebuildEntanglements?: boolean
}

/**
 * Результат замены фрагмента.
 */
export interface ReplaceFragmentResult extends TopologyMutationResult {
  /** Meta заменённого фрагмента. */
  meta: string

  /** Новые root placement IDs. */
  rootPlacementIds: string[]
}

/**
 * Опции для удаления placement subtree.
 */
export interface RemovePlacementSubtreeOptions {
  /** Удалить также связанные references. */
  cascadeReferences?: boolean

  /** Удалить также связанные entanglements. */
  cascadeEntanglements?: boolean
}

/**
 * Результат удаления placement subtree.
 */
export interface RemovePlacementSubtreeResult extends TopologyMutationResult {}

/**
 * Опции для вставки фрагмента.
 */
export interface InsertFragmentAtPlacementOptions extends GlobalTopologyIngestOptions {}

/**
 * Результат вставки фрагмента.
 */
export interface InsertFragmentAtPlacementResult extends TopologyMutationResult {}

/**
 * Опции для перемещения placement.
 */
export interface MovePlacementOptions {
  /** Новый parent placement ID. */
  newParentPlacementId: string

  /** Перестроить адреса после перемещения. */
  rebuildAddresses?: boolean
}

/**
 * Результат перемещения placement.
 */
export interface MovePlacementResult extends TopologyMutationResult {
  /** Перемещённый placement ID. */
  movedPlacementId: string

  /** Новые адреса для перемещённого placement и потомков. */
  newAddresses: Map<string, string>
}

/**
 * Опции для перестройки фрагмента.
 */
export interface RebuildFragmentOptions {
  /** Перестроить индексы. */
  rebuildIndexes?: boolean

  /** Перестроить entanglement seeds. */
  rebuildEntanglements?: boolean
}

/**
 * Результат перестройки фрагмента.
 */
export interface RebuildFragmentResult extends TopologyMutationResult {}
