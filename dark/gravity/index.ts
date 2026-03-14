/**
 * `@dark/gravity` — world assembly домена Dark.
 *
 * **Сила Gravity в Dark (`Dark × Gravity`):**
 * - скрытая иерархия и канал `Graviton` как внутренний протокол скрытой организации
 * - организация схем и глубокая структурная локализация
 * - геометрия скрытых версий и их преемственности
 * - структурная различимость, которую нельзя смешивать с индексом времени исполнения
 *
 * **Ответственность пакета:**
 * - schema loading — загрузка meta-схем
 * - graph geometry — геометрия графа
 * - path formation и primary addressing — формирование путей и адресация
 * - graph flattening — уплощение графа с сохранением отношений
 *
 * `gravity$` держит промежуточное состояние assembly-слоя.
 * Не является источником исполнения и не дублирует `boundary/gravity` или `bulk/gravity`.
 *
 * @see {@link https://github.com/zavx0z/metafor/blob/main/docs/ONTOLOGY.md#dark--gravity | ONTOLOGY.md} — онтология Dark × Gravity
 * @see {@link https://github.com/zavx0z/metafor/blob/main/docs/ARCHITECTURE.md#dark--gravity | ARCHITECTURE.md} — архитектура Dark × Gravity
 * @see {@link https://github.com/zavx0z/metafor/blob/main/docs/TOPOLOGY.md | TOPOLOGY.md} — topology как скрытая карта построения
 * @see {@link https://github.com/zavx0z/metafor/blob/main/docs/proto/gravity.md | proto/gravity.md} — протокол Gravity
 */

export { gravity$ } from "./store.ts"
export {
  getChildren,
  getEntanglementByAddress,
  getPlacementByAddress,
  getPlacementsByMeta,
  getPlacementsByObject,
  getReferencesBySource,
} from "./query.ts"
export { ingestFragment } from "./gravity.ts"
export type {
  GlobalTopologyEntanglement,
  GlobalTopologyIngestOptions,
  GlobalTopologyIngestResult,
  GlobalTopologyLink,
  GlobalTopologyMetaIndex,
  GlobalTopologyObject,
  GlobalTopologyPlacement,
  GlobalTopologyReference,
  GravityStore,
  GravityStoreSnapshot,
} from "./store.t.ts"
