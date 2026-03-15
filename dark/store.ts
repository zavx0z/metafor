import type { MetaAST } from "@metafor/ast"
import type {
  DarkStore,
  GlobalTopologyEntanglement,
  GlobalTopologyLink,
  GlobalTopologyObject,
  GlobalTopologyPlacement,
  GlobalTopologyReference,
} from "@dark/types"
import { cloneStoredValue } from "./snapshot.ts"

export const dark$: DarkStore = {
  meta: new Map(),
  objects: new Map(),
  placements: new Map(),
  links: new Map(),
  references: new Map(),
  entanglements: new Map(),

  setMeta(address: string, meta: MetaAST) {
    const next = cloneStoredValue(meta)
    this.meta.set(address, next)
    return next
  },

  getMeta(address: string) {
    return this.meta.get(address)
  },

  setObject(id: string, object: GlobalTopologyObject) {
    const next = cloneStoredValue(object)
    this.objects.set(id, next)
    return next
  },

  getObject(id: string) {
    return this.objects.get(id)
  },

  deleteObject(id: string) {
    this.objects.delete(id)
  },

  setPlacement(id: string, placement: GlobalTopologyPlacement) {
    const next = cloneStoredValue(placement)
    this.placements.set(id, next)
    return next
  },

  getPlacement(id: string) {
    return this.placements.get(id)
  },

  deletePlacement(id: string) {
    this.placements.delete(id)
  },

  setLink(id: string, link: GlobalTopologyLink) {
    const next = cloneStoredValue(link)
    this.links.set(id, next)
    return next
  },

  getLink(id: string) {
    return this.links.get(id)
  },

  deleteLink(id: string) {
    this.links.delete(id)
  },

  setReference(id: string, reference: GlobalTopologyReference) {
    const next = cloneStoredValue(reference)
    this.references.set(id, next)
    return next
  },

  getReference(id: string) {
    return this.references.get(id)
  },

  deleteReference(id: string) {
    this.references.delete(id)
  },

  setEntanglement(id: string, entanglement: GlobalTopologyEntanglement) {
    const next = cloneStoredValue(entanglement)
    this.entanglements.set(id, next)
    return next
  },

  getEntanglement(id: string) {
    return this.entanglements.get(id)
  },

  deleteEntanglement(id: string) {
    this.entanglements.delete(id)
  },
}
