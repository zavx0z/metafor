/**
 * Типы и интерфейсы для Boundary.
 */


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
 * Суперпозиция — граф переходов между состояниями.
 *
 * @remarks
 * Ключ верхнего уровня — имя состояния, значение — карта переходов.
 * `null` означает состояние без исходящих переходов (терминальное).
 */
export type Superposition = Record<string, Record<string, any> | null>

/**
 * Брана — возмущение квантовых полей.
 *
 * @remarks
 * Брана содержит:
 * - params — значения полей (данные)
 * - state — текущее состояние (одно из superposition)
 * - superposition — все возможные состояния + граф переходов
 */
export interface BraneDefinition {
  /** Уникальный идентификатор браны. */
  id: string
  /** Значения полей браны (params — данные). */
  params: Record<string, unknown>
  /** Текущее состояние (должно быть в superposition). */
  state: string
  /** Суперпозиция — все состояния + граф переходов. */
  superposition: Superposition
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
 * Конфигурация полевой границы.
 *
 * @remarks
 * Boundary управляет двумя компонентами:
 * - fields — статика: схема типов полей для GPU
 * - branes — динамика: массив бран с params, state, superposition
 */
export interface BoundaryConfig {
  /** Схема типов полей (общая для всех бран). Технические типы для GPU. */
  fields: FieldsDefinition
  /** Массив бран — возмущений в поле. */
  branes: BraneDefinition[]
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
}
