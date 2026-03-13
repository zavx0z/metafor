import { between } from "./key"
import { splitParentAndIndex } from "./path"
import { getChildAddresses, getNodeAddress, mustGetGravityAtom, parentKey } from "./tree"
import type { GravityReadonlyState, Reservation } from "./store.t.js"
import type { UUID } from "../identifier.t.js"

export function assertParentExists(state: GravityReadonlyState, parent: UUID | null): void {
  if (parent !== null) mustGetGravityAtom(state, parent)
}

export function assertAddressAvailable(state: GravityReadonlyState, uuid: UUID): void {
  if (!uuid) throw new Error("У атома отсутствует uuid")
  if (state.atom.has(uuid)) throw new Error(`Атом уже существует: ${uuid}`)
  if (state.reservations.has(uuid)) throw new Error(`Атом уже зарезервирован: ${uuid}`)
}

export function getAppendReservation(state: GravityReadonlyState, parent: UUID | null): Reservation {
  const children = getChildAddresses(state, parent)
  const last = children.length > 0 ? mustGetGravityAtom(state, children[children.length - 1]!) : null
  return {
    parent,
    orderKey: between(last?.orderKey ?? null, null),
  }
}

export function getBetweenReservation(
  state: GravityReadonlyState,
  left: UUID | null,
  right: UUID | null,
): Reservation {
  const leftAtom = left ? mustGetGravityAtom(state, left) : null
  const rightAtom = right ? mustGetGravityAtom(state, right) : null
  let parent: UUID | null = null
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

export function getBeforeReservation(state: GravityReadonlyState, neighbor: UUID): Reservation {
  const atom = mustGetGravityAtom(state, neighbor)
  const siblings = getChildAddresses(state, atom.parent)
  const index = siblings.indexOf(neighbor)
  if (index < 0) throw new Error(`Сосед отсутствует в витрине своего родителя: ${neighbor}`)
  const left = index > 0 ? mustGetGravityAtom(state, siblings[index - 1]!) : null
  return {
    parent: atom.parent,
    orderKey: between(left?.orderKey ?? null, atom.orderKey),
  }
}

export function getAfterReservation(state: GravityReadonlyState, neighbor: UUID): Reservation {
  const atom = mustGetGravityAtom(state, neighbor)
  const siblings = getChildAddresses(state, atom.parent)
  const index = siblings.indexOf(neighbor)
  if (index < 0) throw new Error(`Сосед отсутствует в витрине своего родителя: ${neighbor}`)
  const right = index + 1 < siblings.length ? mustGetGravityAtom(state, siblings[index + 1]!) : null
  return {
    parent: atom.parent,
    orderKey: between(atom.orderKey, right?.orderKey ?? null),
  }
}

export function getIndexPathReservation(state: GravityReadonlyState, path: string): Reservation {
  const { parentPath, index } = splitParentAndIndex(path)
  const parent = parentPath ? getNodeAddress(state, parentPath) : null
  if (parentPath && !parent) throw new Error(`Родительский путь не найден: "${parentPath}"`)
  const children = getChildAddresses(state, parent)
  if (index < 0 || index > children.length) throw new Error(`Индекс вне диапазона для пути "${path}"`)
  const left = index > 0 ? mustGetGravityAtom(state, children[index - 1]!) : null
  const right = index < children.length ? mustGetGravityAtom(state, children[index]!) : null
  return {
    parent,
    orderKey: between(left?.orderKey ?? null, right?.orderKey ?? null),
  }
}
