/**
 * `@dark/gravity/store` — структурный store дерева meta-атомов.
 *
 * Слой хранит только:
 * - meta по адресу,
 * - atom по адресу,
 * - приватную геометрию дерева (parent + lexicographic order key).
 *
 * Путь атома вычисляется из фактической позиции в дереве.
 */

import type { Atom, AtomInput, AtomTreeMeta, OrderKey, Reservation, Store } from "./store.t.js"

const ROOT = ""
const BYTE_BASE = 256

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

/**
 * Структурный store домена Gravity.
 *
 * Публично экспонирует только dumb maps `meta` и `atom`.
 * Родители, order keys и резервации остаются приватной механикой.
 */
export class GravityStore<Meta = unknown> implements Store<Meta> {
  public readonly meta = new Map<string, Meta>()
  public readonly atom = new Map<string, Atom>()

  private readonly tree = new Map<string, AtomTreeMeta>()
  private readonly childrenView = new Map<string, string[]>()
  private readonly reservations = new Map<string, Reservation>()
  private nextSeq = 0

  public reset(): void {
    this.meta.clear()
    this.atom.clear()
    this.tree.clear()
    this.childrenView.clear()
    this.reservations.clear()
    this.nextSeq = 0
  }

  private parentKey(parent: string | null): string {
    return parent ?? ROOT
  }

  private ensureChildren(parent: string | null): string[] {
    const key = this.parentKey(parent)
    const existing = this.childrenView.get(key)

    if (existing) {
      return existing
    }

    const children: string[] = []
    this.childrenView.set(key, children)
    return children
  }

  private requireAtom(address: string): Atom {
    const atom = this.atom.get(address)
    if (!atom) {
      throw new Error(`Атом не найден: ${address}`)
    }

    return atom
  }

  private requireTreeMeta(address: string): AtomTreeMeta {
    const meta = this.tree.get(address)
    if (!meta) {
      throw new Error(`Структурные метаданные атома отсутствуют: ${address}`)
    }

    return meta
  }

  private assertParentExists(parent: string | null): void {
    if (parent !== null) {
      this.requireAtom(parent)
    }
  }

  private assertAddressAvailable(address: string): void {
    if (!address) {
      throw new Error("У атома отсутствует address")
    }

    if (this.atom.has(address)) {
      throw new Error(`Атом уже существует: ${address}`)
    }

    if (this.reservations.has(address)) {
      throw new Error(`Атом уже зарезервирован: ${address}`)
    }
  }

  private createStoredAtom(input: AtomInput): Atom {
    const store = this
    const atom = {
      get path() {
        return store.getPath(input.address)
      },
      meta: input.meta,
      address: input.address,
    } satisfies Atom

    return Object.freeze(atom)
  }

  private bsearchByKey(children: string[], orderKey: OrderKey, seq: number): number {
    let left = 0
    let right = children.length

    while (left < right) {
      const middle = (left + right) >>> 1
      const current = this.requireTreeMeta(children[middle]!)

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

  private createWithOrder(parent: string | null, orderKey: OrderKey, input: AtomInput): Atom {
    this.assertParentExists(parent)
    this.assertAddressAvailable(input.address)

    const atom = this.createStoredAtom(input)
    const treeMeta: AtomTreeMeta = {
      parent,
      orderKey: Uint8Array.from(orderKey),
      seq: this.nextSeq++,
    }

    this.atom.set(atom.address, atom)
    this.tree.set(atom.address, treeMeta)

    const children = this.ensureChildren(parent)
    const index = this.bsearchByKey(children, treeMeta.orderKey, treeMeta.seq)
    children.splice(index, 0, atom.address)

    return atom
  }

  private getAddressByIndexPath(root: string | null, indexPath: readonly number[]): string | null {
    let parent = root
    let current: string | null = null

    for (const index of indexPath) {
      const children = this.ensureChildren(parent)

      if (index < 0 || index >= children.length) {
        return null
      }

      current = children[index]!
      parent = current
    }

    return current
  }

  public getAtom(address: string): Atom | null {
    return this.atom.get(address) ?? null
  }

  public getParent(address: string): string | null {
    return this.tree.get(address)?.parent ?? null
  }

  public getPath(address: string): string {
    this.requireAtom(address)

    const indices: number[] = []
    let current: string | null = address

    while (current) {
      const meta = this.requireTreeMeta(current)
      const siblings = this.ensureChildren(meta.parent)
      const index = siblings.indexOf(current)

      if (index < 0) {
        throw new Error(`Витрина не содержит атом "${current}" у родителя "${meta.parent ?? "root"}"`)
      }

      indices.push(index)
      current = meta.parent
    }

    indices.reverse()
    return indices.join("/")
  }

  public getChildren(parent: string | null): readonly Atom[] {
    return this.ensureChildren(parent).map((address) => this.requireAtom(address))
  }

  public getNode(path: string): Atom | null {
    const address = this.getAddressByIndexPath(null, parseIndexPath(path))
    return address ? this.getAtom(address) : null
  }

  public createChildren(parent: string | null, input: AtomInput): Atom {
    this.assertParentExists(parent)

    const children = this.ensureChildren(parent)
    const lastAddress = children.length > 0 ? children[children.length - 1]! : null
    const lastKey = lastAddress ? this.requireTreeMeta(lastAddress).orderKey : null

    return this.createWithOrder(parent, between(lastKey, null), input)
  }

  public createBetween(left: string | null, right: string | null, input: AtomInput): Atom {
    const leftMeta = left ? this.requireTreeMeta(left) : null
    const rightMeta = right ? this.requireTreeMeta(right) : null

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

    return this.createWithOrder(parent, between(leftKey, rightKey), input)
  }

  public createBefore(neighbor: string, input: AtomInput): Atom {
    const neighborMeta = this.requireTreeMeta(neighbor)
    const siblings = this.ensureChildren(neighborMeta.parent)
    const neighborIndex = siblings.indexOf(neighbor)

    if (neighborIndex < 0) {
      throw new Error(`Сосед отсутствует в витрине своего родителя: ${neighbor}`)
    }

    const leftAddress = neighborIndex > 0 ? siblings[neighborIndex - 1]! : null
    const leftKey = leftAddress ? this.requireTreeMeta(leftAddress).orderKey : null

    return this.createWithOrder(neighborMeta.parent, between(leftKey, neighborMeta.orderKey), input)
  }

  public createAfter(neighbor: string, input: AtomInput): Atom {
    const neighborMeta = this.requireTreeMeta(neighbor)
    const siblings = this.ensureChildren(neighborMeta.parent)
    const neighborIndex = siblings.indexOf(neighbor)

    if (neighborIndex < 0) {
      throw new Error(`Сосед отсутствует в витрине своего родителя: ${neighbor}`)
    }

    const rightAddress = neighborIndex + 1 < siblings.length ? siblings[neighborIndex + 1]! : null
    const rightKey = rightAddress ? this.requireTreeMeta(rightAddress).orderKey : null

    return this.createWithOrder(neighborMeta.parent, between(neighborMeta.orderKey, rightKey), input)
  }

  public createNode(path: string, input: AtomInput): Atom {
    const { parentPath, index } = splitParentAndIndex(path)
    const parent = parentPath ? this.getAddressByIndexPath(null, parseIndexPath(parentPath)) : null

    if (parentPath && !parent) {
      throw new Error(`Родительский путь не найден: "${parentPath}"`)
    }

    const children = this.ensureChildren(parent)

    if (index < 0 || index > children.length) {
      throw new Error(`Индекс вне диапазона для пути "${path}"`)
    }

    if (index < children.length) {
      return this.createBefore(children[index]!, input)
    }

    return this.createChildren(parent, input)
  }

  public reserveSibling(address: string, target: string, at: "before" | "after" = "after"): void {
    this.assertAddressAvailable(address)

    const parent = this.getParent(target)
    const children = this.ensureChildren(parent)
    const targetIndex = children.indexOf(target)

    if (targetIndex < 0) {
      throw new Error("Сосед не найден в витрине")
    }

    const leftAddress = at === "before" ? (targetIndex > 0 ? children[targetIndex - 1]! : null) : target
    const rightAddress = at === "before" ? target : targetIndex + 1 < children.length ? children[targetIndex + 1]! : null

    const leftKey = leftAddress ? this.requireTreeMeta(leftAddress).orderKey : null
    const rightKey = rightAddress ? this.requireTreeMeta(rightAddress).orderKey : null

    this.reservations.set(address, {
      parent,
      orderKey: between(leftKey, rightKey),
    })
  }

  public reserveByIndexPath(address: string, path: string): void {
    this.assertAddressAvailable(address)

    const { parentPath, index } = splitParentAndIndex(path)
    const parent = parentPath ? this.getAddressByIndexPath(null, parseIndexPath(parentPath)) : null

    if (parentPath && !parent) {
      throw new Error(`Родительский путь не найден: "${parentPath}"`)
    }

    const children = this.ensureChildren(parent)

    if (index < 0 || index > children.length) {
      throw new Error(`Индекс вне диапазона для пути "${path}"`)
    }

    const leftAddress = index > 0 ? children[index - 1]! : null
    const rightAddress = index < children.length ? children[index]! : null

    const leftKey = leftAddress ? this.requireTreeMeta(leftAddress).orderKey : null
    const rightKey = rightAddress ? this.requireTreeMeta(rightAddress).orderKey : null

    this.reservations.set(address, {
      parent,
      orderKey: between(leftKey, rightKey),
    })
  }

  /**
   * Привязать атом к заранее зарезервированному structural slot.
   *
   * Если резервации нет, атом попадёт в конец корня.
   */
  public attachReserved(input: AtomInput): Atom {
    const reserved = this.reservations.get(input.address)

    if (!reserved) {
      return this.createChildren(null, input)
    }

    this.reservations.delete(input.address)
    return this.createWithOrder(reserved.parent, reserved.orderKey, input)
  }
}

/** Синглтон структурного store слоя Gravity. */
export const gravity$ = new GravityStore()
