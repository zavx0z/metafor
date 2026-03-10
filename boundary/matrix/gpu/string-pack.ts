/**
 * @boundary/matrix/gpu/string-pack — GPU-local string materialization.
 *
 * Canonical Boundary store keeps only `stringTable` and string ids.
 * UTF-32 packing and hash registry are derived locally for GPU buffers.
 *
 * @packageDocumentation
 */

export function createStringAtlasExport(stringTable: string[]): {
  registry: Uint32Array
  heap: Uint32Array
  count: number
} {
  const registry: number[] = []
  const heap: number[] = []

  for (let index = 0; index < stringTable.length; index++) {
    const value = stringTable[index]!
    const pointer = heap.length
    const hash = fnv1a32(value)
    const codePoints = encodeUtf32(value)

    registry.push(pointer, codePoints.length, hash)
    heap.push(...codePoints)
  }

  return {
    registry: new Uint32Array(registry),
    heap: new Uint32Array(heap),
    count: stringTable.length,
  }
}

function encodeUtf32(str: string): number[] {
  const codePoints: number[] = []
  for (let i = 0; i < str.length; ) {
    const codePoint = str.codePointAt(i)!
    codePoints.push(codePoint)
    i += codePoint > 0xffff ? 2 : 1
  }
  return codePoints
}

function fnv1a32(str: string): number {
  const FNV_PRIME = 0x01000193
  const FNV_OFFSET = 0x811c9dc5

  let hash = FNV_OFFSET >>> 0

  for (let i = 0; i < str.length; i++) {
    const codePoint = str.codePointAt(i)!
    hash ^= codePoint & 0xff
    hash = Math.imul(hash, FNV_PRIME) >>> 0
    hash ^= (codePoint >> 8) & 0xff
    hash = Math.imul(hash, FNV_PRIME) >>> 0
    hash ^= (codePoint >> 16) & 0xff
    hash = Math.imul(hash, FNV_PRIME) >>> 0
    hash ^= (codePoint >> 24) & 0xff
    hash = Math.imul(hash, FNV_PRIME) >>> 0

    if (codePoint > 0xffff) i++
  }

  return hash >>> 0
}
