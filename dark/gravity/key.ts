import type { OrderKey } from "./store.t.js"

const BYTE_BASE = 256

export function cloneOrderKey(orderKey: OrderKey): OrderKey {
  return Uint8Array.from(orderKey)
}

function byteAt(key: OrderKey, index: number, fallback: number): number {
  return index < key.length ? key[index]! : fallback
}

export function compareOrderKey(a: OrderKey, b: OrderKey): number {
  const size = Math.min(a.length, b.length)
  for (let index = 0; index < size; index++) {
    const delta = a[index]! - b[index]!
    if (delta !== 0) return delta
  }
  return a.length - b.length
}

/**
 * Строит ключ строго между `a` и `b`.
 *
 * `null` трактуется как `-∞` или `+∞`.
 */
export function between(a: OrderKey | null, b: OrderKey | null): OrderKey {
  if (a === null && b === null) return Uint8Array.from([128])

  if (a === null) {
    if (b!.length === 0) return Uint8Array.from([127])
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

  if (b === null) return Uint8Array.from([...a, 128])

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
