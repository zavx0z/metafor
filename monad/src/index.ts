/**
 * Модуль управления массивными симуляциями агентов на GPU.
 *
 * ## Архитектура (v2.x)
 * 
 * **Ядро (Core Pattern):** Библиотека реализует паттерн **Data-Oriented Design** с акцентом на параллелизм GPU.
 * 
 * ### Ключевые компоненты:
 * 1. **ContextManager** — управление памятью агентов в формате "самоописываемых блоков" с автоматической группировкой общих полей.
 * 2. **RulesCompiler** — транслятор JSON-правил в байт-код для кастомной VM, исполняемой в compute shader.
 * 3. **GPUBackend** — драйвер WebGPU, управляющий VRAM и диспетчеризацией вычислительных работ.
 *
 * ### Особенности памяти (Memory Layout):
 * * **Глобальная куча (heap):** Единый GPUBuffer с менеджером свободных блоков (free-list).
 * * **Указатели (pointers):** Все ссылки — абсолютные смещения в словах (u32) от начала кучи.
 * * **Shared контексты:** Поля с одинаковыми значениями у нескольких агентов автоматически группируются в разделяемые блокы.
 *
 * ### Важные ограничения:
 * * **Нет обратной совместимости:** Формат байт-кода и структура кучи могут меняться между минорными версиями.
 * * **Только WebGPU:** Требует поддержки `navigator.gpu` и устройства с compute shader capability.
 * * **Размер кучи фиксирован:** По умолчанию 16384 слов (64KB), конфигурируется в ContextManagerConfig.
 *
 * @packageDocumentation
 */
import { GPUBackend } from "./backend"
import { RulesCompiler } from "./compiler"
import { ContextManager, FieldType, GlobalFieldRegistry, type FieldTypeValue } from "./context"

/**
 * Конфигурация для инициализации `MonadSystem`.
 */
export interface MonadSystemConfig {
  /**
   * Граф состояний и переходов между ними.
   * @example
   * ```json
   * {
   *   "IDLE": { "WALK": { "mana": { "gt": 10 } } },
   *   "WALK": { "IDLE": { "mana": { "lte": 10 } } }
   * }
   * ```
   */
  statesConfig: any
  /**
   * Схема памяти агента. Определяет layout буферов (Struct of Arrays).
   *
   * Используется компилятором для:
   * 1. Расчета смещений в буферах `floats` и `uints`.
   * 2. Генерации инструкций доступа к памяти в байт-коде.
   *
   * | Input Schema | Internal GPU Type | Memory Storage |
   * | :--- | :--- | :--- |
   * | `{ type: "float" }` | `TYPE.FLOAT` | `buffer_floats` (f32) |
   * | `{ type: "integer" }` | `TYPE.UINT` | `buffer_uints` (u32) |
   * | `{ type: "boolean" }` | `TYPE.BOOL` | `buffer_uints` (0/1) |
   * | `{ type: "enum", ... }` | `TYPE.UINT` | `buffer_uints` (index) |
   * | `{ type: "array<T>" }` | `TYPE.ARRAY` | `buffer_uints` (pointer -> heap) |
   *
   * @example
   * ```ts
   * const schema = {
   *   hp: { type: "float" },
   *   status: { type: "enum", values: ["ALIVE", "DEAD"] }
   * }
   * ```
   */
  contextSchema: any

  /**
   * Массив начальных состояний для каждой монады (агента).
   */
  monads: Array<{ id: string; state: string; context: any }>
}

/**
 * `MonadSystem` — это главный класс библиотеки.
 *
 * Он представляет собой высокоуровневый фасад, который скрывает сложность
 * компиляции правил и низкоуровневого взаимодействия с WebGPU.
 *
 * **Основной воркфлоу:**
 * 1. **Создание:** `new MonadSystem(device)`
 * 2. **Инициализация:** `await system.init({...})`. На этом шаге правила компилируются в байт-код,
 *    создаются GPU-буферы и загружаются начальные данные.
 * 3. **Симуляция:** `system.step()` для выполнения одного такта вычислений на GPU.
 * 4. **Получение результатов:** `await system.getStates()` для чтения итоговых состояний.
 */
export class MonadSystem {
  private backend: GPUBackend
  private compiler = new RulesCompiler()
  private contextManager: ContextManager

  // Карты маппинга
  private stateMap: Record<string, number> = {}
  private reverseStateMap: string[] = []
  private agentIds: number[] = []

  /**
   * @param device - Инициализированный `GPUDevice`.
   */
  constructor(device: GPUDevice) {
    this.backend = new GPUBackend(device)
    this.contextManager = new ContextManager(device)
  }

  /**
   * Инициализирует систему: компилирует правила, выделяет память и загружает данные.
   * 
   * ### Алгоритм инициализации:
   * 1. Регистрация полей в GlobalFieldRegistry (создание field_id).
   * 2. Создание агентов через ContextManager с автоматической группировкой общих полей.
   * 3. Компиляция графа переходов в байт-код кастомной VM.
   * 4. Инициализация GPU-буферов и создание compute pipeline.
   * 
   * ### Валидация входных данных:
   * * Каждое состояние, упомянутое как цель перехода, должно быть объявлено в корне statesConfig.
   * * Все поля, используемые в условиях, должны быть описаны в contextSchema.
   * * Начальные состояния monads должны существовать в stateMap.
   *
   * @param config - Конфигурация симуляции.
   * @param config.statesConfig - Граф переходов в формате { [state]: { [target]: { [field]: condition } } }.
   * **Пример:** `{ "IDLE": { "PATROL": { "hp": { "gt": 50 } } } }`
   * @param config.contextSchema - Схема типов данных. Поддерживаемые типы:
   * * `"float"`, `"number"` → 32-битное число с плавающей точкой.
   * * `"integer"` → 32-битное беззнаковое целое.
   * * `"boolean"` → 0/1 значение.
   * * `"array<T>"` → массив элементов типа T (хранится в куче).
   * * `"enum"` → целочисленный индекс (значения в `values: [...]`).
   * @param config.monads - Массив агентов для инициализации.
   * **Формат:** `{ id: string, state: string, context: Record<string, unknown> }`
   * 
   * @throws {Error} Если:
   * * WebGPU не поддерживается или устройство недоступно.
   * * Обнаружено неизвестное состояние или поле.
   * * Не удалось аллоцировать память в GPU-куче.
   * 
   * @example
   * ```ts
   * await system.init({
   *   statesConfig: { IDLE: { PATROL: { hp: { gt: 50 } } } },
   *   contextSchema: { hp: "number" },
   *   monads: [
   *     { id: "hero", state: "IDLE", context: { hp: 100 } }
   *   ]
   * });
   * ```
   */
  async init(config: {
    statesConfig: any // Суперпозиция (Superposition)
    contextSchema: any
    monads: Array<{ id: string; state: string; context: any }>
  }) {
    // 1. Регистрируем поля из схемы в глобальном реестре.
    const registry = GlobalFieldRegistry.getInstance()

    for (const [name, def] of Object.entries(config.contextSchema)) {
      const defTyped = def as { type?: string; values?: any[] } | string
      const typeStr = typeof defTyped === "string" ? defTyped : defTyped.type
      let fieldType: FieldTypeValue
      let elementType: string | undefined
      const enumValues = typeof defTyped !== "string" && "values" in defTyped ? defTyped.values : undefined

      // Маппинг человекопонятных типов -> FieldType.
      switch (typeStr) {
        case "float":
        case "number":
          fieldType = FieldType.F32
          break
        case "integer":
          fieldType = FieldType.U32
          break
        case "boolean":
          fieldType = FieldType.BOOL
          break
        case "string":
          fieldType = FieldType.STRING_PTR
          break
        default:
          if (typeof typeStr === "string" && /^array<.+>$/.test(typeStr)) {
            fieldType = FieldType.ARRAY_PTR
            elementType = typeStr.match(/^array<(.+)>$/)?.[1]
          } else if (
            (typeof typeStr === "string" && /^enum<.+>$/.test(typeStr)) ||
            (typeof defTyped !== "string" && "values" in defTyped && defTyped.values)
          ) {
            fieldType = FieldType.U32
          } else {
            fieldType = FieldType.U32
          }
      }
      if (!registry.has(name)) {
        const registerOptions = {
          ...(elementType !== undefined ? { elementType } : {}),
          ...(enumValues !== undefined ? { enumValues } : {}),
        }
        registry.register(name, fieldType, registerOptions)
      }
    }

    // 2. Создаём агентов — менеджер сам группирует поля!
    this.agentIds = this.contextManager.createAgents(config.monads.map((m) => m.context))

    // 3. Компилируем правила FSM ([type, field_id, op, value]).
    const compiled = this.compiler.compile(config.statesConfig, config.contextSchema, { preserveRegistry: true })
    this.stateMap = compiled.stateMap
    this.reverseStateMap = Object.keys(compiled.stateMap)

    // 4. Инициализируем бэкенд.
    const states = new Uint32Array(config.monads.map((m) => this.stateMap[m.state] ?? 0))

    const { agentDescriptors, heap } = this.contextManager.getGPUBuffers()

    await this.backend.init({
      monadCount: config.monads.length,
      bytecode: compiled.bytecode,
      states,
      agentDescriptors,
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
   * Обновляет поле контекста конкретного агента и синхронизирует изменения с GPU.
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
   * @param agentIndex - Порядковый индекс агента в массиве monads (0-based).
   * @param fieldName - Имя поля, зарегистрированное в contextSchema.
   * @param value - Новое значение (тип должен соответствовать схеме).
   * 
   * @throws {Error} Если:
   * * agentIndex выходит за границы массива агентов.
   * * fieldName не зарегистрировано в GlobalFieldRegistry.
   * * Поле не найдено в блоке агента (отсутствует в контексте).
   * * Не удалось аллоцировать память для значения переменного размера.
   * 
   * @example
   * ```ts
   * // Уменьшить здоровье героя на 30
   * system.updateContext(0, "hp", 70);
   * ```
   */
  updateContext(agentIndex: number, fieldName: string, value: unknown): void {
    const agentId = this.agentIds[agentIndex]
    if (agentId === undefined) {
      throw new Error(`Неизвестный индекс агента: ${agentIndex}`)
    }

    this.contextManager.updateAgentField(agentId, fieldName, value)
    if (this.contextManager.isHeapDirty()) {
      const { heap } = this.contextManager.getGPUBuffers()
      this.backend.updateHeap(heap)
      this.contextManager.clearDirtyFlag()
    }
  }
}
