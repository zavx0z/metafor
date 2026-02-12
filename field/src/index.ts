/**
 * Модуль эволюции квантов поля на GPU.
 *
 * **Ядро (Core Pattern):** Библиотека реализует паттерн **Data-Oriented Design** с акцентом на параллелизм GPU.
 *
 * ### Ключевые компоненты:
 * 1. **BraneManager** — управление памятью квантов (бранами) в формате "самоописываемых блоков" с автоматической группировкой общих полей.
 * 2. **RulesCompiler** — транслятор JSON-правил в байт-код для кастомной VM, исполняемой в compute shader.
 * 3. **GPUBackend** — драйвер WebGPU, управляющий VRAM и диспетчеризацией вычислительных работ.
 *
 * ### Особенности памяти (Memory Layout):
 * * **Глобальная куча (heap):** Единый GPUBuffer с менеджером свободных блоков (free-list).
 * * **Указатели (pointers):** Все ссылки — абсолютные смещения в словах (u32) от начала кучи.
 * * **Shared браны:** Поля с одинаковыми значениями у нескольких агентов автоматически группируются в разделяемые блокы.
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
 * Определение типа компоненты в branes.
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
 * Схема браны кванта.
 * Ключ — имя компоненты, значение — определение типа.
 */
export type BraneSchema = Record<string, BraneFieldDefinition>

/**
 * Конфигурация для инициализации `QuantumFieldSystem`.
 */
export interface QuantumFieldSystemConfig {
  /**
   * Суперпозиция возможных состояний и переходов между ними.
   * @example
   * ```json
   * {
   *   "IDLE": { "WALK": { "mana": { "gt": 10 } } },
   *   "WALK": { "IDLE": { "mana": { "lte": 10 } } }
   * }
   * ```
   */
  superposition: any
  /**
   * Схема памяти агента. Определяет layout буферов (Struct of Arrays).
   *
   * Используется компилятором для:
   * 1. Расчета смещений в буферах `floats` и `uints`.
   * 2. Генерации инструкций доступа к памяти в байт-коде.
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
   * const schema = {
   *   hp: { type: "number" },
   *   status: { type: "enum<string>", values: ["ALIVE", "DEAD"] }
   * }
   * ```
   */
  branes: BraneSchema

  /**
   * Массив квантов с их начальными бранами и состояниями.
   */
  quanta: Array<{ id: string; state: string; brane: any }>
}

/**
 * `QuantumFieldSystem` — это главный класс библиотеки.
 *
 * Он представляет собой высокоуровневый фасад, который скрывает сложность
 * компиляции правил и низкоуровневого взаимодействия с WebGPU.
 *
 * **Основной воркфлоу:**
 * 1. **Создание:** `new QuantumFieldSystem(device)`
 * 2. **Инициализация:** `await system.init({...})`. На этом шаге правила компилируются в байт-код,
 *    создаются GPU-буферы и загружаются начальные данные.
 * 3. **Симуляция:** `system.step()` для выполнения одного такта вычислений на GPU.
 * 4. **Получение результатов:** `await system.getStates()` для чтения итоговых состояний.
 */
export class QuantumFieldSystem {
  private backend: GPUBackend
  private compiler = new RulesCompiler()
  private braneManager: BraneManager

  // Карты маппинга
  private stateMap: Record<string, number> = {}
  private reverseStateMap: string[] = []
  private agentIds: number[] = []

  /**
   * @param device - Инициализированный `GPUDevice`.
   */
  constructor(device: GPUDevice) {
    this.backend = new GPUBackend(device)
    this.braneManager = new BraneManager(device)
  }

  /**
   * Инициализирует систему: компилирует правила, выделяет память и загружает данные.
   *
   * ### Алгоритм инициализации:
   * 1. Регистрация полей в GlobalFieldRegistry (создание field_id).
   * 2. Создание агентов через BraneManager с автоматической группировкой общих полей.
   * 3. Компиляция графа переходов в байт-код кастомной VM.
   * 4. Инициализация GPU-буферов и создание compute pipeline.
   *
   * ### Валидация входных данных:
   * * Каждое состояние, упомянутое как цель перехода, должно быть объявлено в корне superposition.
   * * Все компоненты, используемые в условиях, должны быть описаны в branes.
   * * Начальные состояния quanta должны существовать в stateMap.
   *
   * @param config - Конфигурация симуляции.
   * @param config.superposition - Суперпозиция переходов в формате { [state]: { [target]: { [field]: condition } } }.
   * **Пример:** `{ "IDLE": { "PATROL": { "hp": { "gt": 50 } } } }`
   * @param config.branes - Схема типов данных. Определяется объектами:
   * * `{ type: "number" }` → 32-битное число с плавающей точкой (f32).
   * * `{ type: "boolean" }` → 0/1 значение.
   * * `{ type: "string" }` → строка (хранится в куче).
   * * `{ type: "array<string>" }` → массив строк (хранится в куче).
   * * `{ type: "array<number>" }` → массив чисел (хранится в куче).
   * * `{ type: "enum<string>", values: string[] }` → перечисление строк.
   * * `{ type: "enum<number>", values: number[] }` → перечисление чисел.
   * @param config.quanta - Массив квантов для инициализации.
   * **Формат:** `{ id: string, state: string, brane: Record<string, unknown> }`
   *
   * @throws {Error} Если:
   * * WebGPU не поддерживается или устройство недоступно.
   * * Обнаружено неизвестное состояние или поле.
   * * Не удалось аллоцировать память в GPU-куче.
   *
   * @example
   * ```ts
   * await system.init({
   *   superposition: { IDLE: { PATROL: { hp: { gt: 50 } } } },
   *   branes: { hp: { type: "number" } },
   *   quanta: [
   *     { id: "hero", state: "IDLE", brane: { hp: 100 } }
   *   ]
   * });
   * ```
   */
  async init(config: QuantumFieldSystemConfig) {
    // 1. Регистрируем поля из схемы в глобальном реестре.
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
          throw new Error(`Unknown field type in branes: '${typeStr}' for field '${name}'`)
      }
      if (!registry.has(name)) {
        const registerOptions = {
          ...(elementType !== undefined ? { elementType } : {}),
          ...(enumValues !== undefined ? { enumValues } : {}),
        }
        registry.register(name, fieldType, registerOptions)
      }
    }

    // 2. Создаём кванты — менеджер сам группирует поля!
    this.agentIds = this.braneManager.createSuperposition(config.quanta.map((q) => q.brane))

    // 3. Компилируем правила FSM ([type, field_id, op, value]).
    const compiled = this.compiler.compile(config.superposition, config.branes, { preserveRegistry: true })
    this.stateMap = compiled.stateMap
    this.reverseStateMap = Object.keys(compiled.stateMap)

    // 4. Инициализируем бэкенд.
    const states = new Uint32Array(config.quanta.map((q) => this.stateMap[q.state] ?? 0))

    const { quantumDescriptors, heap } = this.braneManager.getGPUBuffers()

    await this.backend.init({
      quantumCount: config.quanta.length,
      bytecode: compiled.bytecode,
      states,
      quantumDescriptors,
      heap,
      tableOffset: compiled.stateTableOffset,
    })
  }

  /**
   * Выполняет один такт симуляции, запуская compute shader на GPU.
   *
   * ### Алгоритм работы:
   * 1. Запуск compute pass с байт-кодом правил и данными агентов.
   * 2. Каждый GPU-инвариант обрабатывает одного агента (workgroup size = 64).
   * 3. После выполнения копирование результатов из `newStates` в `states` (ping-pong swap).
   *
   * ### Производительность:
   * * Compute shader выполняется асинхронно относительно CPU.
   * * Для синхронизации используйте `await system.getStates()`.
   * * Время выполнения зависит от сложности правил и количества агентов.
   *
   * @see {@link getStates} для чтения результатов.
   */
  step() {
    this.backend.run()
  }

  /**
   * Асинхронно читает текущие состояния агентов из GPU.
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
   * @returns Promise, разрешающийся в массив строковых имен состояний в порядке агентов.
   *
   * @example
   * ```ts
   * // После 10 шагов симуляции
   * for (let i = 0; i < 10; i++) system.step();
   * const finalStates = await system.getStates(); // ['PATROL', 'DEAD', ...]
   * ```
   */
  async getStates(): Promise<string[]> {
    const raw = await this.backend.read()
    return Array.from(raw).map((id) => this.reverseStateMap[id]!)
  }

  /**
   * Обновляет компоненту браны конкретного кванта и синхронизирует изменения с GPU.
   *
   * ### Алгоритм обновления:
   * 1. Поиск блока агента в куче через agentDescriptors.
   * 2. Для скалярных типов (числа, булевы) — прямая запись в кучу.
   * 3. Для типов переменного размера (строки, массивы):
   *    * Освобождение старого блока в аллокаторе.
   *    * Аллокация нового блока с новыми данными.
   *    * Обновление указателя в блоке агента.
   * 4. Если куча изменилась (heapDirty), копирование всей кучи в GPU-буфер.
   *
   * ### Ограничения:
   * * **Тип поля должен совпадать** с зарегистрированным в schema.
   * * **Нет проверки на переполнение кучи** — может выбросить ошибку аллокатора.
   * * **Не атомарно на GPU** — изменения видны в следующем шаге симуляции.
   *
   * @param agentIndex - Порядковый индекс кванта в массиве quanta (0-based).
   * @param fieldName - Имя компоненты, зарегистрированное в branes.
   * @param value - Новое значение (тип должен соответствовать схеме).
   *
   * @throws {Error} Если:
   * * agentIndex выходит за границы массива агентов.
   * * fieldName не зарегистрировано в GlobalFieldRegistry.
   * * Поле не найдено в блоке агента (отсутствует в бране).
   * * Не удалось аллоцировать память для значения переменного размера.
   *
   * @example
   * ```ts
   * // Уменьшить здоровье героя на 30
   * system.updateBraneField(0, "hp", 70);
   * ```
   */
  updateBraneField(agentIndex: number, fieldName: string, value: unknown): void {
    const agentId = this.agentIds[agentIndex]
    if (agentId === undefined) {
      throw new Error(`Неизвестный индекс агента: ${agentIndex}`)
    }

    this.braneManager.updateBraneField(agentId, fieldName, value)
    if (this.braneManager.isHeapDirty()) {
      const { heap } = this.braneManager.getGPUBuffers()
      this.backend.updateHeap(heap)
      this.braneManager.clearDirtyFlag()
    }
  }
}
