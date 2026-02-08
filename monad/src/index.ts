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

  // Карты маппинга
  private stateMap: Record<string, number> = {}
  private reverseStateMap: string[] = []
  private fieldMap: Record<string, { type: number; index: number }> = {}

  /**
   * @param device - Инициализированный `GPUDevice`.
   */
  constructor(device: GPUDevice) {
    this.backend = new GPUBackend(device)
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
    // 1. Компиляция правил
    const compiled = this.compiler.compile(config.statesConfig, config.contextSchema)
    this.stateMap = compiled.stateMap
    this.reverseStateMap = Object.keys(compiled.stateMap)
    this.fieldMap = compiled.fieldMap

    // 2. Подготовка буферов данных в блочной модели памяти
    const monadCount = config.monads.length;
    const states = new Uint32Array(monadCount);
    
    // Рассчитываем размер блока памяти на одного агента
    const fieldCount = compiled.fieldCount;
    const floatFields = Object.values(this.fieldMap).filter(f => f.type === 0).length;
    const uintFields = fieldCount - floatFields;
    const blockStride = fieldCount; // Количество слов в блоке на агента (упрощенно)
    
    // Выделяем буферы для контекста всех агентов (блоковая модель)
    // Каждый агент получает непрерывный блок памяти: [float поля...][uint поля...]
    const contextDataFloats = new Float32Array(monadCount * floatFields);
    const contextDataUints = new Uint32Array(monadCount * uintFields);
    
    // Инициализация данных монад - теперь передаем реальные значения, а не индексы!
    config.monads.forEach((m, agentIdx) => {
      states[agentIdx] = this.stateMap[m.state] ?? 0;
      
      // Заполняем буферы контекста реальными значениями из контекста агента.
      // FLOAT поля хранятся отдельно от UINT в разных буферах.
      for (const [key, value] of Object.entries(m.context)) {
        const field = this.fieldMap[key];
        if (!field) continue;
        // FLOAT поля: индекс = (номер_агента * количество_float_полей) + локальный_индекс_поля_типа
        if (field.type === 0) { // FLOAT
          const floatIdx = agentIdx * floatFields + field.index;
          contextDataFloats[floatIdx] = Number(value);
        } else { // UINT/BOOL
          const uintIdx = agentIdx * uintFields + field.index;
          contextDataUints[uintIdx] = Number(value);
        }
      }
    });

    // 3. Инициализация бэкенда с блочной моделью памяти
    await this.backend.init({
      monadCount,
      floatFieldCount: floatFields,
      uintFieldCount: uintFields,
      bytecode: compiled.bytecode,
      states,
      contextDataFloats,
      contextDataUints,
      tableOffset: compiled.stateTableOffset,
    });
  }

  /**
   * Обновляет значение поля контекста для конкретного агента.
   * Передаем реальные значения, а не индексы буфера.
   *
   * @param agentIndex - Индекс агента (0..monadCount-1)
   * @param fieldName - Имя поля контекста (например, "hp", "mana")
   * @param value - Новое значение поля (число или булево)
   */
  updateContext(agentIndex: number, fieldName: string, value: number | boolean) {
    const field = this.fieldMap[fieldName];
    if (!field) {
      console.warn(`Unknown field: ${fieldName}`);
      return;
    }
    // Определяем тип поля для правильной записи в буфер
    const isFloat = field.type === 0;
    // Вычисляем абсолютный индекс в буфере: (агент * количество_полей_типа) + локальный_индекс_поля_типа
    const fieldCountOfType = field.type === 0 ?
      Object.values(this.fieldMap).filter(f => f.type === 0).length :
      Object.values(this.fieldMap).filter(f => f.type !== 0).length;
    const absoluteIndex = agentIndex * fieldCountOfType + field.index;
    this.backend.writeContextValue(absoluteIndex, Number(value), isFloat);
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
