import { unpackMeta } from "./layout-heap"
import type { BytecodeDump, ConditionDump, FieldDump, HeapBlockDump, HeapStats, WeakDump, StateDump, StringAtlasDump, StringDump, TransitionDump } from "@matrix/types/gpu"

export function debugLog(enabled: boolean, ...args: unknown[]): void {
  if (!enabled) {
    return
  }
  console.log(...args)
}

/**
 * Дамп блока heap.
 *
 * @param heap - Heap данные.
 * @param blockPtr - Смещение блока в heap.
 * @returns Структурированный дамп блока.
 */
export function dumpHeap(heap: Uint32Array, blockPtr: number): HeapBlockDump {
  const localCount = heap[blockPtr] ?? 0
  const entangledCount = heap[blockPtr + 1] ?? 0

  const fields: FieldDump[] = []
  for (let index = 0; index < localCount; index++) {
    const descOffset = 2 + index * 2
    const fieldId = heap[descOffset] ?? 0
    const packedMeta = heap[descOffset + 1] ?? 0
    const { type, size, offset } = unpackMeta(packedMeta)

    fields.push({
      fieldId,
      type,
      typeName: getTypeName(type),
      size,
      offset,
    })
  }

  const entangledPointers: number[] = []
  if (entangledCount > 0) {
    const entangledPtrsOffset = 2 + localCount * 2
    for (let index = 0; index < entangledCount; index++) {
      entangledPointers.push(heap[entangledPtrsOffset + index] ?? 0)
    }
  }

  return {
    blockPtr,
    localCount,
    entangledCount,
    fields,
    entangledPointers,
  }
}

/**
 * Дамп bytecode суперпозиции.
 *
 * @param bytecode - Bytecode данные.
 * @param offset - Смещение начала bytecode для этой браны.
 * @returns Структурированный дамп bytecode.
 */
export function dumpBytecode(bytecode: Uint32Array, offset: number): BytecodeDump {
  const firstStatePtr = bytecode[offset] ?? 0
  const stateTableSize = firstStatePtr - offset
  const states: StateDump[] = []

  for (let stateIdx = 0; stateIdx < stateTableSize; stateIdx++) {
    const statePtrOffset = offset + stateIdx
    const statePtr = bytecode[statePtrOffset] ?? 0
    const isTerminal = statePtr === 0
    const transitions: TransitionDump[] = []

    if (!isTerminal) {
      const trCount = bytecode[statePtr] ?? 0

      for (let trIdx = 0; trIdx < trCount; trIdx++) {
        const trOffset = statePtr + 1 + trIdx * 2
        const target = bytecode[trOffset] ?? 0
        const condPtr = bytecode[trOffset + 1] ?? 0
        const conditions: ConditionDump[] = []

        if (condPtr !== 0) {
          const condCount = bytecode[condPtr] ?? 0

          for (let condIdx = 0; condIdx < condCount; condIdx++) {
            const condOffset = condPtr + 1 + condIdx * 4
            const type = bytecode[condOffset] ?? 0
            const fieldId = bytecode[condOffset + 1] ?? 0
            const op = bytecode[condOffset + 2] ?? 0
            const valEncoded = bytecode[condOffset + 3] ?? 0

            conditions.push({
              conditionIdx: condIdx,
              type,
              typeName: getTypeName(type),
              fieldId,
              op,
              opName: getOpName(op),
              valEncoded,
              valDecoded: type === 0 ? bitcastToF32(valEncoded) : valEncoded,
            })
          }
        }

        transitions.push({
          transitionIdx: trIdx,
          target,
          condPtr,
          conditions,
        })
      }
    }

    states.push({
      stateIdx,
      statePtr,
      transitionCount: transitions.length,
      transitions,
      isTerminal,
    })
  }

  return {
    offset,
    stateTableSize,
    states,
  }
}

/**
 * Дамп string table.
 *
 * @param stringTable - String table для дампа.
 * @returns Структурированный дамп строк.
 */
export function dumpStringTable(stringTable: string[]): StringAtlasDump {
  const strings: StringDump[] = []

  for (let index = 0; index < stringTable.length; index++) {
    const value = stringTable[index] ?? ""
    strings.push({
      id: index,
      value,
      length: value.length,
      hash: fnv1a32(value),
      pointer: index,
    })
  }

  return {
    count: stringTable.length,
    strings,
  }
}

/**
 * Полная отладка состояния Weak.
 *
 * @param heap - Heap данные.
 * @param bytecode - Bytecode данные.
 * @param bytecodeOffsets - Смещения bytecode для каждой браны.
 * @param braneBlockPtrs - Смещения блоков бран в heap.
 * @param stringTable - Каноническая string table.
 * @returns Полный дамп GPU-derived состояния.
 */
export async function dumpWeak(
  heap: Uint32Array,
  bytecode: Uint32Array,
  bytecodeOffsets: Uint32Array,
  braneBlockPtrs: number[],
  stringTable: string[],
): Promise<WeakDump> {
  const heapBlocks: HeapBlockDump[] = []
  const bytecodeDumps: BytecodeDump[] = []

  for (let index = 0; index < braneBlockPtrs.length; index++) {
    heapBlocks.push(dumpHeap(heap, braneBlockPtrs[index]!))
    bytecodeDumps.push(dumpBytecode(bytecode, bytecodeOffsets[index]!))
  }

  return {
    braneCount: braneBlockPtrs.length,
    heapBlocks,
    bytecodeDumps,
    stringAtlas: dumpStringTable(stringTable),
    heapStats: getHeapStats(heap, braneBlockPtrs),
  }
}

/**
 * Получить статистику heap.
 *
 * @param heap - Heap данные.
 * @param blockPtrs - Смещения блоков бран.
 * @returns Статистика использования heap.
 */
export function getHeapStats(heap: Uint32Array, blockPtrs: number[]): HeapStats {
  const totalSize = heap.length
  const arrayReserveStart = totalSize - (heap[totalSize - 1] ?? 0)

  let usedSize = 0
  for (const blockPtr of blockPtrs) {
    const localCount = heap[blockPtr] ?? 0
    const entangledCount = heap[blockPtr + 1] ?? 0

    let valueWords = 0
    for (let index = 0; index < localCount; index++) {
      const descOffset = 2 + index * 2
      const packedMeta = heap[descOffset + 1] ?? 0
      valueWords += (packedMeta >>> 16) & 0xff
    }

    usedSize += 2 + localCount * 2 + entangledCount + valueWords
  }

  const freeSize = totalSize - usedSize - arrayReserveStart
  const utilization = (usedSize / totalSize) * 100

  return {
    totalSize,
    usedSize,
    arrayReserve: arrayReserveStart,
    freeSize,
    utilization,
  }
}

/**
 * Визуализация bytecode в виде строки.
 *
 * @param bytecode - Bytecode данные.
 * @param offset - Смещение начала bytecode.
 * @returns Текстовое представление bytecode.
 */
export function visualizeBytecode(bytecode: Uint32Array, offset: number): string {
  const lines: string[] = []
  const firstStatePtr = bytecode[offset] ?? 0
  const stateTableSize = firstStatePtr - offset

  lines.push(`Bytecode @ ${offset} (states: ${stateTableSize})`)
  lines.push("")

  for (let stateIdx = 0; stateIdx < stateTableSize; stateIdx++) {
    const statePtrOffset = offset + stateIdx
    const statePtr = bytecode[statePtrOffset] ?? 0

    lines.push(`State ${stateIdx} (ptr=${statePtr}):`)

    if (statePtr === 0) {
      lines.push("  [terminal]")
      continue
    }

    const trCount = bytecode[statePtr] ?? 0

    for (let trIdx = 0; trIdx < trCount; trIdx++) {
      const trOffset = statePtr + 1 + trIdx * 2
      const target = bytecode[trOffset] ?? 0
      const condPtr = bytecode[trOffset + 1] ?? 0

      lines.push(`  -> State ${target}`)

      if (condPtr === 0) {
        continue
      }

      const condCount = bytecode[condPtr] ?? 0
      const conditions: string[] = []

      for (let condIdx = 0; condIdx < condCount; condIdx++) {
        const condOffset = condPtr + 1 + condIdx * 4
        const type = bytecode[condOffset] ?? 0
        const fieldId = bytecode[condOffset + 1] ?? 0
        const op = bytecode[condOffset + 2] ?? 0
        const valEncoded = bytecode[condOffset + 3] ?? 0
        const valDecoded = type === 0 ? bitcastToF32(valEncoded) : valEncoded

        conditions.push(`f${fieldId} ${getOpName(op)} ${valDecoded}`)
      }

      if (conditions.length > 0) {
        lines.push(`    if: ${conditions.join(" && ")}`)
      }
    }
  }

  return lines.join("\n")
}

function fnv1a32(str: string): number {
  const FNV_PRIME = 0x01000193
  const FNV_OFFSET = 0x811c9dc5
  let hash = FNV_OFFSET >>> 0

  for (let index = 0; index < str.length; index++) {
    const codePoint = str.codePointAt(index)!
    hash ^= codePoint & 0xff
    hash = Math.imul(hash, FNV_PRIME) >>> 0
    hash ^= (codePoint >> 8) & 0xff
    hash = Math.imul(hash, FNV_PRIME) >>> 0
    hash ^= (codePoint >> 16) & 0xff
    hash = Math.imul(hash, FNV_PRIME) >>> 0
    hash ^= (codePoint >> 24) & 0xff
    hash = Math.imul(hash, FNV_PRIME) >>> 0

    if (codePoint > 0xffff) {
      index++
    }
  }

  return hash >>> 0
}

function getTypeName(type: number): string {
  const names: Record<number, string> = {
    0: "FLOAT",
    1: "UINT",
    2: "BOOL",
    3: "STRING",
    4: "ARRAY",
  }
  return names[type] ?? `UNKNOWN(${type})`
}

function getOpName(op: number): string {
  const names: Record<number, string> = {
    0: "EQ",
    1: "NEQ",
    2: "GT",
    3: "LT",
    4: "GTE",
    5: "LTE",
    6: "IN",
    7: "NOT_IN",
    8: "INCLUDE",
    9: "NOT_INCLUDE",
    10: "LENGTH",
    11: "IS_EMPTY",
  }
  return names[op] ?? `UNKNOWN(${op})`
}

function bitcastToF32(value: number): number {
  const buffer = new Uint32Array([value])
  return new Float32Array(buffer.buffer)[0] ?? 0
}
