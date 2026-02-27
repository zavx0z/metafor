/**
 * Утилиты для отладки Matrix.
 *
 * @packageDocumentation
 */

import { unpackMeta } from "./heap"
import type { StringAtlas } from "./StringAtlas"

/**
 * Дамп блока heap.
 *
 * @param heap - Heap данные
 * @param blockPtr - Смещение блока в heap
 *
 * @example
 * ```typescript
 * const blockPtr = braneBlockPtrs[0]!
 * dumpHeap(heap, blockPtr)
 * // Block @ 1, local=2, entangled=0
 * //   Field 0: type=0(FLOAT), size=1, offset=4
 * //   Field 1: type=2(BOOL), size=1, offset=5
 * ```
 */
export function dumpHeap(heap: Uint32Array, blockPtr: number): void {
  const localCount = heap[blockPtr] ?? 0
  const entangledCount = heap[blockPtr + 1] ?? 0

  console.log(`Block @ ${blockPtr}, local=${localCount}, entangled=${entangledCount}`)

  for (let i = 0; i < localCount; i++) {
    const descOffset = 2 + i * 2
    const fieldId = heap[descOffset] ?? 0
    const packedMeta = heap[descOffset + 1] ?? 0

    const { type, size, offset } = unpackMeta(packedMeta)

    const typeName = getTypeName(type)
    console.log(`  Field ${fieldId}: type=${type}(${typeName}), size=${size}, offset=${offset}`)
  }

  if (entangledCount > 0) {
    const entangledPtrsOffset = 2 + localCount * 2
    console.log(`  Entangled pointers:`)
    for (let i = 0; i < entangledCount; i++) {
      const ptr = heap[entangledPtrsOffset + i] ?? 0
      console.log(`    [${i}] @ ${ptr}`)
    }
  }
}

/**
 * Дамп bytecode суперпозиции.
 *
 * @param bytecode - Bytecode данные
 * @param offset - Смещение начала bytecode для этой браны
 *
 * @example
 * ```typescript
 * const offset = bytecodeOffsets[0]!
 * dumpBytecode(bytecode, offset)
 * // Bytecode @ 0
 * //   State 0: ptr=4, transitions=1
 * //     Transition 0: target=1, conditions=1
 * //       Cond 0: type=0(FLOAT), field=0, op=2(GT), val=50.0
 * ```
 */
export function dumpBytecode(bytecode: Uint32Array, offset: number): void {
  console.log(`Bytecode @ ${offset}`)

  // State table size определяется по первому state_ptr
  // Формат: state_ptr[0], state_ptr[1], ...
  // Размер таблицы = state_ptr[0] / 4 (так как первый блок начинается после таблицы)
  const firstStatePtr = bytecode[offset] ?? 0
  const stateTableSize = (firstStatePtr - offset) / 4

  console.log(`  State table size: ${stateTableSize}`)

  for (let stateIdx = 0; stateIdx < stateTableSize; stateIdx++) {
    const statePtrOffset = offset + stateIdx
    const statePtr = bytecode[statePtrOffset] ?? 0

    console.log(`  State ${stateIdx}: ptr=${statePtr}`)

    if (statePtr === 0) continue

    // State block: [tr_count, target[0], cond_ptr[0], ...]
    const trCount = bytecode[statePtr] ?? 0
    console.log(`    transitions=${trCount}`)

    for (let trIdx = 0; trIdx < trCount; trIdx++) {
      const trOffset = statePtr + 1 + trIdx * 2
      const target = bytecode[trOffset] ?? 0
      const condPtr = bytecode[trOffset + 1] ?? 0

      console.log(`    Transition ${trIdx}: target=${target}, cond_ptr=${condPtr}`)

      if (condPtr === 0) continue

      // Condition block: [cond_count, type, field_id, op, val_encoded, ...]
      const condCount = bytecode[condPtr] ?? 0
      console.log(`      conditions=${condCount}`)

      for (let condIdx = 0; condIdx < condCount; condIdx++) {
        const condOffset = condPtr + 1 + condIdx * 4
        const type = bytecode[condOffset] ?? 0
        const fieldId = bytecode[condOffset + 1] ?? 0
        const op = bytecode[condOffset + 2] ?? 0
        const valEncoded = bytecode[condOffset + 3] ?? 0

        const typeName = getTypeName(type)
        const opName = getOpName(op)
        const valDecoded = type === 0 ? bitcastToF32(valEncoded) : valEncoded

        console.log(`        Cond ${condIdx}: type=${type}(${typeName}), field=${fieldId}, op=${op}(${opName}), val=${valDecoded}`)
      }
    }
  }
}

/**
 * Дамп StringAtlas.
 *
 * @param atlas - StringAtlas для дампа
 *
 * @example
 * ```typescript
 * const atlas = getStringAtlas()
 * dumpStringAtlas(atlas)
 * // StringAtlas: 3 strings
 * //   [0] "hero" (len=4, hash=0x1a2b3c4d)
 * //   [1] "monster" (len=7, hash=0x5e6f7a8b)
 * ```
 */
export function dumpStringAtlas(atlas: StringAtlas): void {
  const exported = atlas.export()

  console.log(`StringAtlas: ${exported.count} strings`)

  for (let i = 0; i < exported.count; i++) {
    const ptr = exported.registry[i * 3] ?? 0
    const len = exported.registry[i * 3 + 1] ?? 0
    const hash = exported.registry[i * 3 + 2] ?? 0

    const codePoints: number[] = []
    for (let j = 0; j < len; j++) {
      codePoints.push(exported.heap[ptr + j] ?? 0)
    }
    const str = String.fromCodePoint(...codePoints)

    console.log(`  [${i}] "${str}" (len=${len}, hash=0x${hash.toString(16).padStart(8, '0')})`)
  }
}

/**
 * Получить имя типа по коду.
 */
function getTypeName(type: number): string {
  const names: Record<number, string> = {
    0: 'FLOAT',
    1: 'UINT',
    2: 'BOOL',
    3: 'STRING',
    4: 'ARRAY',
  }
  return names[type] ?? `UNKNOWN(${type})`
}

/**
 * Получить имя оператора по коду.
 */
function getOpName(op: number): string {
  const names: Record<number, string> = {
    0: 'EQ',
    1: 'NEQ',
    2: 'GT',
    3: 'LT',
    4: 'GTE',
    5: 'LTE',
    6: 'IN',
    7: 'NOT_IN',
    8: 'INCLUDE',
    9: 'NOT_INCLUDE',
    10: 'LENGTH',
    11: 'IS_EMPTY',
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
 *
 * @example
 * ```typescript
 * import { dumpMatrix } from "@metafor/matrix/debug"
 *
 * // После write()
 * await write(data)
 * await dumpMatrix(heap, bytecode, bytecodeOffsets, braneBlockPtrs)
 * ```
 */
export async function dumpMatrix(
  heap: Uint32Array,
  bytecode: Uint32Array,
  bytecodeOffsets: Uint32Array,
  braneBlockPtrs: number[],
): Promise<void> {
  console.log('=== MATRIX DEBUG DUMP ===\n')

  console.log(`Branes: ${braneBlockPtrs.length}\n`)

  for (let i = 0; i < braneBlockPtrs.length; i++) {
    console.log(`=== BRANE ${i} ===\n`)

    console.log('--- HEAP BLOCK ---')
    dumpHeap(heap, braneBlockPtrs[i]!)
    console.log()

    console.log('--- BYTECODE ---')
    dumpBytecode(bytecode, bytecodeOffsets[i]!)
    console.log()
  }

  console.log('=== STRING ATLAS ===\n')
  const { getStringAtlas } = await import('./StringAtlas')
  dumpStringAtlas(getStringAtlas())
}
