/**
 * Общие фикстуры для тестов CPU/GPU матрицы.
 *
 * Содержит тестовые данные и хелперы для создания runtime.
 */
import { boundary$ } from "../../../store"
import { compileEnsemble, buildHeap, FieldType, floatToUint, type Field, type Brane } from "../../../fields"
import { resetStringAtlas } from "@boundary/atlas"
import type { MatrixInitParams, MatrixRuntime } from "../../matrix.t"
import type { BoundaryStore } from "../../../store.t"

/**
 * Фикстура: 1 брана с простым условием hp > 50.
 */
export function createSimpleBraneFixture() {
  resetStringAtlas()

  const fields: Field[] = [{ type: FieldType.F32 }]
  const branes: Brane[] = [
    {
      values: [[0, floatToUint(100)]] as [number, number][], // hp = 100 (encoded as float)
      state: 0,
      collapses: [
        [[1, { 0: { gt: 50 } }]], // 0 → 1 при hp > 50
        [null], // 1 терминальное
      ],
    },
  ]

  const { bytecode, bytecodeOffsets } = compileEnsemble(branes, fields)
  const { heap, blockPtrs } = buildHeap({
    localFields: [branes[0]!.values as [number, number][]],
    braneEntangledMap: [[]],
    entangledFields: new Map(),
    fieldMeta: new Map([
      [0, { fieldType: 0, fieldSize: 1 }], // TYPE.FLOAT
    ]),
  })

  const initialStates = new Uint32Array([0])

  return { fields, branes, bytecode, bytecodeOffsets, heap, blockPtrs, initialStates }
}

/**
 * Фикстура: 3 браны с разными условиями.
 */
export function createMultipleBranesFixture() {
  resetStringAtlas()

  const fields: Field[] = [{ type: FieldType.F32 }]
  const branes: Brane[] = [
    {
      values: [[0, floatToUint(100)]] as [number, number][], // hp = 100 > 50 → transition
      state: 0,
      collapses: [
        [[1, { 0: { gt: 50 } }]],
        [null],
      ],
    },
    {
      values: [[0, floatToUint(30)]] as [number, number][], // hp = 30 < 50 → no transition
      state: 0,
      collapses: [
        [[1, { 0: { gt: 50 } }]],
        [null],
      ],
    },
    {
      values: [[0, floatToUint(75)]] as [number, number][], // hp = 75 > 50 → transition
      state: 0,
      collapses: [
        [[1, { 0: { gt: 50 } }]],
        [null],
      ],
    },
  ]

  const { bytecode, bytecodeOffsets } = compileEnsemble(branes, fields)
  const { heap, blockPtrs } = buildHeap({
    localFields: branes.map((b) => b.values as [number, number][]),
    braneEntangledMap: branes.map(() => []),
    entangledFields: new Map(),
    fieldMeta: new Map([
      [0, { fieldType: 0, fieldSize: 1 }],
    ]),
  })

  const initialStates = new Uint32Array([0, 0, 0])

  return { fields, branes, bytecode, bytecodeOffsets, heap, blockPtrs, initialStates }
}

/**
 * Фикстура: брана с lock флагом.
 */
export function createLockedBraneFixture() {
  resetStringAtlas()

  const fields: Field[] = [{ type: FieldType.F32 }]
  const branes: Brane[] = [
    {
      values: [[0, floatToUint(100)]] as [number, number][], // hp = 100 > 50
      state: 0,
      collapses: [
        [[1, { 0: { gt: 50 } }]],
        [null],
      ],
    },
  ]

  const { bytecode, bytecodeOffsets } = compileEnsemble(branes, fields)
  const { heap, blockPtrs } = buildHeap({
    localFields: [branes[0]!.values as [number, number][]],
    braneEntangledMap: [[]],
    entangledFields: new Map(),
    fieldMeta: new Map([
      [0, { fieldType: 0, fieldSize: 1 }],
    ]),
  })

  // Устанавливаем lock флаг (слово 2 в заголовке блока)
  const blockPtr = blockPtrs[0]!
  heap[blockPtr + 2] = 1 // lock = true

  const initialStates = new Uint32Array([0])

  return { fields, branes, bytecode, bytecodeOffsets, heap, blockPtrs, initialStates }
}

/**
 * Фикстура: брана с 2 полями для теста field update.
 */
export function createFieldUpdateFixture() {
  resetStringAtlas()

  const fields: Field[] = [{ type: FieldType.F32 }, { type: FieldType.F32 }]
  const branes: Brane[] = [
    {
      values: [[0, floatToUint(40)], [1, floatToUint(10)]] as [number, number][], // hp = 40, mana = 10
      state: 0,
      collapses: [
        [[1, { 0: { gt: 50 } }]], // 0 → 1 при hp > 50
        [null],
      ],
    },
  ]

  const { bytecode, bytecodeOffsets } = compileEnsemble(branes, fields)
  const { heap, blockPtrs } = buildHeap({
    localFields: [branes[0]!.values as [number, number][]],
    braneEntangledMap: [[]],
    entangledFields: new Map(),
    fieldMeta: new Map([
      [0, { fieldType: 0, fieldSize: 1 }],
      [1, { fieldType: 0, fieldSize: 1 }],
    ]),
  })

  const initialStates = new Uint32Array([0])

  return { fields, branes, bytecode, bytecodeOffsets, heap, blockPtrs, initialStates }
}

/**
 * Создаёт BoundaryStore для CPU runtime.
 */
export function createBoundaryStore(fixture: ReturnType<typeof createSimpleBraneFixture>): BoundaryStore {
  const store = { ...boundary$ }
  store.bytecode = fixture.bytecode
  store.bytecodeOffsets = fixture.bytecodeOffsets
  store.initialStates = fixture.initialStates
  store.heap = fixture.heap
  store.braneBlockPtrs = fixture.blockPtrs
  return store
}

/**
 * Создаёт параметры инициализации для GPU runtime.
 */
export function createMatrixInitParams(fixture: ReturnType<typeof createSimpleBraneFixture>): MatrixInitParams {
  return {
    bytecode: fixture.bytecode,
    bytecodeOffsets: fixture.bytecodeOffsets,
    states: fixture.initialStates,
    braneDescriptors: createBraneDescriptors(fixture.blockPtrs, fixture.bytecodeOffsets),
    heap: fixture.heap,
  }
}

/**
 * Создаёт дескрипторы бран для GPU: [block_ptr0, bytecode_offset0, ...].
 */
function createBraneDescriptors(blockPtrs: number[], bytecodeOffsets: Uint32Array): Uint32Array {
  const descriptors = new Uint32Array(blockPtrs.length * 2)
  for (let i = 0; i < blockPtrs.length; i++) {
    descriptors[i * 2] = blockPtrs[i]!
    descriptors[i * 2 + 1] = bytecodeOffsets[i]!
  }
  return descriptors
}

/**
 * Создаёт изолированный BoundaryStore для теста.
 */
export function createIsolatedStore(fixture: ReturnType<typeof createSimpleBraneFixture>): BoundaryStore {
  return {
    bytecode: fixture.bytecode.slice(),
    bytecodeOffsets: fixture.bytecodeOffsets.slice(),
    initialStates: fixture.initialStates.slice(),
    heap: fixture.heap.slice(),
    braneBlockPtrs: [...fixture.blockPtrs],
    reset: () => {
      throw new Error("reset not supported in isolated store")
    },
    restore: () => {
      throw new Error("restore not supported in isolated store")
    },
  }
}

/**
 * Тип фабрики runtime для тестов.
 */
export type RuntimeFactory = () => Promise<MatrixRuntime>

/**
 * Нормализует результат для сравнения (сортирует changes по индексу).
 */
export function normalizeChanges(changes: Array<[number, number]>): Array<[number, number]> {
  return [...changes].sort((a, b) => a[0] - b[0])
}
