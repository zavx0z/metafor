import type { Atom } from "../store.t.js"
import {
  assertAddressAvailable,
  assertParentExists,
  buildGravityAtom,
  getAfterReservation,
  getAppendReservation,
  getBeforeReservation,
  getBetweenReservation,
  getChildren as readChildren,
  getIndexPathReservation,
  getNode as readNode,
  getPath as readPath,
  insertChildAddress,
  materializeDarkAtoms as buildDarkAtoms,
  mustGetGravityAtom,
} from "./model"
import { gravity$ } from "./store"
import type { AtomInput, GravityAtom, GravityStore } from "./store.t.js"

function commitAtom(store: GravityStore, atom: GravityAtom): GravityAtom {
  const committed = store.set(atom)
  store.setChildren(committed.parent, insertChildAddress(store, committed.parent, committed.address))
  store.nextSeq = committed.seq + 1
  return committed
}

function createWithReservation(store: GravityStore, input: AtomInput, parent: string | null, order: Uint8Array): GravityAtom {
  assertParentExists(store, parent)
  assertAddressAvailable(store, input.address)

  return commitAtom(
    store,
    buildGravityAtom(store, input, {
      parent,
      orderKey: order,
    }),
  )
}

/**
 * Главный dirty orchestrator Gravity-layer.
 *
 * Здесь сосредоточены все mutation-операции над `gravity$`.
 */
export function resetGravity(store: GravityStore = gravity$): void {
  store.reset()
}

export function getAtom(address: string, store: GravityStore = gravity$): GravityAtom | null {
  return store.get(address) ?? null
}

export function getPath(address: string, store: GravityStore = gravity$): string {
  return readPath(store, address)
}

export function getChildren(parent: string | null, store: GravityStore = gravity$): readonly GravityAtom[] {
  return readChildren(store, parent)
}

export function getNode(path: string, store: GravityStore = gravity$): GravityAtom | null {
  return readNode(store, path)
}

export function createChildren(parent: string | null, input: AtomInput, store: GravityStore = gravity$): GravityAtom {
  const reservation = getAppendReservation(store, parent)
  return createWithReservation(store, input, reservation.parent, reservation.orderKey)
}

export function createBetween(
  left: string | null,
  right: string | null,
  input: AtomInput,
  store: GravityStore = gravity$,
): GravityAtom {
  const reservation = getBetweenReservation(store, left, right)
  return createWithReservation(store, input, reservation.parent, reservation.orderKey)
}

export function createBefore(neighbor: string, input: AtomInput, store: GravityStore = gravity$): GravityAtom {
  const reservation = getBeforeReservation(store, neighbor)
  return createWithReservation(store, input, reservation.parent, reservation.orderKey)
}

export function createAfter(neighbor: string, input: AtomInput, store: GravityStore = gravity$): GravityAtom {
  const reservation = getAfterReservation(store, neighbor)
  return createWithReservation(store, input, reservation.parent, reservation.orderKey)
}

export function createNode(path: string, input: AtomInput, store: GravityStore = gravity$): GravityAtom {
  const reservation = getIndexPathReservation(store, path)
  return createWithReservation(store, input, reservation.parent, reservation.orderKey)
}

export function reserveSibling(
  address: string,
  target: string,
  at: "before" | "after" = "after",
  store: GravityStore = gravity$,
): void {
  assertAddressAvailable(store, address)

  const reservation = at === "before" ? getBeforeReservation(store, target) : getAfterReservation(store, target)
  store.setReservation(address, reservation)
}

export function reserveByIndexPath(address: string, path: string, store: GravityStore = gravity$): void {
  assertAddressAvailable(store, address)
  store.setReservation(address, getIndexPathReservation(store, path))
}

export function attachReserved(input: AtomInput, store: GravityStore = gravity$): GravityAtom {
  const reservation = store.getReservation(input.address)

  if (!reservation) {
    return createChildren(null, input, store)
  }

  store.deleteReservation(input.address)
  return createWithReservation(store, input, reservation.parent, reservation.orderKey)
}

export function materializeDarkAtoms(store: GravityStore = gravity$): Map<string, Atom> {
  return buildDarkAtoms(store)
}

export function snapshot(store: GravityStore = gravity$) {
  return store.snapshot()
}

export function getParent(address: string, store: GravityStore = gravity$): string | null {
  return mustGetGravityAtom(store, address).parent
}
