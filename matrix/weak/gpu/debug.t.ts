/** Типы для `@matrix/weak/gpu/debug`. */

/** Статистика heap. */
export interface HeapStats {
  totalSize: number
  usedSize: number
  arrayReserve: number
  freeSize: number
  utilization: number
}

/** Результат дампа heap-блока. */
export interface HeapBlockDump {
  blockPtr: number
  localCount: number
  entangledCount: number
  fields: FieldDump[]
  entangledPointers: number[]
}

/** Дамп поля в heap-блоке. */
export interface FieldDump {
  fieldId: number
  type: number
  typeName: string
  size: number
  offset: number
}

/** Результат дампа bytecode. */
export interface BytecodeDump {
  offset: number
  stateTableSize: number
  states: StateDump[]
}

/** Дамп состояния в bytecode. */
export interface StateDump {
  stateIdx: number
  statePtr: number
  transitionCount: number
  transitions: TransitionDump[]
  isTerminal: boolean
}

/** Дамп перехода в состоянии. */
export interface TransitionDump {
  transitionIdx: number
  target: number
  condPtr: number
  conditions: ConditionDump[]
}

/** Дамп условия в переходе. */
export interface ConditionDump {
  conditionIdx: number
  type: number
  typeName: string
  fieldId: number
  op: number
  opName: string
  valEncoded: number
  valDecoded: number | string
}

/** Результат дампа string table. */
export interface StringAtlasDump {
  count: number
  strings: StringDump[]
}

/** Дамп строки в string table. */
export interface StringDump {
  id: number
  value: string
  length: number
  hash: number
  pointer: number
}

/** Полный дамп GPU-derived состояния Weak. */
export interface WeakDump {
  braneCount: number
  heapBlocks: HeapBlockDump[]
  bytecodeDumps: BytecodeDump[]
  stringAtlas: StringAtlasDump | null
  heapStats: HeapStats
}
