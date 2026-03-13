/**
 * `@dark/gravity/store` — singleton store structural state Gravity-layer.
 *
 * Здесь нет assembly-логики. Store держит только данные и узкий store API.
 */

import { cloneGravityAtom, cloneGravitySnapshot, cloneReservation, parentKey } from "./model"
import type { GravityStore } from "./store.t.js"

export const gravity$: GravityStore = {
  atom: new Map(),
  children: new Map(),
  reservations: new Map(),
  nextSeq: 0,

  reset() {
    this.atom = new Map()
    this.children = new Map()
    this.reservations = new Map()
    this.nextSeq = 0
  },

  restore(snapshot) {
    this.atom = new Map(Array.from(snapshot.atom, ([address, atom]) => [address, cloneGravityAtom(atom)]))
    this.children = new Map(Array.from(snapshot.children, ([parent, children]) => [parent, [...children]]))
    this.reservations = new Map(
      Array.from(snapshot.reservations, ([address, reservation]) => [address, cloneReservation(reservation)]),
    )
    this.nextSeq = snapshot.nextSeq
  },

  snapshot() {
    return cloneGravitySnapshot(this)
  },

  get(address) {
    return this.atom.get(address)
  },

  set(atom) {
    const next = cloneGravityAtom(atom)
    this.atom.set(next.address, next)
    return next
  },

  getChildren(parent) {
    return this.children.get(parentKey(parent)) ?? []
  },

  setChildren(parent, children) {
    const next = [...children]
    this.children.set(parentKey(parent), next)
    return next
  },

  getReservation(address) {
    return this.reservations.get(address)
  },

  setReservation(address, reservation) {
    const next = cloneReservation(reservation)
    this.reservations.set(address, next)
    return next
  },

  deleteReservation(address) {
    this.reservations.delete(address)
  },
}
