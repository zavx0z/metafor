import { parseIndexPath } from "./path"
import type { GravityAtom, GravityReadonlyState } from "./store.t.js"

const ROOT = ""

export function parentKey(parent: string | null): string {
  return parent ?? ROOT
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

export function listTreeAddresses(state: GravityReadonlyState, parent: string | null = null): string[] {
  const out: string[] = []

  for (const address of getChildAddresses(state, parent)) {
    out.push(address)
    out.push(...listTreeAddresses(state, address))
  }

  return out
}
