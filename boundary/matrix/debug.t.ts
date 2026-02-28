/**
 * Типы для отладки Matrix.
 *
 * @packageDocumentation
 */

/**
 * Статистика heap.
 */
export interface HeapStats {
  /** Общий размер heap в словах */
  totalSize: number
  /** Занято словами */
  usedSize: number
  /** Резерв для ARRAY в словах */
  arrayReserve: number
  /** Свободно словами */
  freeSize: number
  /** Процент использования */
  utilization: number
}

/**
 * Результат дампа heap блока.
 */
export interface HeapBlockDump {
  /** Смещение блока в heap */
  blockPtr: number
  /** Количество локальных полей */
  localCount: number
  /** Количество entangled ссылок */
  entangledCount: number
  /** Дамп полей */
  fields: FieldDump[]
  /** Entangled указатели */
  entangledPointers: number[]
}

/**
 * Дамп поля в heap блоке.
 */
export interface FieldDump {
  /** Индекс поля */
  fieldId: number
  /** Тип поля (код) */
  type: number
  /** Имя типа (FLOAT, UINT, ...) */
  typeName: string
  /** Размер в словах */
  size: number
  /** Смещение в блоке */
  offset: number
}

/**
 * Результат дампа bytecode.
 */
export interface BytecodeDump {
  /** Смещение начала bytecode */
  offset: number
  /** Размер таблицы состояний */
  stateTableSize: number
  /** Дамп состояний */
  states: StateDump[]
}

/**
 * Дамп состояния в bytecode.
 */
export interface StateDump {
  /** Индекс состояния */
  stateIdx: number
  /** Смещение блока состояния */
  statePtr: number
  /** Количество переходов */
  transitionCount: number
  /** Дамп переходов */
  transitions: TransitionDump[]
  /** Является ли терминальным */
  isTerminal: boolean
}

/**
 * Дамп перехода в состоянии.
 */
export interface TransitionDump {
  /** Индекс перехода */
  transitionIdx: number
  /** Целевое состояние */
  target: number
  /** Указатель на условия */
  condPtr: number
  /** Дамп условий */
  conditions: ConditionDump[]
}

/**
 * Дамп условия в переходе.
 */
export interface ConditionDump {
  /** Индекс условия */
  conditionIdx: number
  /** Тип поля (код) */
  type: number
  /** Имя типа */
  typeName: string
  /** Индекс поля */
  fieldId: number
  /** Код операции */
  op: number
  /** Имя операции */
  opName: string
  /** Закодированное значение */
  valEncoded: number
  /** Декодированное значение */
  valDecoded: number | string
}

/**
 * Результат дампа StringAtlas.
 */
export interface StringAtlasDump {
  /** Количество строк */
  count: number
  /** Дамп строк */
  strings: StringDump[]
}

/**
 * Дамп строки в атласе.
 */
export interface StringDump {
  /** Индекс строки */
  id: number
  /** Содержимое строки */
  value: string
  /** Длина в символах */
  length: number
  /** Хэш строки */
  hash: number
  /** Указатель в heap */
  pointer: number
}

/**
 * Полный дамп Matrix.
 */
export interface MatrixDump {
  /** Количество бран */
  braneCount: number
  /** Дамп heap блоков */
  heapBlocks: HeapBlockDump[]
  /** Дамп bytecode */
  bytecodeDumps: BytecodeDump[]
  /** Дамп StringAtlas */
  stringAtlas: StringAtlasDump | null
  /** Статистика heap */
  heapStats: HeapStats
}
