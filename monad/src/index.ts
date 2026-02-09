/**
 * Модуль управления массивными симуляциями агентов на GPU.
 *
 * ## Архитектура
 * Библиотека реализует архитектуру **Entity-Component-System (ECS)** на базе **WebGPU Compute Shaders**.
 *
 * * **Superposition (State Graph):** Логика переходов, компилируемая в байт-код кастомной VM.
 * * **Block Memory Model (SoA):** Данные агентов хранятся в плоских буферах (`floats`, `uints`) для когерентного доступа памяти (memory coalescing).
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
   * @param config - Конфигурация симуляции.
   * * `statesConfig`: Граф переходов (Суперпозиция).
   * * `contextSchema`: Описание типов данных.
   * * `monads`: Список начальных состояний агентов.
   */
  async init(config: {
    statesConfig: any // Суперпозиция (Superposition)
    contextSchema: any
    monads: Array<{ id: string; state: string; context: any }>
  }) {
    // 1. Регистрируем поля из схемы в глобальном реестре.
    const registry = GlobalFieldRegistry.getInstance()

    for (const [name, def] of Object.entries(config.contextSchema)) {
      const defTyped = def as { type?: string } | string
      const typeStr = typeof defTyped === "string" ? defTyped : defTyped.type
      let fieldType: FieldTypeValue

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
          } else if (
            (typeof typeStr === "string" && /^enum<.+>$/.test(typeStr)) ||
            (typeof defTyped !== "string" && "values" in defTyped && defTyped.values)
          ) {
            fieldType = FieldType.U32
          } else {
            fieldType = FieldType.U32
          }
      }
      registry.register(name, fieldType)
    }

    // 2. Создаём агентов — менеджер сам группирует поля!
    const agentIds = this.contextManager.createAgents(config.monads.map((m) => m.context))

    // 3. Компилируем правила FSM (field_id вместо [тип, индекс]).
    const compiled = this.compiler.compile(config.statesConfig, {})
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
   * Выполняет один такт симуляции.
   * Отправляет команды вычисления на GPU.
   */
  step() {
    this.backend.run()
  }

  /**
   * Возвращает текущие текстовые метки состояний всех монад.
   * @returns Массив строк (например `['IDLE', 'WALK']`).
   */
  async getStates(): Promise<string[]> {
    const raw = await this.backend.read()
    return Array.from(raw).map((id) => this.reverseStateMap[id]!)
  }
}
