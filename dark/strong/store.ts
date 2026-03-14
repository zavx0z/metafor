/**
 * `@dark/strong/store` — singleton store индексов Strong-layer.
 *
 * Здесь нет lookup-логики и индексации. Store держит только индексное
 * промежуточное состояние и узкий store API.
 *
 * **Dark × Strong:**
 * - постоянство структурной памяти и согласованность схем
 * - изменение значений ordinary `Field` через `Gluon` без разрыва связности
 * - удержание скрытой структурной рамки и скрытой устойчивости идентичности
 *
 * @property placementAddressIndex {@link StrongIndexStore.placementAddressIndex|placementAddressIndex} — адрес → placement
 * @property entanglementAddressIndex {@link StrongIndexStore.entanglementAddressIndex|entanglementAddressIndex} — address → entanglement
 * @property objectPlacementsIndex {@link StrongIndexStore.objectPlacementsIndex|objectPlacementsIndex} — object → placements
 * @property sourceMetaIndex {@link StrongIndexStore.sourceMetaIndex|sourceMetaIndex} — meta → сущности
 * @property metaSourceLookup {@link StrongIndexStore.metaSourceLookup|metaSourceLookup} — source → references
 *
 * @see {@link StrongIndexStore} — тип состояния
 * @see {@link https://github.com/zavx0z/metafor/blob/main/docs/ONTOLOGY.md#dark--strong | ONTOLOGY.md} — онтология Dark × Strong
 * @see {@link https://github.com/zavx0z/metafor/blob/main/docs/proto/strong.md | proto/strong.md} — протокол Strong и Gluon
 */

import type { StrongIndexStore } from "./store.t.ts"
import { cloneStrongSnapshot } from "./snapshot.ts"

export const strong$: StrongIndexStore = {
  placementAddressIndex: new Map(),
  entanglementAddressIndex: new Map(),
  objectPlacementsIndex: new Map(),
  sourceMetaIndex: new Map(),
  metaSourceLookup: new Map(),

  reset() {
    this.placementAddressIndex = new Map()
    this.entanglementAddressIndex = new Map()
    this.objectPlacementsIndex = new Map()
    this.sourceMetaIndex = new Map()
    this.metaSourceLookup = new Map()
  },

  restore(snapshot) {
    const next = cloneStrongSnapshot(snapshot)
    this.placementAddressIndex = next.placementAddressIndex
    this.entanglementAddressIndex = next.entanglementAddressIndex
    this.objectPlacementsIndex = next.objectPlacementsIndex
    this.sourceMetaIndex = next.sourceMetaIndex
    this.metaSourceLookup = next.metaSourceLookup
  },

  snapshot() {
    return cloneStrongSnapshot(this)
  },
}
