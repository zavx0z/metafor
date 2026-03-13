/**
 * Типы gravity-layer store и структурного assembly state.
 */

/** Лексикографический ключ порядка среди siblings одного родителя. */
export type OrderKey = Uint8Array

/** Данные, достаточные для создания атома в gravity-layer. */
export interface AtomSeed {
  meta: string
  address: string
}

/** Вход создания атома: path не принимается, он выводится из tree geometry. */
export type AtomInput = Readonly<AtomSeed>

export interface GravityAtom extends AtomSeed {
  parent: string | null
  orderKey: OrderKey
  seq: number
}

export interface Reservation {
  parent: string | null
  orderKey: OrderKey
}

export interface GravityReadonlyState {
  atom: ReadonlyMap<string, GravityAtom>
  children: ReadonlyMap<string, readonly string[]>
  reservations: ReadonlyMap<string, Reservation>
  nextSeq: number
}

export interface GravitySnapshot {
  atom: Map<string, GravityAtom>
  children: Map<string, string[]>
  reservations: Map<string, Reservation>
  nextSeq: number
}

export interface GravityStore extends GravitySnapshot {
  reset(): void
  restore(snapshot: GravitySnapshot): void
  snapshot(): GravitySnapshot
  get(address: string): GravityAtom | undefined
  set(atom: GravityAtom): GravityAtom
  getChildren(parent: string | null): readonly string[]
  setChildren(parent: string | null, children: readonly string[]): readonly string[]
  getReservation(address: string): Reservation | undefined
  setReservation(address: string, reservation: Reservation): Reservation
  deleteReservation(address: string): void
}
