/**
 * @boundary/string-pack — нейтральная материализация строковых таблиц.
 *
 * Этот модуль не является частью канонического store и не принадлежит GPU-слою.
 * Он превращает каноническую `stringTable` в производные таблицы, которые нужны
 * для debug/export или локальной GPU-упаковки.
 *
 * @packageDocumentation
 */

/**
 * Материализует полную производную таблицу строк.
 *
 * Канонический `Boundary store` хранит только `stringTable` и string id.
 * UTF-32 heap и hash registry создаются локально из этого канона.
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

/**
 * Материализует только append-хвост производной строковой таблицы.
 *
 * Используется там, где каноническая `stringTable` выросла append-only и можно
 * дописать только новые строки без перепаковки уже существующего префикса.
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
    const codePoints = encodeUtf32(value)

    registry.push(pointer, codePoints.length, hash)
    heap.push(...codePoints)
  }

  return {
    registry: new Uint32Array(registry),
    heap: new Uint32Array(heap),
    count: stringTable.length - startIndex,
  }
}

function encodeUtf32(value: string): number[] {
  const codePoints: number[] = []
  for (let index = 0; index < value.length; ) {
    const codePoint = value.codePointAt(index)!
    codePoints.push(codePoint)
    index += codePoint > 0xffff ? 2 : 1
  }
  return codePoints
}

function fnv1a32(value: string): number {
  const FNV_PRIME = 0x01000193
  const FNV_OFFSET = 0x811c9dc5

  let hash = FNV_OFFSET >>> 0

  for (let index = 0; index < value.length; index++) {
    const codePoint = value.codePointAt(index)!
    hash ^= codePoint & 0xff
    hash = Math.imul(hash, FNV_PRIME) >>> 0
    hash ^= (codePoint >> 8) & 0xff
    hash = Math.imul(hash, FNV_PRIME) >>> 0
    hash ^= (codePoint >> 16) & 0xff
    hash = Math.imul(hash, FNV_PRIME) >>> 0
    hash ^= (codePoint >> 24) & 0xff
    hash = Math.imul(hash, FNV_PRIME) >>> 0

    if (codePoint > 0xffff) index++
  }

  return hash >>> 0
}
