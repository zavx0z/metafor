import { cloneOrderKey } from "./key"
import type { GravityAtom, GravityReadonlyState, GravitySnapshot, Reservation } from "./store.t.js"

export function cloneGravityAtom(atom: GravityAtom): GravityAtom {
  return {
    uuid: atom.uuid,
    meta: atom.meta,
    parent: atom.parent,
    orderKey: cloneOrderKey(atom.orderKey),
    seq: atom.seq,
  }
}

export function cloneReservation(reservation: Reservation): Reservation {
  return {
    parent: reservation.parent,
    orderKey: cloneOrderKey(reservation.orderKey),
  }
}

export function cloneGravitySnapshot(state: GravityReadonlyState): GravitySnapshot {
  return {
    atom: new Map(Array.from(state.atom, ([uuid, atom]) => [uuid, cloneGravityAtom(atom)])),
    children: new Map(Array.from(state.children, ([parent, children]) => [parent, [...children]])),
    reservations: new Map(
      Array.from(state.reservations, ([uuid, reservation]) => [uuid, cloneReservation(reservation)]),
    ),
    nextSeq: state.nextSeq,
  }
}
