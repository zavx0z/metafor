/**
 * `@dark/weak` — structural transformation path домена Dark.
 *
 * **Сила Weak в Dark (`Dark × Weak`):**
 * - эволюция схем и активный скрытый переход через `W boson`
 * - нейтральная переходная медиция через `Z boson`
 * - мутация и преобразование скрытой структуры
 * - перестройка скрытой организации через структурированные изменения
 * - изменение модели до её проекций в `Boundary` и `Bulk`
 *
 * **Ответственность пакета:**
 * - structural transformation path — путь структурной трансформации
 * - graph transition preparation — подготовка перехода графа
 * - topology mutation — мутация topology через `Higgs boson`
 * - structured change — структурированные изменения
 *
 * Мутации topology объявлены как функции уровня пакета в `weak.ts`.
 * Не дублирует вычисление transition runtime-состояния из `boundary/weak`.
 *
 * @see {@link https://github.com/zavx0z/metafor/blob/main/docs/ONTOLOGY.md#dark--weak | ONTOLOGY.md} — онтология Dark × Weak
 * @see {@link https://github.com/zavx0z/metafor/blob/main/docs/ARCHITECTURE.md#dark--weak | ARCHITECTURE.md} — архитектура Dark × Weak
 * @see {@link https://github.com/zavx0z/metafor/blob/main/docs/proto/weak.md | proto/weak.md} — протокол Weak и W/Z boson
 * @see {@link https://github.com/zavx0z/metafor/blob/main/docs/proto/higgs.md | proto/higgs.md} — протокол Higgs и topology-field change
 */

export {
  detachSubtree,
  insertFragmentAtPlacement,
  movePlacement,
  rebuildFragment,
  remapPlacementAddresses,
  removePlacementSubtree,
  replaceFragment,
} from "./weak.ts"
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
} from "./store.t.ts"
