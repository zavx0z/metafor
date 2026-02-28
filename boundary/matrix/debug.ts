/**
 * Утилиты для отладки Matrix.
 *
 * @packageDocumentation
 */

import { unpackMeta } from "./heap"
import type { StringAtlas } from "./StringAtlas"
import type {
  HeapStats,
  HeapBlockDump,
  FieldDump,
  BytecodeDump,
  StateDump,
  TransitionDump,
  ConditionDump,
  StringAtlasDump,
  StringDump,
  MatrixDump,
} from "./debug.t"

/**
 * Дамп блока heap.
 *
 * @param heap - Heap данные
 * @param blockPtr - Смещение блока в heap
 * @returns Структурированный дамп блока
 *
 * @example
 * ```typescript
 * const blockPtr = braneBlockPtrs[0]!
 * const dump = dumpHeap(heap, blockPtr)
 * console.log(`Block @ ${dump.blockPtr}, local=${dump.localCount}`)
 * ```
 */
export function dumpHeap(heap: Uint32Array, blockPtr: number): HeapBlockDump {
  const localCount = heap[blockPtr] ?? 0
  const entangledCount = heap[blockPtr + 1] ?? 0

  const fields: FieldDump[] = []
  for (let i = 0; i < localCount; i++) {
    const descOffset = 2 + i * 2
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
    for (let i = 0; i < entangledCount; i++) {
      entangledPointers.push(heap[entangledPtrsOffset + i] ?? 0)
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
 * @param bytecode - Bytecode данные
 * @param offset - Смещение начала bytecode для этой браны
 * @returns Структурированный дамп bytecode
 *
 * @example
 * ```typescript
 * const offset = bytecodeOffsets[0]!
 * const dump = dumpBytecode(bytecode, offset)
 * console.log(`States: ${dump.stateTableSize}`)
 * ```
 */
export function dumpBytecode(bytecode: Uint32Array, offset: number): BytecodeDump {
  const firstStatePtr = bytecode[offset] ?? 0
  // stateTableSize = количество состояний = firstStatePtr - offset
  // (так как state_ptr[i] — абсолютное смещение, и state table занимает firstStatePtr - offset слов)
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
 * Дамп StringAtlas.
 *
 * @param atlas - StringAtlas для дампа
 * @returns Структурированный дамп атласа
 *
 * @example
 * ```typescript
 * const atlas = getStringAtlas()
 * const dump = dumpStringAtlas(atlas)
 * console.log(`Strings: ${dump.count}`)
 * ```
 */
export function dumpStringAtlas(atlas: StringAtlas): StringAtlasDump {
  const exported = atlas.exportData()
  const strings: StringDump[] = []

  for (let i = 0; i < exported.count; i++) {
    const ptr = exported.registry[i * 3] ?? 0
    const len = exported.registry[i * 3 + 1] ?? 0
    const hash = exported.registry[i * 3 + 2] ?? 0

    const codePoints: number[] = []
    for (let j = 0; j < len; j++) {
      codePoints.push(exported.heap[ptr + j] ?? 0)
    }
    const str = String.fromCodePoint(...codePoints)

    strings.push({
      id: i,
      value: str,
      length: len,
      hash,
      pointer: ptr,
    })
  }

  return {
    count: exported.count,
    strings,
  }
}

/**
 * Получить имя типа по коду.
 */
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

/**
 * Получить имя оператора по коду.
 */
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

/**
 * Bitcast: u32 → float32.
 */
function bitcastToF32(value: number): number {
  const buf = new Uint32Array([value])
  return new Float32Array(buf.buffer)[0] ?? 0
}

/**
 * Полная отладка состояния Matrix.
 *
 * @param heap - Heap данные
 * @param bytecode - Bytecode данные
 * @param bytecodeOffsets - Смещения bytecode для каждой браны
 * @param braneBlockPtrs - Смещения блоков бран в heap
 * @returns Полный дамп Matrix
 *
 * @example
 * ```typescript
 * import { dumpMatrix } from "@metafor/matrix/debug"
 *
 * // После write()
 * const dump = await dumpMatrix(heap, bytecode, bytecodeOffsets, braneBlockPtrs)
 * console.log(`Branes: ${dump.braneCount}`)
 * ```
 */
export async function dumpMatrix(
  heap: Uint32Array,
  bytecode: Uint32Array,
  bytecodeOffsets: Uint32Array,
  braneBlockPtrs: number[],
): Promise<MatrixDump> {
  const heapBlocks: HeapBlockDump[] = []
  const bytecodeDumps: BytecodeDump[] = []

  for (let i = 0; i < braneBlockPtrs.length; i++) {
    heapBlocks.push(dumpHeap(heap, braneBlockPtrs[i]!))
    bytecodeDumps.push(dumpBytecode(bytecode, bytecodeOffsets[i]!))
  }

  let stringAtlas: StringAtlasDump | null = null
  try {
    const { getStringAtlas } = await import("./StringAtlas")
    stringAtlas = dumpStringAtlas(getStringAtlas())
  } catch {
    // StringAtlas может быть не доступен
  }

  return {
    braneCount: braneBlockPtrs.length,
    heapBlocks,
    bytecodeDumps,
    stringAtlas,
    heapStats: getHeapStats(heap, braneBlockPtrs),
  }
}

/**
 * Получить статистику heap.
 *
 * @param heap - Heap данные
 * @param blockPtrs - Смещения блоков бран
 * @returns Статистика использования heap
 *
 * @example
 * ```typescript
 * const stats = getHeapStats(heap, braneBlockPtrs)
 * console.log(`Heap: ${stats.utilization.toFixed(1)}% used`)
 * ```
 */
export function getHeapStats(
  heap: Uint32Array,
  blockPtrs: number[],
): HeapStats {
  const totalSize = heap.length
  const arrayReserveStart = totalSize - (heap[totalSize - 1] ?? 0)

  // Считаем занятые блоки
  let usedSize = 0
  for (const blockPtr of blockPtrs) {
    const localCount = heap[blockPtr] ?? 0
    const entangledCount = heap[blockPtr + 1] ?? 0

    // Заголовок: 2 слова
    // Дескрипторы: localCount * 2 слова
    // Указатели: entangledCount слова
    // Значения: считаем по packed_meta
    let valueWords = 0
    for (let i = 0; i < localCount; i++) {
      const descOffset = 2 + i * 2
      const packedMeta = heap[descOffset + 1] ?? 0
      const size = (packedMeta >>> 16) & 0xff
      valueWords += size
    }

    const blockSize = 2 + localCount * 2 + entangledCount + valueWords
    usedSize += blockSize
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
 * @param bytecode - Bytecode данные
 * @param offset - Смещение начала bytecode
 * @returns Текстовое представление bytecode
 *
 * @example
 * ```typescript
 * const viz = visualizeBytecode(bytecode, bytecodeOffsets[0]!)
 * console.log(viz)
 * ```
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

      lines.push(`  → State ${target}`)

      if (condPtr === 0) continue

      const condCount = bytecode[condPtr] ?? 0
      const conditions: string[] = []

      for (let condIdx = 0; condIdx < condCount; condIdx++) {
        const condOffset = condPtr + 1 + condIdx * 4
        const type = bytecode[condOffset] ?? 0
        const fieldId = bytecode[condOffset + 1] ?? 0
        const op = bytecode[condOffset + 2] ?? 0
        const valEncoded = bytecode[condOffset + 3] ?? 0

        const typeName = getTypeName(type)
        const opName = getOpName(op)
        const valDecoded = type === 0 ? bitcastToF32(valEncoded) : valEncoded

        conditions.push(`f${fieldId} ${opName} ${valDecoded}`)
      }

      if (conditions.length > 0) {
        lines.push(`    if: ${conditions.join(" && ")}`)
      }
    }
  }

  return lines.join("\n")
}
