/**
 * `@dark/gravity/store` — singleton store structural state Gravity-layer.
 *
 * Здесь нет assembly-логики. Store держит только промежуточное состояние
 * слоя gravity и узкий store API.
 *
 * **Dark × Gravity:**
 * - скрытая иерархия и канал `Graviton` как внутренний протокол
 * - организация схем и глубокая структурная локализация
 * - геометрия скрытых версий и их преемственности
 *
 * @property `fragments` — загруженные фрагменты
 * @property `nextPlacementSeq` — счётчик размещений
 * @property `nextLinkSeq` — счётчик связей
 * @property `nextReferenceSeq` — счётчик ссылок
 * @property `rootOccurrenceSeq` — счётчик root
 *
 * @see GravityStore — тип состояния
 * @see {@link https://github.com/zavx0z/metafor/blob/main/docs/ONTOLOGY.md#dark--gravity | ONTOLOGY.md} — онтология Dark × Gravity
 * @see {@link https://github.com/zavx0z/metafor/blob/main/docs/TOPOLOGY.md | TOPOLOGY.md} — topology как скрытая карта построения
 */

import type { GravityStore } from "./store.t.ts"
import { cloneFragment, cloneGravitySnapshot } from "./snapshot.ts"

export const gravity$: GravityStore = {
  fragments: new Map(),
  nextPlacementSeq: 0,
  nextLinkSeq: 0,
  nextReferenceSeq: 0,
  rootOccurrenceSeq: 0,

  reset() {
    this.fragments = new Map()
    this.nextPlacementSeq = 0
    this.nextLinkSeq = 0
    this.nextReferenceSeq = 0
    this.rootOccurrenceSeq = 0
  },

  restore(snapshot) {
    this.fragments = new Map(Array.from(snapshot.fragments, ([meta, fragment]) => [meta, cloneFragment(fragment)]))
    this.nextPlacementSeq = snapshot.nextPlacementSeq
    this.nextLinkSeq = snapshot.nextLinkSeq
    this.nextReferenceSeq = snapshot.nextReferenceSeq
    this.rootOccurrenceSeq = snapshot.rootOccurrenceSeq
  },

  snapshot() {
    return cloneGravitySnapshot(this)
  },

  setFragment(meta, fragment) {
    const next = cloneFragment(fragment)
    this.fragments.set(meta, next)
    return next
  },

  getFragment(meta) {
    return this.fragments.get(meta)
  },
}
