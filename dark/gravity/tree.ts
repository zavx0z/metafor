import { parseIndexPath } from "./path"
import type { GravityAtom, GravityReadonlyState } from "./store.t.js"
import type { UUID } from "../identifier.t.js"

const ROOT = ""

export function parentKey(parent: UUID | null): string {
  return parent ?? ROOT
}

export function getGravityAtom(state: GravityReadonlyState, uuid: UUID): GravityAtom | undefined {
  return state.atom.get(uuid)
}

export function mustGetGravityAtom(state: GravityReadonlyState, uuid: UUID): GravityAtom {
  const atom = getGravityAtom(state, uuid)
  if (!atom) throw new Error(`Атом не найден: ${uuid}`)
  return atom
}

export function getChildAddresses(state: GravityReadonlyState, parent: UUID | null): readonly UUID[] {
  return state.children.get(parentKey(parent)) ?? []
}

export function getPath(state: GravityReadonlyState, uuid: UUID): string {
  mustGetGravityAtom(state, uuid)
  const indices: number[] = []
  let current: UUID | null = uuid
  while (current) {
    const atom = mustGetGravityAtom(state, current)
    const siblings = getChildAddresses(state, atom.parent)
    const index = siblings.indexOf(current)
    if (index < 0) throw new Error(`Витрина не содержит атом "${current}" у родителя "${atom.parent ?? "root"}"`)
    indices.push(index)
    current = atom.parent
  }
  indices.reverse()
  return indices.join("/")
}

export function getNodeAddress(state: GravityReadonlyState, path: string): UUID | null {
  let parent: UUID | null = null
  let current: UUID | null = null
  for (const index of parseIndexPath(path)) {
    const children = getChildAddresses(state, parent)
    if (index < 0 || index >= children.length) return null
    current = children[index]!
    parent = current
  }
  return current
}

export function getNode(state: GravityReadonlyState, path: string): GravityAtom | null {
  const uuid = getNodeAddress(state, path)
  return uuid ? state.atom.get(uuid) ?? null : null
}

export function getChildren(state: GravityReadonlyState, parent: UUID | null): readonly GravityAtom[] {
  return getChildAddresses(state, parent).map((uuid) => mustGetGravityAtom(state, uuid))
}

export function listTreeAddresses(state: GravityReadonlyState, parent: UUID | null = null): UUID[] {
  const out: UUID[] = []
  for (const uuid of getChildAddresses(state, parent)) {
    out.push(uuid)
    out.push(...listTreeAddresses(state, uuid))
  }
  return out
}
