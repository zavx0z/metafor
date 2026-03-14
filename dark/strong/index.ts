/**
 * `@dark/strong` — graph cohesion и relation retention домена Dark.
 *
 * **Сила Strong в Dark (`Dark × Strong`):**
 * - постоянство структурной памяти и согласованность схем
 * - изменение значений ordinary `Field` через `Gluon` без разрыва связности
 * - согласованность зафиксированных состояний и исторической преемственности
 * - удержание скрытой структурной рамки и скрытой устойчивости идентичности
 *
 * **Ответственность пакета:**
 * - graph cohesion — сцепление графа
 * - relation retention — удержание отношений
 * - stable linked flat form — стабильная связанная плоская форма
 * - index orchestration и lookup — оркестрация индексов и поиск
 *
 * `strong$` держит индексное промежуточное состояние.
 * Не дублирует каноникализацию `boundary/strong` (deduplication, string interning).
 *
 * @see {@link https://github.com/zavx0z/metafor/blob/main/docs/ONTOLOGY.md#dark--strong | ONTOLOGY.md} — онтология Dark × Strong
 * @see {@link https://github.com/zavx0z/metafor/blob/main/docs/ARCHITECTURE.md#dark--strong | ARCHITECTURE.md} — архитектура Dark × Strong
 * @see {@link https://github.com/zavx0z/metafor/blob/main/docs/proto/strong.md | proto/strong.md} — протокол Strong и Gluon
 */

export { strong$ } from "./store.ts"
export {
  getEntanglementIdByAddress,
  getPlacementIdByAddress,
  getPlacementIdsByMeta,
  getPlacementIdsByObject,
  getReferenceIdsBySource,
  hasReferenceBySource,
  indexEntanglement,
  indexObject,
  indexPlacement,
  indexReference,
  isPlacementIndexed,
  removeEntanglementIndexes,
  removeObjectIndex,
  removePlacementIndexes,
  removeReferenceIndexes,
} from "./strong.ts"
export type {
  GlobalTopologyMetaIndex,
  StrongIndexes,
  StrongIndexStore,
  StrongIndexesSnapshot,
  PlacementLookupResult,
  ReferenceLookupResult,
} from "./store.t.ts"
