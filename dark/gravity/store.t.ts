/**
 * Типы gravity-layer store и структурного assembly state.
 */

import type { UUID } from "../identifier.t"

/** Лексикографический ключ порядка среди siblings одного родителя. */
export type OrderKey = Uint8Array

/** Данные, достаточные для создания атома в gravity-layer. */
export interface AtomSeed {
  meta: string
  uuid: UUID
}

/** Вход создания атома: path не принимается, он выводится из tree geometry. */
export type AtomInput = Readonly<AtomSeed>

export interface GravityAtom extends AtomSeed {
  parent: UUID | null
  orderKey: OrderKey
  seq: number
}

export interface Reservation {
  parent: UUID | null
  orderKey: OrderKey
}

export interface GravityReadonlyState {
  atom: ReadonlyMap<UUID, GravityAtom>
  children: ReadonlyMap<string, readonly UUID[]>
  reservations: ReadonlyMap<UUID, Reservation>
  nextSeq: number
}

export interface GravitySnapshot {
  atom: Map<UUID, GravityAtom>
  children: Map<string, UUID[]>
  reservations: Map<UUID, Reservation>
  nextSeq: number
}

export interface GravityStore extends GravitySnapshot {
  reset(): void
  restore(snapshot: GravitySnapshot): void
  snapshot(): GravitySnapshot
  get(uuid: UUID): GravityAtom | undefined
  set(atom: GravityAtom): GravityAtom
  getChildren(parent: UUID | null): readonly UUID[]
  setChildren(parent: UUID | null, children: readonly UUID[]): readonly UUID[]
  getReservation(uuid: UUID): Reservation | undefined
  setReservation(uuid: UUID, reservation: Reservation): Reservation
  deleteReservation(uuid: UUID): void
}
