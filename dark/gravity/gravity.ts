
import { buildGravityAtom, insertChildAddress} from "./materialize"
import {
  assertAddressAvailable,
  assertParentExists,
  getAfterReservation,
  getAppendReservation,
  getBeforeReservation,
  getBetweenReservation,
  getIndexPathReservation,
} from "./reservation"
import { getChildren as readChildren, getNode as readNode, getPath as readPath, mustGetGravityAtom } from "./tree"
import { gravity$ } from "./store"
import type { AtomInput, GravityAtom, GravityStore } from "./store.t.js"
import type { UUID } from "../identifier.t.js"

function commitAtom(store: GravityStore, atom: GravityAtom): GravityAtom {
  const committed = store.set(atom)
  store.setChildren(committed.parent, insertChildAddress(store, committed.parent, committed.uuid))
  store.nextSeq = committed.seq + 1
  return committed
}

function createWithReservation(
  store: GravityStore,
  input: AtomInput,
  parent: UUID | null,
  order: Uint8Array,
): GravityAtom {
  assertParentExists(store, parent)
  assertAddressAvailable(store, input.uuid)
  return commitAtom(store, buildGravityAtom(store, input, { parent, orderKey: order }))
}

/**
 * Главный dirty orchestrator Gravity-layer.
 *
 * Здесь сосредоточены все mutation-операции над `gravity$`.
 */
export function resetGravity(store: GravityStore = gravity$): void {
  store.reset()
}

export function getAtom(uuid: UUID, store: GravityStore = gravity$): GravityAtom | null {
  return store.get(uuid) ?? null
}

export function getPath(uuid: UUID, store: GravityStore = gravity$): string {
  return readPath(store, uuid)
}

export function getChildren(parent: UUID | null, store: GravityStore = gravity$): readonly GravityAtom[] {
  return readChildren(store, parent)
}

export function getNode(path: string, store: GravityStore = gravity$): GravityAtom | null {
  return readNode(store, path)
}

export function createChildren(parent: UUID | null, input: AtomInput, store: GravityStore = gravity$): GravityAtom {
  const reservation = getAppendReservation(store, parent)
  return createWithReservation(store, input, reservation.parent, reservation.orderKey)
}

export function createBetween(
  left: UUID | null,
  right: UUID | null,
  input: AtomInput,
  store: GravityStore = gravity$,
): GravityAtom {
  const reservation = getBetweenReservation(store, left, right)
  return createWithReservation(store, input, reservation.parent, reservation.orderKey)
}

export function createBefore(neighbor: UUID, input: AtomInput, store: GravityStore = gravity$): GravityAtom {
  const reservation = getBeforeReservation(store, neighbor)
  return createWithReservation(store, input, reservation.parent, reservation.orderKey)
}

export function createAfter(neighbor: UUID, input: AtomInput, store: GravityStore = gravity$): GravityAtom {
  const reservation = getAfterReservation(store, neighbor)
  return createWithReservation(store, input, reservation.parent, reservation.orderKey)
}

export function createNode(path: string, input: AtomInput, store: GravityStore = gravity$): GravityAtom {
  const reservation = getIndexPathReservation(store, path)
  return createWithReservation(store, input, reservation.parent, reservation.orderKey)
}

export function reserveSibling(
  uuid: UUID,
  target: UUID,
  at: "before" | "after" = "after",
  store: GravityStore = gravity$,
): void {
  assertAddressAvailable(store, uuid)
  const reservation = at === "before" ? getBeforeReservation(store, target) : getAfterReservation(store, target)
  store.setReservation(uuid, reservation)
}

export function reserveByIndexPath(uuid: UUID, path: string, store: GravityStore = gravity$): void {
  assertAddressAvailable(store, uuid)
  store.setReservation(uuid, getIndexPathReservation(store, path))
}

export function attachReserved(input: AtomInput, store: GravityStore = gravity$): GravityAtom {
  const reservation = store.getReservation(input.uuid)
  if (!reservation) return createChildren(null, input, store)
  store.deleteReservation(input.uuid)
  return createWithReservation(store, input, reservation.parent, reservation.orderKey)
}

export function snapshot(store: GravityStore = gravity$) {
  return store.snapshot()
}

export function getParent(uuid: UUID, store: GravityStore = gravity$): UUID | null {
  return mustGetGravityAtom(store, uuid).parent
}
