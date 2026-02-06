/**
 * Коды операций сравнения в байт-коде.
 * Должны бинарно совпадать с константами в `classify.wgsl`.
 */
export const OP = {
  EQ: 0,
  NEQ: 1,
  GT: 2,
  LT: 3,
  GTE: 4,
  LTE: 5,
} as const

/**
 * Типы данных полей контекста.
 * Определяют, из какого массива (floats или uints) шейдер считывает значение.
 */
export const TYPE = {
  FLOAT: 0,
  UINT: 1,
  BOOL: 2,
} as const

export type StateID = number

/**
 * Артефакты компиляции правил.
 * Содержат данные для загрузки в GPU и метаданные для маппинга на CPU.
 */
export interface CompiledRules {
  /**
   * Плоский массив инструкций для виртуальной машины в шейдере.
   * Формат: `[StateTable..., StateBlocks..., TransitionBlocks..., ConditionBlocks...]`
   */
  bytecode: Uint32Array

  /**
   * Индекс начала таблицы состояний в байт-коде.
   */
  stateTableOffset: number

  /**
   * Карта полей контекста.
   * Используется для преобразования имен полей (строк) в индексы массивов GPU.
   */
  fieldMap: Record<string, { type: number; index: number }>

  /**
   * Карта состояний.
   * `{ "IDLE": 0, "WALK": 1 }`
   */
  stateMap: Record<string, number>
}
