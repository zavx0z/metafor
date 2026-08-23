/**
 * @matrix/weak/gpu/string-pack — материализация string atlas для GPU runtime.
 *
 * Модуль читает каноническую `stringTable` Matrix и превращает её в
 * производные таблицы, пригодные для GPU-буферов слабого runtime.
 *
 * @packageDocumentation
 */

/**
 * Материализует полную производную таблицу строк.
 *
 * Канонический `Matrix store` хранит только `stringTable` и string id.
 * Heap из UTF-16 code units и hash registry создаются локально для GPU
 * runtime. UTF-16 выбран намеренно: длина и порядок строк совпадают с
 * JavaScript, где строковые операции определены публичным контрактом.
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
    const codePoints = encodeUtf16(value)

    registry.push(pointer, codePoints.length, hash)
    heap.push(...codePoints)
  }

  return {
    registry: new Uint32Array(registry),
    heap: new Uint32Array(heap),
    count: stringTable.length,
  }
}

/**
 * Материализует только append-хвост производной строковой таблицы.
 *
 * Используется там, где каноническая `stringTable` выросла append-only и можно
 * дописать только новые строки без перепаковки уже существующего префикса в GPU-буферах.
 */
export function createStringAtlasAppendExport(
  stringTable: string[],
  startIndex: number,
  heapOffset: number,
): {
  registry: Uint32Array
  heap: Uint32Array
  count: number
} {
  const registry: number[] = []
  const heap: number[] = []

  for (let index = startIndex; index < stringTable.length; index++) {
    const value = stringTable[index]!
    const pointer = heapOffset + heap.length
    const hash = fnv1a32(value)
    const codePoints = encodeUtf16(value)

    registry.push(pointer, codePoints.length, hash)
    heap.push(...codePoints)
  }

  return {
    registry: new Uint32Array(registry),
    heap: new Uint32Array(heap),
    count: stringTable.length - startIndex,
  }
}

function encodeUtf16(value: string): number[] {
  const codePoints: number[] = []
  for (let index = 0; index < value.length; index++) {
    codePoints.push(value.charCodeAt(index))
  }
  return codePoints
}

function fnv1a32(value: string): number {
  const FNV_PRIME = 0x01000193
  const FNV_OFFSET = 0x811c9dc5

  let hash = FNV_OFFSET >>> 0

  for (let index = 0; index < value.length; index++) {
    const codePoint = value.charCodeAt(index)
    hash ^= codePoint & 0xff
    hash = Math.imul(hash, FNV_PRIME) >>> 0
    hash ^= (codePoint >> 8) & 0xff
    hash = Math.imul(hash, FNV_PRIME) >>> 0
    hash ^= (codePoint >> 16) & 0xff
    hash = Math.imul(hash, FNV_PRIME) >>> 0
    hash ^= (codePoint >> 24) & 0xff
    hash = Math.imul(hash, FNV_PRIME) >>> 0
  }

  return hash >>> 0
}
