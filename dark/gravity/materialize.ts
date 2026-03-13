import type { Atom } from "../store.t.js"
import { cloneOrderKey, compareOrderKey } from "./key"
import { getChildAddresses, getPath, listTreeAddresses, mustGetGravityAtom } from "./tree"
import type { GravityAtom, GravityReadonlyState, Reservation } from "./store.t.js"

export function buildGravityAtom(
  state: GravityReadonlyState,
  input: { address: string; meta: string },
  reservation: Reservation,
): GravityAtom {
  return {
    address: input.address,
    meta: input.meta,
    parent: reservation.parent,
    orderKey: cloneOrderKey(reservation.orderKey),
    seq: state.nextSeq,
  }
}

export function getInsertionIndex(state: GravityReadonlyState, children: readonly string[], address: string): number {
  const candidate = mustGetGravityAtom(state, address)
  let left = 0
  let right = children.length

  while (left < right) {
    const middle = (left + right) >>> 1
    const current = mustGetGravityAtom(state, children[middle]!)

    let comparison = compareOrderKey(current.orderKey, candidate.orderKey)
    if (comparison === 0) {
      comparison = current.seq - candidate.seq
    }

    if (comparison <= 0) {
      left = middle + 1
    } else {
      right = middle
    }
  }

  return left
}

export function insertChildAddress(state: GravityReadonlyState, parent: string | null, address: string): string[] {
  const children = [...getChildAddresses(state, parent)]
  const index = getInsertionIndex(state, children, address)
  children.splice(index, 0, address)
  return children
}

export function materializeDarkAtoms(state: GravityReadonlyState): Map<string, Atom> {
  return new Map(
    listTreeAddresses(state).map((address) => {
      const atom = mustGetGravityAtom(state, address)

      return [
        address,
        {
          address: atom.address,
          meta: atom.meta,
          path: getPath(state, address),
        } satisfies Atom,
      ] as const
    }),
  )
}
