import type { Atom } from "../store.t.js"
import { cloneOrderKey, compareOrderKey } from "./key"
import { getChildAddresses, getPath, listTreeAddresses, mustGetGravityAtom } from "./tree"
import type { GravityAtom, GravityReadonlyState, Reservation } from "./store.t.js"
import type { UUID } from "../identifier.t.js"

export function buildGravityAtom(
  state: GravityReadonlyState,
  input: { uuid: UUID; meta: string },
  reservation: Reservation,
): GravityAtom {
  return {
    uuid: input.uuid,
    meta: input.meta,
    parent: reservation.parent,
    orderKey: cloneOrderKey(reservation.orderKey),
    seq: state.nextSeq,
  }
}

export function getInsertionIndex(state: GravityReadonlyState, children: readonly UUID[], uuid: UUID): number {
  const candidate = mustGetGravityAtom(state, uuid)
  let left = 0
  let right = children.length
  while (left < right) {
    const middle = (left + right) >>> 1
    const current = mustGetGravityAtom(state, children[middle]!)
    let comparison = compareOrderKey(current.orderKey, candidate.orderKey)
    if (comparison === 0) comparison = current.seq - candidate.seq
    if (comparison <= 0) left = middle + 1
    else right = middle
  }
  return left
}

export function insertChildAddress(state: GravityReadonlyState, parent: UUID | null, uuid: UUID): UUID[] {
  const children = [...getChildAddresses(state, parent)]
  const index = getInsertionIndex(state, children, uuid)
  children.splice(index, 0, uuid)
  return children
}

export function materializeDarkAtoms(state: GravityReadonlyState): Map<UUID, Atom> {
  return new Map(
    listTreeAddresses(state).map((uuid) => {
      const atom = mustGetGravityAtom(state, uuid)
      return [
        uuid,
        {
          uuid: atom.uuid,
          meta: atom.meta,
          path: getPath(state, uuid),
        } satisfies Atom,
      ] as const
    }),
  )
}
