import type { LocalTopologyFragment } from "../../metafor/dsl/topology.t.ts"
import type { GlobalTopologyIngestOptions, GlobalTopologyIngestResult } from "../gravity/store.t.ts"

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

/**
 * Контракты мутаций `@dark/weak`.
 *
 * Ответственность:
 * - замена фрагмента
 * - удаление placement subtree
 * - вставка фрагмента в placement
 * - перемещение placement
 * - перестройка фрагмента
 */
export interface WeakMutationStore {
  /**
   * Заменить существующий фрагмент на новый.
   *
   * @param meta — meta адрес фрагмента
   * @param newFragment — новый фрагмент
   * @param options — опции замены
   * @returns результат замены
   */
  replaceFragment(
    meta: string,
    newFragment: LocalTopologyFragment,
    options?: ReplaceFragmentOptions,
  ): ReplaceFragmentResult

  /**
   * Удалить placement subtree и очистить индексы.
   *
   * @param rootPlacementId — корневой placement для удаления
   * @param options — опции удаления
   * @returns результат удаления
   */
  removePlacementSubtree(
    rootPlacementId: string,
    options?: RemovePlacementSubtreeOptions,
  ): RemovePlacementSubtreeResult

  /**
   * Вставить фрагмент в существующий placement.
   *
   * @param parentPlacementId — parent placement
   * @param fragment — вставляемый фрагмент
   * @param fragmentMeta — meta вставляемого фрагмента
   * @param options — опции вставки
   * @returns результат вставки
   */
  insertFragmentAtPlacement(
    parentPlacementId: string,
    fragment: LocalTopologyFragment,
    fragmentMeta: string,
    options?: InsertFragmentAtPlacementOptions,
  ): InsertFragmentAtPlacementResult

  /**
   * Переместить placement в новое место.
   *
   * @param placementId — перемещаемый placement
   * @param options — опции перемещения
   * @returns результат перемещения
   */
  movePlacement(
    placementId: string,
    options: MovePlacementOptions,
  ): MovePlacementResult

  /**
   * Перестроить фрагмент после изменений.
   *
   * @param meta — meta фрагмента
   * @param options — опции перестройки
   * @returns результат перестройки
   */
  rebuildFragment(
    meta: string,
    options?: RebuildFragmentOptions,
  ): RebuildFragmentResult

  /**
   * Отсоединить subtree от parent.
   *
   * @param placementId — root subtree для отсоединения
   * @returns IDs отсоединённых placements
   */
  detachSubtree(placementId: string): string[]

  /**
   * Перестроить адреса placements после перемещения.
   *
   * @param rootPlacementId — корневой placement для перестройки
   * @param newAddressPrefix — новый префикс адреса
   * @returns карта старых -> новых адресов
   */
  remapPlacementAddresses(
    rootPlacementId: string,
    newAddressPrefix: string,
  ): Map<string, string>
}
