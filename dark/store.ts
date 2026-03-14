/**
 * `@dark/store` — корневой store домена Dark.
 *
 * Здесь живёт весь канонический graph state, который нужен между
 * подпакетами `dark/gravity`, `dark/strong`, `dark/weak` и `dark/em`.
 *
 * **Домен `Dark`:**
 * - скрытый субстрат структуры, памяти, иерархии, истории и эволюции модели
 * - не является runtime-оркестратором и не дублирует `boundary/` или `bulk/`
 * - удерживает скрытую структурную рамку и историю схем
 *
 * @property meta {@link DarkStore.meta|meta} — загруженные meta-схемы
 * @property objects {@link DarkStore.objects|objects} — глобальные объекты
 * @property placements {@link DarkStore.placements|placements} — размещения
 * @property links {@link DarkStore.links|links} — связи между размещениями
 * @property references {@link DarkStore.references|references} — ссылки на источники
 * @property entanglements {@link DarkStore.entanglements|entanglements} — запутанности
 *
 * @see {@link DarkStore} — тип состояния
 * @see {@link https://github.com/zavx0z/metafor/blob/main/docs/ONTOLOGY.md#dark | ONTOLOGY.md} — онтология Dark
 * @see {@link https://github.com/zavx0z/metafor/blob/main/dark/README.md | dark/README.md} — ответственность Dark
 */

import type { DarkStore } from "./store.t.ts"
import { cloneDarkSnapshot, cloneStoredValue } from "./snapshot.ts"

export type { DarkStore, DarkStoreSnapshot } from "./store.t.ts"

export const dark$: DarkStore = {
  meta: new Map(),
  objects: new Map(),
  placements: new Map(),
  links: new Map(),
  references: new Map(),
  entanglements: new Map(),

  reset() {
    this.meta = new Map()
    this.objects = new Map()
    this.placements = new Map()
    this.links = new Map()
    this.references = new Map()
    this.entanglements = new Map()
  },

  restore(snapshot) {
    const next = cloneDarkSnapshot(snapshot)
    this.meta = next.meta
    this.objects = next.objects
    this.placements = next.placements
    this.links = next.links
    this.references = next.references
    this.entanglements = next.entanglements
  },

  snapshot() {
    return cloneDarkSnapshot(this)
  },

  setMeta(address, meta) {
    const next = cloneStoredValue(meta)
    this.meta.set(address, next)
    return next
  },

  getMeta(address) {
    return this.meta.get(address)
  },

  setObject(id, object) {
    const next = cloneStoredValue(object)
    this.objects.set(id, next)
    return next
  },

  getObject(id) {
    return this.objects.get(id)
  },

  deleteObject(id) {
    this.objects.delete(id)
  },

  setPlacement(id, placement) {
    const next = cloneStoredValue(placement)
    this.placements.set(id, next)
    return next
  },

  getPlacement(id) {
    return this.placements.get(id)
  },

  deletePlacement(id) {
    this.placements.delete(id)
  },

  setLink(id, link) {
    const next = cloneStoredValue(link)
    this.links.set(id, next)
    return next
  },

  getLink(id) {
    return this.links.get(id)
  },

  deleteLink(id) {
    this.links.delete(id)
  },

  setReference(id, reference) {
    const next = cloneStoredValue(reference)
    this.references.set(id, next)
    return next
  },

  getReference(id) {
    return this.references.get(id)
  },

  deleteReference(id) {
    this.references.delete(id)
  },

  setEntanglement(id, entanglement) {
    const next = cloneStoredValue(entanglement)
    this.entanglements.set(id, next)
    return next
  },

  getEntanglement(id) {
    return this.entanglements.get(id)
  },

  deleteEntanglement(id) {
    this.entanglements.delete(id)
  },
}
