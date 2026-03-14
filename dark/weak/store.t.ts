import type { GlobalTopologyIngestOptions } from "../gravity/store.t.ts"

/**
 * Результат мутации скрытой topology.
 *
 * Возвращает IDs всех затронутых и удалённых сущностей:
 * - {@link TopologyMutationResult.placementIds | placementIds} — затронутые размещения
 * - {@link TopologyMutationResult.referenceIds | referenceIds} — затронутые ссылки
 * - {@link TopologyMutationResult.entanglementIds | entanglementIds} — затронутые запутанности
 * - {@link TopologyMutationResult.removedPlacementIds | removedPlacementIds} — удалённые размещения
 * - {@link TopologyMutationResult.removedReferenceIds | removedReferenceIds} — удалённые ссылки
 * - {@link TopologyMutationResult.removedEntanglementIds | removedEntanglementIds} — удалённые запутанности
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
 * Используется в {@link replaceFragment} для указания контекста:
 * - {@link ReplaceFragmentOptions.parentPlacementId | parentPlacementId} — ID родителя
 * - {@link ReplaceFragmentOptions.viaReferenceId | viaReferenceId} — ID ссылки
 * - {@link ReplaceFragmentOptions.rebuildEntanglements | rebuildEntanglements} — перестройка запутанностей
 */
export interface ReplaceFragmentOptions extends GlobalTopologyIngestOptions {
  /** Перестроить entanglement seeds после замены. */
  rebuildEntanglements?: boolean
}

/**
 * Результат замены фрагмента.
 *
 * Возвращает IDs всех созданных и удалённых сущностей:
 * - {@link ReplaceFragmentResult.meta | meta} — адрес заменённого фрагмента
 * - {@link ReplaceFragmentResult.rootPlacementIds | rootPlacementIds} — новые root размещения
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
 * Используется в {@link removePlacementSubtree} для указания cascade-поведения:
 * - {@link RemovePlacementSubtreeOptions.cascadeReferences | cascadeReferences} — удаление references
 * - {@link RemovePlacementSubtreeOptions.cascadeEntanglements | cascadeEntanglements} — удаление entanglements
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
 * Используется в {@link insertFragmentAtPlacement} для указания контекста.
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
 * Используется в {@link movePlacement} для указания нового родителя:
 * - {@link MovePlacementOptions.newParentPlacementId | newParentPlacementId} — новый parent
 * - {@link MovePlacementOptions.rebuildAddresses | rebuildAddresses} — перестройка адресов
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
 * Возвращает IDs перемещённых сущностей и карту новых адресов:
 * - {@link MovePlacementResult.movedPlacementId | movedPlacementId} — перемещённый placement
 * - {@link MovePlacementResult.newAddresses | newAddresses} — карта старых → новые адреса
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
 * Используется в {@link rebuildFragment} для указания типа перестройки:
 * - {@link RebuildFragmentOptions.rebuildIndexes | rebuildIndexes} — перестройка индексов
 * - {@link RebuildFragmentOptions.rebuildEntanglements | rebuildEntanglements} — перестройка запутанностей
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
