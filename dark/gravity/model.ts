import type { Atom } from "../store.t.js"
import type { GravityAtom, GravityReadonlyState, GravitySnapshot, OrderKey, Reservation } from "./store.t.js"

const ROOT = ""
const BYTE_BASE = 256

export function parentKey(parent: string | null): string {
  return parent ?? ROOT
}

export function cloneOrderKey(orderKey: OrderKey): OrderKey {
  return Uint8Array.from(orderKey)
}

export function cloneGravityAtom(atom: GravityAtom): GravityAtom {
  return {
    address: atom.address,
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
    atom: new Map(Array.from(state.atom, ([address, atom]) => [address, cloneGravityAtom(atom)])),
    children: new Map(Array.from(state.children, ([parent, children]) => [parent, [...children]])),
    reservations: new Map(
      Array.from(state.reservations, ([address, reservation]) => [address, cloneReservation(reservation)]),
    ),
    nextSeq: state.nextSeq,
  }
}

function byteAt(key: OrderKey, index: number, fallback: number): number {
  return index < key.length ? key[index]! : fallback
}

export function compareOrderKey(a: OrderKey, b: OrderKey): number {
  const size = Math.min(a.length, b.length)

  for (let index = 0; index < size; index++) {
    const delta = a[index]! - b[index]!
    if (delta !== 0) {
      return delta
    }
  }

  return a.length - b.length
}

/**
 * Строит ключ строго между `a` и `b`.
 *
 * `null` трактуется как `-∞` или `+∞`.
 */
export function between(a: OrderKey | null, b: OrderKey | null): OrderKey {
  if (a === null && b === null) {
    return Uint8Array.from([128])
  }

  if (a === null) {
    if (b!.length === 0) {
      return Uint8Array.from([127])
    }

    const out: number[] = []

    for (let index = 0; index < b!.length; index++) {
      const byte = b![index]!

      if (byte > 0) {
        out.push(byte - 1)
        return Uint8Array.from(out)
      }

      out.push(0)
    }

    return Uint8Array.from(b!)
  }

  if (b === null) {
    return Uint8Array.from([...a, 128])
  }

  const out: number[] = []
  const size = Math.max(a.length, b.length)

  for (let index = 0; index < size; index++) {
    const aByte = byteAt(a, index, 0)
    const bByte = byteAt(b, index, BYTE_BASE - 1)

    if (aByte === bByte) {
      out.push(aByte)
      continue
    }

    if (bByte - aByte > 1) {
      out.push(aByte + Math.floor((bByte - aByte) / 2))
      return Uint8Array.from(out)
    }

    out.push(aByte)
  }

  return Uint8Array.from([...out, Math.floor((BYTE_BASE - 1) / 2)])
}

export function normalizeIndexPath(path: string): string {
  return path.trim().replace(/^\/+/, "").replace(/\/+/g, "/")
}

export function parseIndexPath(path: string): number[] {
  const normalized = normalizeIndexPath(path)
  if (!normalized) {
    return []
  }

  return normalized.split("/").map((part) => {
    const index = Number(part)

    if (!Number.isInteger(index) || index < 0) {
      throw new Error(`Некорректный индекс в пути: "${part}"`)
    }

    return index
  })
}

export function splitParentAndIndex(path: string): { parentPath: string | null; index: number } {
  const indices = parseIndexPath(path)

  if (indices.length === 0) {
    throw new Error("Путь не может быть пустым")
  }

  const index = indices[indices.length - 1]!
  const parentIndices = indices.slice(0, -1)

  return {
    parentPath: parentIndices.length > 0 ? parentIndices.join("/") : null,
    index,
  }
}

export function getGravityAtom(state: GravityReadonlyState, address: string): GravityAtom | undefined {
  return state.atom.get(address)
}

export function mustGetGravityAtom(state: GravityReadonlyState, address: string): GravityAtom {
  const atom = getGravityAtom(state, address)

  if (!atom) {
    throw new Error(`Атом не найден: ${address}`)
  }

  return atom
}

export function getChildAddresses(state: GravityReadonlyState, parent: string | null): readonly string[] {
  return state.children.get(parentKey(parent)) ?? []
}

export function assertParentExists(state: GravityReadonlyState, parent: string | null): void {
  if (parent !== null) {
    mustGetGravityAtom(state, parent)
  }
}

export function assertAddressAvailable(state: GravityReadonlyState, address: string): void {
  if (!address) {
    throw new Error("У атома отсутствует address")
  }

  if (state.atom.has(address)) {
    throw new Error(`Атом уже существует: ${address}`)
  }

  if (state.reservations.has(address)) {
    throw new Error(`Атом уже зарезервирован: ${address}`)
  }
}

export function getPath(state: GravityReadonlyState, address: string): string {
  mustGetGravityAtom(state, address)

  const indices: number[] = []
  let current: string | null = address

  while (current) {
    const atom = mustGetGravityAtom(state, current)
    const siblings = getChildAddresses(state, atom.parent)
    const index = siblings.indexOf(current)

    if (index < 0) {
      throw new Error(`Витрина не содержит атом "${current}" у родителя "${atom.parent ?? "root"}"`)
    }

    indices.push(index)
    current = atom.parent
  }

  indices.reverse()
  return indices.join("/")
}

export function getNodeAddress(state: GravityReadonlyState, path: string): string | null {
  let parent: string | null = null
  let current: string | null = null

  for (const index of parseIndexPath(path)) {
    const children = getChildAddresses(state, parent)

    if (index < 0 || index >= children.length) {
      return null
    }

    current = children[index]!
    parent = current
  }

  return current
}

export function getNode(state: GravityReadonlyState, path: string): GravityAtom | null {
  const address = getNodeAddress(state, path)
  return address ? state.atom.get(address) ?? null : null
}

export function getChildren(state: GravityReadonlyState, parent: string | null): readonly GravityAtom[] {
  return getChildAddresses(state, parent).map((address) => mustGetGravityAtom(state, address))
}

export function getAppendReservation(state: GravityReadonlyState, parent: string | null): Reservation {
  const children = getChildAddresses(state, parent)
  const last = children.length > 0 ? mustGetGravityAtom(state, children[children.length - 1]!) : null

  return {
    parent,
    orderKey: between(last?.orderKey ?? null, null),
  }
}

export function getBetweenReservation(
  state: GravityReadonlyState,
  left: string | null,
  right: string | null,
): Reservation {
  const leftAtom = left ? mustGetGravityAtom(state, left) : null
  const rightAtom = right ? mustGetGravityAtom(state, right) : null

  let parent: string | null = null

  if (leftAtom && rightAtom) {
    if (parentKey(leftAtom.parent) !== parentKey(rightAtom.parent)) {
      throw new Error("Соседи должны иметь одного родителя")
    }

    parent = leftAtom.parent
  } else if (leftAtom) {
    parent = leftAtom.parent
  } else if (rightAtom) {
    parent = rightAtom.parent
  }

  return {
    parent,
    orderKey: between(leftAtom?.orderKey ?? null, rightAtom?.orderKey ?? null),
  }
}

export function getBeforeReservation(state: GravityReadonlyState, neighbor: string): Reservation {
  const atom = mustGetGravityAtom(state, neighbor)
  const siblings = getChildAddresses(state, atom.parent)
  const index = siblings.indexOf(neighbor)

  if (index < 0) {
    throw new Error(`Сосед отсутствует в витрине своего родителя: ${neighbor}`)
  }

  const left = index > 0 ? mustGetGravityAtom(state, siblings[index - 1]!) : null

  return {
    parent: atom.parent,
    orderKey: between(left?.orderKey ?? null, atom.orderKey),
  }
}

export function getAfterReservation(state: GravityReadonlyState, neighbor: string): Reservation {
  const atom = mustGetGravityAtom(state, neighbor)
  const siblings = getChildAddresses(state, atom.parent)
  const index = siblings.indexOf(neighbor)

  if (index < 0) {
    throw new Error(`Сосед отсутствует в витрине своего родителя: ${neighbor}`)
  }

  const right = index + 1 < siblings.length ? mustGetGravityAtom(state, siblings[index + 1]!) : null

  return {
    parent: atom.parent,
    orderKey: between(atom.orderKey, right?.orderKey ?? null),
  }
}

export function getIndexPathReservation(state: GravityReadonlyState, path: string): Reservation {
  const { parentPath, index } = splitParentAndIndex(path)
  const parent = parentPath ? getNodeAddress(state, parentPath) : null

  if (parentPath && !parent) {
    throw new Error(`Родительский путь не найден: "${parentPath}"`)
  }

  const children = getChildAddresses(state, parent)

  if (index < 0 || index > children.length) {
    throw new Error(`Индекс вне диапазона для пути "${path}"`)
  }

  const left = index > 0 ? mustGetGravityAtom(state, children[index - 1]!) : null
  const right = index < children.length ? mustGetGravityAtom(state, children[index]!) : null

  return {
    parent,
    orderKey: between(left?.orderKey ?? null, right?.orderKey ?? null),
  }
}

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

export function getInsertionIndex(
  state: GravityReadonlyState,
  children: readonly string[],
  address: string,
): number {
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

export function listTreeAddresses(state: GravityReadonlyState, parent: string | null = null): string[] {
  const out: string[] = []

  for (const address of getChildAddresses(state, parent)) {
    out.push(address)
    out.push(...listTreeAddresses(state, address))
  }

  return out
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
