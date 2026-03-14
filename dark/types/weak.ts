import type { GlobalTopologyIngestOptions } from "./shared.ts"

/**
 * Результат мутации скрытой topology.
 *
 * Возвращает IDs всех затронутых и удалённых сущностей.
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
 *
 * Используется в `replaceFragment` для указания контекста.
 */
export interface ReplaceFragmentOptions extends GlobalTopologyIngestOptions {
  /** Перестроить entanglement seeds после замены. */
  rebuildEntanglements?: boolean
}

/**
 * Результат замены фрагмента.
 *
 * Возвращает IDs всех созданных и удалённых сущностей.
 */
export interface ReplaceFragmentResult extends TopologyMutationResult {
  /** Meta заменённого фрагмента. */
  meta: string

  /** Новые root placement IDs. */
  rootPlacementIds: string[]
}

/**
 * Опции для удаления placement subtree.
 *
 * Используется в `removePlacementSubtree` для указания cascade-поведения.
 */
export interface RemovePlacementSubtreeOptions {
  /** Удалить также связанные references. */
  cascadeReferences?: boolean

  /** Удалить также связанные entanglements. */
  cascadeEntanglements?: boolean
}

/**
 * Результат удаления placement subtree.
 *
 * Возвращает IDs всех удалённых сущностей.
 */
export interface RemovePlacementSubtreeResult extends TopologyMutationResult {}

/**
 * Опции для вставки фрагмента.
 *
 * Используется в `insertFragmentAtPlacement` для указания контекста.
 */
export interface InsertFragmentAtPlacementOptions extends GlobalTopologyIngestOptions {}

/**
 * Результат вставки фрагмента.
 *
 * Возвращает IDs всех созданных сущностей.
 */
export interface InsertFragmentAtPlacementResult extends TopologyMutationResult {}

/**
 * Опции для перемещения placement.
 *
 * Используется в `movePlacement` для указания нового родителя.
 */
export interface MovePlacementOptions {
  /** Новый parent placement ID. */
  newParentPlacementId: string

  /** Перестроить адреса после перемещения. */
  rebuildAddresses?: boolean
}

/**
 * Результат перемещения placement.
 *
 * Возвращает IDs перемещённых сущностей и карту новых адресов.
 */
export interface MovePlacementResult extends TopologyMutationResult {
  /** Перемещённый placement ID. */
  movedPlacementId: string

  /** Новые адреса для перемещённого placement и потомков. */
  newAddresses: Map<string, string>
}

/**
 * Опции для перестройки фрагмента.
 *
 * Используется в `rebuildFragment` для указания типа перестройки.
 */
export interface RebuildFragmentOptions {
  /** Перестроить индексы. */
  rebuildIndexes?: boolean

  /** Перестроить entanglement seeds. */
  rebuildEntanglements?: boolean
}

/**
 * Результат перестройки фрагмента.
 *
 * Возвращает IDs всех сущностей фрагмента.
 */
export interface RebuildFragmentResult extends TopologyMutationResult {}
