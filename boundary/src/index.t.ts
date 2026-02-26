/**
 * Типы и интерфейсы для Boundary.
 */


/**
 * Индекс браны в массиве Boundary.
 *
 * @remarks
 * Boundary хранит браны как плоский массив. Индекс используется для:
 * - Доступа к бране в GPU-буферах
 * - Чтения состояний из {@link GPUBackend.read}
 * - Обновления полей через {@link Boundary.updateBraneField}
 *
 * Это технический индекс (0, 1, 2...), а не уникальный идентификатор.
 */
export type BraneIndex = number

/**
 * Кортеж поля: [индекс, определение поля].
 */
export type FieldTuple = [number, Field]

/**
 * Кортеж значения: [индекс, значение].
 */
export type ValueTuple = [number, unknown]

/**
 * Определение типа поля для GPU.
 * Используется для маппинга в FieldType и выделения памяти.
 *
 * @remarks
 * Это технические типы для GPU, без семантики (required, label).
 * Семантика определяется в monad на уровне Fields.
 */
export type FieldDefinition =
  | { type: "number" }
  | { type: "boolean" }
  | { type: "string" }
  | { type: "array<string>" }
  | { type: "array<number>" }
  | { type: "enum<string>"; values: string[] }
  | { type: "enum<number>"; values: number[] }

export type FieldsDefinition = Record<string, FieldDefinition>

/**
 * Переход между состояниями в числовой суперпозиции.
 */
export interface Transition {
  /** Индекс целевого состояния. */
  to: number
  /** Условия перехода: индекс поля → условие. */
  conditions: Record<number, any>
}

/**
 * Суперпозиция с числовыми ID состояний.
 *
 * @remarks
 * Гарантирует порядок переходов через массив вместо объекта.
 * Boundary работает только с индексами, не зная имён состояний.
 * Имена состояний хранятся в Monad для reverse-маппинга.
 *
 * @example
 * ```typescript
 * {
 *   transitions: [
 *     [  // Из IDLE (индекс 0)
 *       { to: 1, conditions: { 0: { gt: 50 } } },   // → PATROL (приоритет 1)
 *       { to: 2, conditions: { 0: { lte: 0 } } }    // → DEAD (приоритет 2)
 *     ],
 *     [null],  // PATROL — терминальное
 *     [null]   // DEAD — терминальное
 *   ]
 * }
 * ```
 */
export interface NumericSuperposition {
  /**
   * Массив переходов по индексам состояний.
   * transitions[fromIndex] = массив переходов из этого состояния.
   * null означает терминальный переход (поглощение).
   */
  transitions: Array<Array<Transition | null>>
}

/**
 * Суперпозиция — граф переходов между состояниями.
 * Используется только числовой формат (NumericSuperposition).
 */
export type Superposition = NumericSuperposition

/**
 * Брана — возмущение квантовых полей.
 *
 * @remarks
 * Брана содержит:
 * - params — значения полей (данные) в формате кортежей
 * - initialStateIndex — индекс начального состояния в массиве states
 * - states — имена состояний для reverse-маппинга (хранятся в Boundary)
 * - superposition — граф переходов с числовыми ID состояний
 */
export interface BraneDefinition {
  /** Значения полей браны в формате кортежей [[index, value], ...]. */
  params: ValueTuple[]
  /** Индекс начального состояния в массиве states. */
  initialStateIndex: number
  /** Имена состояний для reverse-маппинга. */
  states: string[]
  /** Суперпозиция — граф переходов с числовыми ID состояний. */
  superposition: NumericSuperposition
}

/**
 * Конфигурация Boundary с кортежами.
 */
export interface BoundaryConfig {
  /** Поля в формате кортежей [[index, field], ...]. */
  fields: FieldTuple[]
  /** Массив бран — возмущений в поле. */
  branes: BraneDefinition[]
}

/**
 * Опции debug-режима.
 */
export interface DebugOptions {
  /** Включить логирование инициализации полей. */
  fields?: boolean
  /** Включить логирование создания бран. */
  branes?: boolean
  /** Включить логирование компиляции правил. */
  compiler?: boolean
  /** Включить логирование GPU-ресурсов. */
  gpu?: boolean
  /** Включить логирование строкового атласа. */
  strings?: boolean
  /** Включить полное логирование (все категории). */
  all?: boolean
}

/**
 * Результат инициализации Boundary.
 * Содержит скомпилированные артефакты и метаданные.
 */
export interface BoundaryInitResult {
  /** Скомпилированный ансамбль правил. */
  compiled: CompiledEnsemble
  /** Массив ID созданных бран. */
  braneIds: number[]
}
/**
 * Общие типы для компилятора и GPU-бэкенда.
 */
/** Индекс состояния в таблице состояний. */
export type StateId = number
/**
 * Представляет результат компиляции правил — артефакты, готовые для загрузки на GPU.
 * Содержит байт-код и метаданные, необходимые для его интерпретации.
 */

export interface CompiledRules {
  /**
   * Скомпилированные правила в виде плоского массива 32-битных беззнаковых целых чисел.
   * Этот массив представляет собой программу для кастомной VM, исполняемой на GPU.
   * Его структура включает в себя несколько секций:
   * 1. **Таблица состояний (State Table):** Карта `StateId -> указатель на блок состояния`.
   * 2. **Блоки состояний (State Blocks):** Описывают переходы для каждого состояния.
   * 3. **Блоки переходов (Transition Blocks):** Содержат указатели на условия.
   * 4. **Блоки условий (Condition Blocks):** Набор инструкций для проверки полей браны.
   */
  bytecode: Uint32Array

  /**
   * Смещение (в `u32` словах) от начала `bytecode` до таблицы состояний.
   */
  stateTableOffset: number

  /**
   * Карта, связывающая строковые имена состояний (например, `"IDLE"`) с их числовыми идентификаторами (`StateId`).
   * @example ` { "IDLE": 0, "WALK": 1, "DEAD": 2 }`
   */
  stateMap: Record<string, number>
}
/**
 * Результат компиляции одной superposition для отдельного поля.
 * Содержит bytecode и метаданные для интерпретации состояний.
 */

export interface CompiledFieldRules {
  /**
   * Скомпилированные правила в виде плоского массива u32.
   * Структура аналогична CompiledRules.bytecode.
   */
  bytecode: Uint32Array

  /**
   * Карта имён состояний в числовые ID.
   * Каждое поле имеет свой независимый stateMap.
   */
  stateMap: Record<string, number>

  /**
   * Обратный маппинг: числовой ID → имя состояния.
   * Используется для декодирования результатов GPU.
   */
  reverseStateMap: string[]
}
/**
 * Результат компиляции ансамбля superposition для всех полей границы.
 * Содержит конкатенированный bytecode и таблицу смещений.
 */

export interface CompiledEnsemble {
  /**
   * Конкатенированный bytecode всех полей.
   * Структура: [field0_bytecode][field1_bytecode][field2_bytecode]...
   */
  bytecode: Uint32Array

  /**
   * Таблица смещений для каждого поля в конкатенированном bytecode.
   * bytecodeOffsets[i] — смещение начала bytecode для поля i.
   */
  bytecodeOffsets: Uint32Array

  /**
   * Массив stateMap для каждого поля.
   * stateMaps[i] — маппинг имён состояний в ID для поля i.
   */
  stateMaps: Record<string, number>[]

  /**
   * Массив обратных маппингов для каждого поля.
   * reverseStateMaps[i] — маппинг ID в имена для поля i.
   */
  reverseStateMaps: string[][]
}/**
 * Типы полей для GPU.
 *
 * @packageDocumentation
 */

export const FieldType = {
  F32: 0,
  U32: 1,
  BOOL: 2,
  STRING_PTR: 3,
  ARRAY_PTR: 4,
  SHARED_PTR: 5,
} as const

export type FieldTypeValue = (typeof FieldType)[keyof typeof FieldType]

export interface Field {
  type: FieldTypeValue
  elementType?: string
  enumValues?: any[]
}

