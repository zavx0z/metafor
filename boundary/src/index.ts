/**
 * Модуль эволюции полей на границе (Boundary) с использованием GPU.
 *
 * **Ядро (Core Pattern):** Библиотека реализует паттерн **Data-Oriented Design** с акцентом на параллелизм GPU.
 *
 * ### Терминология (квантовая теория поля):
 * - **Boundary (Граница)** — область пространства, содержащая поля. Главный объект системы.
 * - **Field (Поле)** — квантовое поле с браной (данными), суперпозицией (графом переходов) и текущим состоянием.
 * - **Brane (Брана)** — многомерная "подложка" данных поля (из теории струн/М-теории).
 * - **Superposition (Суперпозиция)** — множество возможных состояний поля и условия переходов между ними.
 * - **State (Состояние)** — текущее наблюдаемое состояние поля (результат "коллапса" суперпозиции).
 *
 * ### Ключевые компоненты:
 * 1. **BraneManager** — управление памятью бран в формате "самоописываемых блоков" с автоматической группировкой общих полей.
 * 2. **RulesCompiler** — транслятор JSON-правил в байт-код для кастомной VM, исполняемой в compute shader.
 * 3. **GPUBackend** — драйвер WebGPU, управляющий VRAM и диспетчеризацией вычислительных работ.
 *
 * ### Особенности памяти (Memory Layout):
 * * **Глобальная куча (heap):** Единый GPUBuffer с менеджером свободных блоков (free-list).
 * * **Указатели (pointers):** Все ссылки — абсолютные смещения в словах (u32) от начала кучи.
 * * **Shared браны:** Поля с одинаковыми значениями у нескольких агентов автоматически группируются в разделяемые блоки.
 *
 * ### Важные ограничения:
 * * **Нет обратной совместимости:** Формат байт-кода и структура кучи могут меняться между минорными версиями.
 * * **Только WebGPU:** Требует поддержки `navigator.gpu` и устройства с compute shader capability.
 * * **Размер кучи фиксирован:** По умолчанию 16384 слов (64KB), конфигурируется в BraneManagerConfig.
 *
 * @packageDocumentation
 */
import { GPUBackend } from "./backend"
import { RulesCompiler } from "./compiler"
import { BraneManager, FieldType, GlobalFieldRegistry, type FieldTypeValue } from "./context"

// ========== Типы для описания схемы браны ==========
/**
 * Определение типа компоненты в бране.
 * Может быть объектом с полем type и дополнительными параметрами.
 */
export type BraneFieldDefinition =
  | { type: "number" }
  | { type: "boolean" }
  | { type: "string" }
  | { type: "array<string>" }
  | { type: "array<number>" }
  | { type: "enum<string>"; values: string[] }
  | { type: "enum<number>"; values: number[] }

/**
 * Схема браны — описание типов данных для всех полей границы.
 * Ключ — имя компоненты, значение — определение типа.
 */
export type BraneSchema = Record<string, BraneFieldDefinition>

/**
 * Суперпозиция — граф возможных состояний и условий переходов между ними.
 * Каждое поле может иметь свою индивидуальную суперпозицию.
 *
 * @example
 * ```json
 * {
 *   "IDLE": { "PATROL": { "hp": { "gt": 50 } } },
 *   "PATROL": { "IDLE": { "mana": { "lte": 10 } } },
 *   "DEAD": null
 * }
 * ```
 */
export type Superposition = Record<string, Record<string, any> | null>

/**
 * Определение поля (Field) в границе.
 * Каждое поле имеет уникальный идентификатор, брану (данные), начальное состояние
 * и индивидуальную суперпозицию (граф переходов).
 */
export interface FieldDefinition {
  /** Уникальный идентификатор поля */
  id: string
  /** Начальные данные браны поля */
  brane: Record<string, unknown>
  /** Начальное состояние поля */
  state: string
  /** Индивидуальная суперпозиция — граф переходов для этого поля */
  superposition: Superposition
}

/**
 * Конфигурация для инициализации `Boundary`.
 */
export interface BoundaryConfig {
  /**
   * Схема браны — описание типов данных.
   *
   * | Input Schema | Internal GPU Type | Memory Storage |
   * | :--- | :--- | :--- |
   * | `{ type: "number" }` | `TYPE.FLOAT` | `buffer_floats` (f32) |
   * | `{ type: "boolean" }` | `TYPE.BOOL` | `buffer_uints` (0/1) |
   * | `{ type: "enum<string>", values: string[] }` | `TYPE.UINT` | `buffer_uints` (index) |
   * | `{ type: "enum<number>", values: number[] }` | `TYPE.UINT` | `buffer_uints` (index) |
   * | `{ type: "array<string>" }` | `TYPE.ARRAY` | `buffer_uints` (pointer -> heap) |
   * | `{ type: "array<number>" }` | `TYPE.ARRAY` | `buffer_uints` (pointer -> heap) |
   *
   * @example
   * ```ts
   * const branes = {
   *   hp: { type: "number" },
   *   status: { type: "enum<string>", values: ["ALIVE", "DEAD"] }
   * }
   * ```
   */
  branes: BraneSchema

  /**
   * Массив полей с их бранами, начальными состояниями и индивидуальными суперпозициями.
   */
  fields: FieldDefinition[]
}

/**
 * `Boundary` — главный класс библиотеки. Представляет границу — область пространства,
 * содержащую квантовые поля.
 *
 * Каждое поле (Field) внутри границы имеет:
 * - **Брану (Brane)** — данные поля (hp, mana, isAlive и т.д.)
 * - **Суперпозицию (Superposition)** — индивидуальный граф возможных переходов
 * - **Состояние (State)** — текущее наблюдаемое состояние
 *
 * **Основной воркфлоу:**
 * 1. **Создание:** `new Boundary(device)`
 * 2. **Инициализация:** `await boundary.init({...})`. На этом шаге правила компилируются в байт-код,
 *    создаются GPU-буферы и загружаются начальные данные.
 * 3. **Симуляция:** `boundary.step()` для выполнения одного такта вычислений на GPU.
 * 4. **Получение результатов:** `await boundary.getStates()` для чтения итоговых состояний.
 */
export class Boundary {
  private backend: GPUBackend
  private compiler = new RulesCompiler()
  private braneManager: BraneManager

  // Карты маппинга
  private stateMap: Record<string, number> = {}
  private reverseStateMap: string[] = []
  private fieldIds: number[] = []

  /**
   * @param device - Инициализированный `GPUDevice`.
   */
  constructor(device: GPUDevice) {
    this.backend = new GPUBackend(device)
    this.braneManager = new BraneManager(device)
  }

  /**
   * Инициализирует границу: компилирует правила, выделяет память и загружает данные.
   *
   * ### Алгоритм инициализации:
   * 1. Регистрация компонент браны в GlobalFieldRegistry (создание field_id).
   * 2. Создание полей через BraneManager с автоматической группировкой общих данных.
   * 3. Объединение индивидуальных суперпозиций в единый граф переходов.
   * 4. Компиляция графа переходов в байт-код кастомной VM.
   * 5. Инициализация GPU-буферов и создание compute pipeline.
   *
   * ### Валидация входных данных:
   * * Каждое состояние, упомянутое как цель перехода, должно быть объявлено в суперпозиции.
   * * Все компоненты, используемые в условиях, должны быть описаны в branes.
   * * Начальные состояния полей должны существовать в stateMap.
   *
   * @param config - Конфигурация границы.
   * @param config.branes - Схема типов данных браны.
   * @param config.fields - Массив полей с бранами, состояниями и суперпозициями.
   *
   * @throws {Error} Если:
   * * WebGPU не поддерживается или устройство недоступно.
   * * Обнаружено неизвестное состояние или компонента браны.
   * * Не удалось аллоцировать память в GPU-куче.
   *
   * @example
   * ```ts
   * await boundary.init({
   *   branes: { hp: { type: "number" } },
   *   fields: [
   *     {
   *       id: "hero",
   *       brane: { hp: 100 },
   *       state: "IDLE",
   *       superposition: {
   *         IDLE: { PATROL: { hp: { gt: 50 } } },
   *         PATROL: null
   *       }
   *     }
   *   ]
   * });
   * ```
   */
  async init(config: BoundaryConfig) {
    // 1. Регистрируем компоненты браны из схемы в глобальном реестре.
    const registry = GlobalFieldRegistry.getInstance()

    for (const [name, def] of Object.entries(config.branes)) {
      const defTyped = def as { type?: string; values?: any[] } | string
      const typeStr = typeof defTyped === "string" ? defTyped : defTyped.type
      let fieldType: FieldTypeValue
      let elementType: string | undefined
      const enumValues = typeof defTyped !== "string" && "values" in defTyped ? defTyped.values : undefined

      // Маппинг человекопонятных типов -> FieldType.
      switch (typeStr) {
        case "number":
          fieldType = FieldType.F32
          break
        case "boolean":
          fieldType = FieldType.BOOL
          break
        case "string":
          fieldType = FieldType.STRING_PTR
          break
        case "array<string>":
          fieldType = FieldType.ARRAY_PTR
          elementType = "string"
          break
        case "array<number>":
          fieldType = FieldType.ARRAY_PTR
          elementType = "number"
          break
        case "enum<string>":
        case "enum<number>":
          fieldType = FieldType.U32
          break
        default:
          throw new Error(`Unknown brane component type: '${typeStr}' for component '${name}'`)
      }
      if (!registry.has(name)) {
        const registerOptions = {
          ...(elementType !== undefined ? { elementType } : {}),
          ...(enumValues !== undefined ? { enumValues } : {}),
        }
        registry.register(name, fieldType, registerOptions)
      }
    }

    // 2. Создаём поля — менеджер сам группирует общие данные бран!
    this.fieldIds = this.braneManager.createEnsemble(config.fields.map((f) => f.brane))

    // 3. Объединяем индивидуальные суперпозиции в единый граф переходов.
    //    Собираем все уникальные состояния из всех суперпозиций.
    const mergedSuperposition: Record<string, Record<string, any> | null> = {}
    for (const field of config.fields) {
      for (const [stateName, transitions] of Object.entries(field.superposition)) {
        if (transitions === null) {
          // Терминальное состояние — добавляем если ещё нет
          if (!(stateName in mergedSuperposition)) {
            mergedSuperposition[stateName] = null
          }
          continue
        }
        if (!mergedSuperposition[stateName] || mergedSuperposition[stateName] === null) {
          mergedSuperposition[stateName] = {}
        }
        // Мержим переходы
        for (const [targetState, conditions] of Object.entries(transitions)) {
          if (conditions && typeof conditions === "object") {
            const existing = (mergedSuperposition[stateName] as Record<string, any>)[targetState]
            if (existing) {
              // Объединяем условия
              Object.assign(existing, conditions)
            } else {
              (mergedSuperposition[stateName] as Record<string, any>)[targetState] = { ...conditions }
            }
          }
        }
      }
    }

    // 4. Компилируем правила FSM ([type, field_id, op, value]).
    const compiled = this.compiler.compile(mergedSuperposition, config.branes, { preserveRegistry: true })
    this.stateMap = compiled.stateMap
    this.reverseStateMap = Object.keys(compiled.stateMap)

    // 5. Инициализируем бэкенд.
    const states = new Uint32Array(config.fields.map((f) => this.stateMap[f.state] ?? 0))

    const { fieldDescriptors, heap } = this.braneManager.getGPUBuffers()

    await this.backend.init({
      fieldCount: config.fields.length,
      bytecode: compiled.bytecode,
      states,
      fieldDescriptors,
      heap,
      tableOffset: compiled.stateTableOffset,
    })
  }

  /**
   * Выполняет один такт симуляции, запуская compute shader на GPU.
   *
   * ### Алгоритм работы:
   * 1. Запуск compute pass с байт-кодом правил и данными полей.
   * 2. Каждый GPU-инвариант обрабатывает одно поле (workgroup size = 64).
   * 3. После выполнения копирование результатов из `newStates` в `states` (ping-pong swap).
   *
   * ### Производительность:
   * * Compute shader выполняется асинхронно относительно CPU.
   * * Для синхронизации используйте `await boundary.getStates()`.
   * * Время выполнения зависит от сложности правил и количества полей.
   *
   * @see {@link getStates} для чтения результатов.
   */
  step() {
    this.backend.run()
  }

  /**
   * Асинхронно читает текущие состояния полей из GPU.
   *
   * ### Внутренняя работа:
   * 1. Копирование данных из GPU-буфера `states` в staging buffer.
   * 2. Асинхронное отображение (map) памяти для чтения CPU.
   * 3. Преобразование числовых StateID в строковые имена через reverseStateMap.
   *
   * ### Важно:
   * * Это **дорогая операция** (синхронизация CPU-GPU).
   * * Не вызывайте чаще необходимого (например, только для визуализации).
   * * Для проверки логики используйте {@link step} без промежуточного чтения.
   *
   * @returns Promise, разрешающийся в массив строковых имен состояний в порядке полей.
   *
   * @example
   * ```ts
   * // После 10 шагов симуляции
   * for (let i = 0; i < 10; i++) boundary.step();
   * const finalStates = await boundary.getStates(); // ['PATROL', 'DEAD', ...]
   * ```
   */
  async getStates(): Promise<string[]> {
    const raw = await this.backend.read()
    return Array.from(raw).map((id) => this.reverseStateMap[id]!)
  }

  /**
   * Обновляет компоненту браны конкретного поля и синхронизирует изменения с GPU.
   *
   * ### Алгоритм обновления:
   * 1. Поиск блока поля в куче через fieldDescriptors.
   * 2. Для скалярных типов (числа, булевы) — прямая запись в кучу.
   * 3. Для типов переменного размера (строки, массивы):
   *    * Освобождение старого блока в аллокаторе.
   *    * Аллокация нового блока с новыми данными.
   *    * Обновление указателя в блоке поля.
   * 4. Если куча изменилась (heapDirty), копирование всей кучи в GPU-буфер.
   *
   * ### Ограничения:
   * * **Тип компоненты должен совпадать** с зарегистрированным в schema.
   * * **Нет проверки на переполнение кучи** — может выбросить ошибку аллокатора.
   * * **Не атомарно на GPU** — изменения видны в следующем шаге симуляции.
   *
   * @param fieldIndex - Порядковый индекс поля в массиве fields (0-based).
   * @param componentName - Имя компоненты браны, зарегистрированное в branes.
   * @param value - Новое значение (тип должен соответствовать схеме).
   *
   * @throws {Error} Если:
   * * fieldIndex выходит за границы массива полей.
   * * componentName не зарегистрировано в GlobalFieldRegistry.
   * * Компонента не найдена в блоке поля (отсутствует в бране).
   * * Не удалось аллоцировать память для значения переменного размера.
   *
   * @example
   * ```ts
   * // Уменьшить здоровье героя на 30
   * boundary.updateBraneField(0, "hp", 70);
   * ```
   */
  updateBraneField(fieldIndex: number, componentName: string, value: unknown): void {
    const fieldId = this.fieldIds[fieldIndex]
    if (fieldId === undefined) {
      throw new Error(`Неизвестный индекс поля: ${fieldIndex}`)
    }

    this.braneManager.updateBraneField(fieldId, componentName, value)
    if (this.braneManager.isHeapDirty()) {
      const { heap } = this.braneManager.getGPUBuffers()
      this.backend.updateHeap(heap)
      this.braneManager.clearDirtyFlag()
    }
  }
}

// Обратная совместимость: экспортируем Boundary также как QuantumFieldSystem
export { Boundary as QuantumFieldSystem }
