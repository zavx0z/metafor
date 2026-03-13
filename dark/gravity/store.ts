/**
 * `@dark/gravity/store` — assembly mechanics для лексикографического дерева атомов.
 *
 * `gravity$` не является top-level store домена. Это singleton-объект методов,
 * который умеет работать либо со своим внутренним state, либо с переданным
 * временным `GravityState`.
 */

import type {
  Atom,
  AtomInput,
  AtomSeed,
  AtomTreeMeta,
  GravitySnapshot,
  GravityState,
  GravityStore,
  OrderKey,
  Reservation,
} from "./store.t.js"

const ROOT = ""
const BYTE_BASE = 256

function createStoredAtom<Meta>(address: string, meta: string, state: GravityState<Meta>): Atom {
  const atom = {
    get path() {
      return gravity$.getPath(address, state)
    },
    meta,
    address,
  } satisfies Atom

  return Object.freeze(atom)
}

function cloneOrderKey(orderKey: OrderKey): OrderKey {
  return Uint8Array.from(orderKey)
}

function cloneTreeMeta(meta: AtomTreeMeta): AtomTreeMeta {
  return {
    parent: meta.parent,
    orderKey: cloneOrderKey(meta.orderKey),
    seq: meta.seq,
  }
}

function createGravityState<Meta = unknown>(): GravityState<Meta> {
  return {
    meta: new Map(),
    atom: new Map(),
    tree: new Map(),
    childrenView: new Map(),
    reservations: new Map(),
    nextSeq: 0,
  }
}

function normalizeIndexPathString(path: string): string {
  return path.trim().replace(/^\/+/, "").replace(/\/+/g, "/")
}

function parseIndexPath(path: string): number[] {
  const normalized = normalizeIndexPathString(path)
  if (!normalized) return []

  const out: number[] = []

  for (const part of normalized.split("/")) {
    if (!part) throw new Error(`Некорректный индекс в пути: "${path}"`)

    const index = Number(part)
    if (!Number.isInteger(index) || index < 0) {
      throw new Error(`Некорректный индекс в пути: "${part}"`)
    }

    out.push(index)
  }

  return out
}

function splitParentAndIndex(path: string): { parentPath: string | null; index: number } {
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

function byteAt(key: OrderKey, index: number, fallback: number): number {
  return index < key.length ? key[index]! : fallback
}

function compareOrderKey(a: OrderKey, b: OrderKey): number {
  const size = Math.min(a.length, b.length)

  for (let index = 0; index < size; index++) {
    const aByte = a[index]!
    const bByte = b[index]!
    if (aByte !== bByte) {
      return aByte - bByte
    }
  }

  return a.length - b.length
}

function resolveState<Meta>(state?: GravityState<Meta>): GravityState<Meta> {
  return (state ?? internalState) as GravityState<Meta>
}

function parentKey(parent: string | null): string {
  return parent ?? ROOT
}

function ensureChildren<Meta>(state: GravityState<Meta>, parent: string | null): string[] {
  const key = parentKey(parent)
  const existing = state.childrenView.get(key)

  if (existing) {
    return existing
  }

  const children: string[] = []
  state.childrenView.set(key, children)
  return children
}

function requireAtom<Meta>(state: GravityState<Meta>, address: string): Atom {
  const atom = state.atom.get(address)
  if (!atom) {
    throw new Error(`Атом не найден: ${address}`)
  }

  return atom
}

function requireTreeMeta<Meta>(state: GravityState<Meta>, address: string): AtomTreeMeta {
  const meta = state.tree.get(address)
  if (!meta) {
    throw new Error(`Структурные метаданные атома отсутствуют: ${address}`)
  }

  return meta
}

function assertParentExists<Meta>(state: GravityState<Meta>, parent: string | null): void {
  if (parent !== null) {
    requireAtom(state, parent)
  }
}

function assertAddressAvailable<Meta>(state: GravityState<Meta>, address: string): void {
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

function bsearchByKey<Meta>(state: GravityState<Meta>, children: string[], orderKey: OrderKey, seq: number): number {
  let left = 0
  let right = children.length

  while (left < right) {
    const middle = (left + right) >>> 1
    const current = requireTreeMeta(state, children[middle]!)

    let comparison = compareOrderKey(current.orderKey, orderKey)
    if (comparison === 0) {
      comparison = current.seq - seq
    }

    if (comparison <= 0) {
      left = middle + 1
    } else {
      right = middle
    }
  }

  return left
}

function createWithOrder<Meta>(state: GravityState<Meta>, parent: string | null, orderKey: OrderKey, input: AtomInput): Atom {
  assertParentExists(state, parent)
  assertAddressAvailable(state, input.address)

  const atom = createStoredAtom(input.address, input.meta, state)
  const treeMeta: AtomTreeMeta = {
    parent,
    orderKey: cloneOrderKey(orderKey),
    seq: state.nextSeq++,
  }

  state.atom.set(atom.address, atom)
  state.tree.set(atom.address, treeMeta)

  const children = ensureChildren(state, parent)
  const index = bsearchByKey(state, children, treeMeta.orderKey, treeMeta.seq)
  children.splice(index, 0, atom.address)

  return atom
}

function getAddressByIndexPath<Meta>(state: GravityState<Meta>, root: string | null, indexPath: readonly number[]): string | null {
  let parent = root
  let current: string | null = null

  for (const index of indexPath) {
    const children = ensureChildren(state, parent)

    if (index < 0 || index >= children.length) {
      return null
    }

    current = children[index]!
    parent = current
  }

  return current
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

const internalState = createGravityState()

export const gravity$: GravityStore = {
  meta: internalState.meta,
  atom: internalState.atom,

  createState() {
    return createGravityState()
  },

  reset(state) {
    const active = resolveState(state)
    active.meta.clear()
    active.atom.clear()
    active.tree.clear()
    active.childrenView.clear()
    active.reservations.clear()
    active.nextSeq = 0
  },

  restore(snapshot, state) {
    const active = resolveState(state)
    this.reset(active)

    for (const [address, meta] of snapshot.meta) {
      active.meta.set(address, meta)
    }

    for (const [address, treeMeta] of snapshot.tree) {
      active.tree.set(address, cloneTreeMeta(treeMeta))
    }

    for (const [parent, children] of snapshot.childrenView) {
      active.childrenView.set(parent, [...children])
    }

    for (const [address, seed] of snapshot.atom) {
      active.atom.set(address, createStoredAtom(seed.address, seed.meta, active))
    }

    active.nextSeq = snapshot.nextSeq
    return active
  },

  snapshot(state) {
    const active = resolveState(state)

    return {
      meta: new Map(active.meta),
      atom: new Map(Array.from(active.atom.values(), (entry) => [entry.address, { address: entry.address, meta: entry.meta }])),
      tree: new Map(Array.from(active.tree.entries(), ([address, meta]) => [address, cloneTreeMeta(meta)])),
      childrenView: new Map(Array.from(active.childrenView.entries(), ([parent, children]) => [parent, [...children]])),
      nextSeq: active.nextSeq,
    }
  },

  getAtom(address, state) {
    const active = resolveState(state)
    return active.atom.get(address) ?? null
  },

  getParent(address, state) {
    const active = resolveState(state)
    return active.tree.get(address)?.parent ?? null
  },

  getPath(address, state) {
    const active = resolveState(state)
    requireAtom(active, address)

    const indices: number[] = []
    let current: string | null = address

    while (current) {
      const meta = requireTreeMeta(active, current)
      const siblings = ensureChildren(active, meta.parent)
      const index = siblings.indexOf(current)

      if (index < 0) {
        throw new Error(`Витрина не содержит атом "${current}" у родителя "${meta.parent ?? "root"}"`)
      }

      indices.push(index)
      current = meta.parent
    }

    indices.reverse()
    return indices.join("/")
  },

  getChildren(parent, state) {
    const active = resolveState(state)
    return ensureChildren(active, parent).map((address) => requireAtom(active, address))
  },

  getNode(path, state) {
    const active = resolveState(state)
    const address = getAddressByIndexPath(active, null, parseIndexPath(path))
    return address ? active.atom.get(address) ?? null : null
  },

  createChildren(parent, input, state) {
    const active = resolveState(state)
    assertParentExists(active, parent)

    const children = ensureChildren(active, parent)
    const lastAddress = children.length > 0 ? children[children.length - 1]! : null
    const lastKey = lastAddress ? requireTreeMeta(active, lastAddress).orderKey : null

    return createWithOrder(active, parent, between(lastKey, null), input)
  },

  createBetween(left, right, input, state) {
    const active = resolveState(state)
    const leftMeta = left ? requireTreeMeta(active, left) : null
    const rightMeta = right ? requireTreeMeta(active, right) : null

    let parent: string | null = null

    if (leftMeta && rightMeta) {
      const leftParent = leftMeta.parent ?? ROOT
      const rightParent = rightMeta.parent ?? ROOT

      if (leftParent !== rightParent) {
        throw new Error("Соседи должны иметь одного родителя")
      }

      parent = leftMeta.parent
    } else if (leftMeta) {
      parent = leftMeta.parent
    } else if (rightMeta) {
      parent = rightMeta.parent
    }

    const leftKey = leftMeta?.orderKey ?? null
    const rightKey = rightMeta?.orderKey ?? null

    return createWithOrder(active, parent, between(leftKey, rightKey), input)
  },

  createBefore(neighbor, input, state) {
    const active = resolveState(state)
    const neighborMeta = requireTreeMeta(active, neighbor)
    const siblings = ensureChildren(active, neighborMeta.parent)
    const neighborIndex = siblings.indexOf(neighbor)

    if (neighborIndex < 0) {
      throw new Error(`Сосед отсутствует в витрине своего родителя: ${neighbor}`)
    }

    const leftAddress = neighborIndex > 0 ? siblings[neighborIndex - 1]! : null
    const leftKey = leftAddress ? requireTreeMeta(active, leftAddress).orderKey : null

    return createWithOrder(active, neighborMeta.parent, between(leftKey, neighborMeta.orderKey), input)
  },

  createAfter(neighbor, input, state) {
    const active = resolveState(state)
    const neighborMeta = requireTreeMeta(active, neighbor)
    const siblings = ensureChildren(active, neighborMeta.parent)
    const neighborIndex = siblings.indexOf(neighbor)

    if (neighborIndex < 0) {
      throw new Error(`Сосед отсутствует в витрине своего родителя: ${neighbor}`)
    }

    const rightAddress = neighborIndex + 1 < siblings.length ? siblings[neighborIndex + 1]! : null
    const rightKey = rightAddress ? requireTreeMeta(active, rightAddress).orderKey : null

    return createWithOrder(active, neighborMeta.parent, between(neighborMeta.orderKey, rightKey), input)
  },

  createNode(path, input, state) {
    const active = resolveState(state)
    const { parentPath, index } = splitParentAndIndex(path)
    const parent = parentPath ? getAddressByIndexPath(active, null, parseIndexPath(parentPath)) : null

    if (parentPath && !parent) {
      throw new Error(`Родительский путь не найден: "${parentPath}"`)
    }

    const children = ensureChildren(active, parent)

    if (index < 0 || index > children.length) {
      throw new Error(`Индекс вне диапазона для пути "${path}"`)
    }

    if (index < children.length) {
      return this.createBefore(children[index]!, input, active)
    }

    return this.createChildren(parent, input, active)
  },

  reserveSibling(address, target, at = "after", state) {
    const active = resolveState(state)
    assertAddressAvailable(active, address)

    const parent = this.getParent(target, active)
    const children = ensureChildren(active, parent)
    const targetIndex = children.indexOf(target)

    if (targetIndex < 0) {
      throw new Error("Сосед не найден в витрине")
    }

    const leftAddress = at === "before" ? (targetIndex > 0 ? children[targetIndex - 1]! : null) : target
    const rightAddress = at === "before" ? target : targetIndex + 1 < children.length ? children[targetIndex + 1]! : null

    const leftKey = leftAddress ? requireTreeMeta(active, leftAddress).orderKey : null
    const rightKey = rightAddress ? requireTreeMeta(active, rightAddress).orderKey : null

    active.reservations.set(address, {
      parent,
      orderKey: between(leftKey, rightKey),
    })
  },

  reserveByIndexPath(address, path, state) {
    const active = resolveState(state)
    assertAddressAvailable(active, address)

    const { parentPath, index } = splitParentAndIndex(path)
    const parent = parentPath ? getAddressByIndexPath(active, null, parseIndexPath(parentPath)) : null

    if (parentPath && !parent) {
      throw new Error(`Родительский путь не найден: "${parentPath}"`)
    }

    const children = ensureChildren(active, parent)

    if (index < 0 || index > children.length) {
      throw new Error(`Индекс вне диапазона для пути "${path}"`)
    }

    const leftAddress = index > 0 ? children[index - 1]! : null
    const rightAddress = index < children.length ? children[index]! : null

    const leftKey = leftAddress ? requireTreeMeta(active, leftAddress).orderKey : null
    const rightKey = rightAddress ? requireTreeMeta(active, rightAddress).orderKey : null

    active.reservations.set(address, {
      parent,
      orderKey: between(leftKey, rightKey),
    })
  },

  attachReserved(input, state) {
    const active = resolveState(state)
    const reserved = active.reservations.get(input.address)

    if (!reserved) {
      return this.createChildren(null, input, active)
    }

    active.reservations.delete(input.address)
    return createWithOrder(active, reserved.parent, reserved.orderKey, input)
  },
}
