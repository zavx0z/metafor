import type { DarkStore } from "./store.t.js"

export type { Atom, DarkStore, DarkStoreSnapshot } from "./store.t.js"

function pathToIndices(path: string): number[] {
  return path.split("/").map((segment) => Number(segment))
}

function comparePath(a: string, b: string): number {
  const aIndices = pathToIndices(a)
  const bIndices = pathToIndices(b)
  const size = Math.min(aIndices.length, bIndices.length)

  for (let index = 0; index < size; index++) {
    const delta = aIndices[index]! - bIndices[index]!
    if (delta !== 0) {
      return delta
    }
  }

  return aIndices.length - bIndices.length
}

function getParentPath(path: string): string | null {
  const separator = path.lastIndexOf("/")
  return separator < 0 ? null : path.slice(0, separator)
}

export const dark$: DarkStore = {
  meta: new Map(),
  atom: new Map(),

  reset() {
    this.meta = new Map()
    this.atom = new Map()
  },

  restore(snapshot) {
    this.meta = new Map(snapshot.meta)
    this.atom = new Map(Array.from(snapshot.atom, ([address, atom]) => [address, { ...atom }]))
  },

  snapshot() {
    return {
      meta: new Map(this.meta),
      atom: new Map(Array.from(this.atom, ([address, atom]) => [address, { ...atom }])),
    }
  },

  setMeta(address, meta) {
    this.meta.set(address, meta)
    return meta
  },

  setAtom(atom) {
    const next = { ...atom }
    this.atom.set(next.address, next)
    return next
  },

  getMeta(address) {
    return this.meta.get(address)
  },

  getAtom(address) {
    return this.atom.get(address)
  },

  getPath(address) {
    return this.getAtom(address)?.path
  },

  getChildren(parent) {
    const parentPath = parent ? this.getPath(parent) ?? null : null

    return [...this.atom.values()]
      .filter((atom) => getParentPath(atom.path) === parentPath)
      .sort((left, right) => comparePath(left.path, right.path))
  },

  getNode(path) {
    for (const atom of this.atom.values()) {
      if (atom.path === path) {
        return atom
      }
    }

    return null
  },
}
