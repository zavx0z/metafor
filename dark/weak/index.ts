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
 * @see {@link initWeakMutationStore} — инициализация с topology и strong index dependencies
 * @see {@link createWeakMutationStore} — создание нового mutation store
 */

export { initWeakMutationStore, createWeakMutationStore, weakMutation$ } from "./store.ts"
export type {
  TopologyMutationResult,
  ReplaceFragmentOptions,
  ReplaceFragmentResult,
  RemovePlacementSubtreeOptions,
  RemovePlacementSubtreeResult,
  InsertFragmentAtPlacementOptions,
  InsertFragmentAtPlacementResult,
  MovePlacementOptions,
  MovePlacementResult,
  RebuildFragmentOptions,
  RebuildFragmentResult,
  WeakMutationStore,
} from "./store.t.ts"
