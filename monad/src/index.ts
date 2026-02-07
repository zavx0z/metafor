/**
 * @file Основной модуль библиотеки `@metafor/monad`, предоставляющий высокоуровневый API.
 * @packageDocumentation
 */

import { GPUBackend } from "./backend";
import { RulesCompiler } from "./compiler";
import type { CompiledRules } from "./common";

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
  statesConfig: any;

  /**
   * Схема, описывающая типы данных полей контекста для каждой монады.
   * @example ` { hp: "number", isAlive: "boolean" }`
   */
  contextSchema: Record<string, string>;

  /**
   * Массив начальных состояний для каждой монады (агента).
   */
  monads: Array<{ id: string; state: string; context: any }>;

  /**
   * Размеры глобальных буферов контекста, которые будут аллоцированы на GPU.
   */
  globalContextSize: { floats: number; uints: number };
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
    globalContextSize: { floats: number; uints: number }
  }) {
    // 1. Компиляция правил
    const compiled = this.compiler.compile(config.statesConfig, config.contextSchema)
    this.stateMap = compiled.stateMap
    this.reverseStateMap = Object.keys(compiled.stateMap)
    this.fieldMap = compiled.fieldMap

    // 2. Подготовка буферов данных
    const monadCount = config.monads.length
    const states = new Uint32Array(monadCount)

    // Карта контекста: монада -> локальные индексы -> глобальные индексы
    // Нам нужно знать количество полей на монаду. Полагаем, что у всех монад одна схема.
    const fieldsCount = Object.keys(this.fieldMap).length
    const contextMap = new Uint32Array(monadCount * fieldsCount)

    // Инициализация данных монад
    config.monads.forEach((m, idx) => {
      states[idx] = this.stateMap[m.state] ?? 0
      // Здесь мы маппим локальные поля на глобальные слоты.
      // В реальности 'm.context' может содержать указатели, или мы аллоцируем слоты сейчас.
      // Упрощение: Мы полагаем, что CPU-оркестратор управляет аллокацией глобального контекста отдельно
      // и передает нам индексы.
      // Для демо считаем, что m.context ЭТО список глобальных индексов.
      // Пример: m.context = { hp: 10, pos: 15 }, где 10 и 15 — глобальные индексы.
      for (const [key, globalIdx] of Object.entries(m.context)) {
        const field = this.fieldMap[key]
        if (field) {
          contextMap[idx * fieldsCount + field.index] = Number(globalIdx)
        }
      }
    })

    // 3. Инициализация бэкенда
    await this.backend.init({
      monadCount,
      mapStride: fieldsCount,
      bytecode: compiled.bytecode,
      states,
      contextMap,
      globalFloats: new Float32Array(config.globalContextSize.floats),
      globalUints: new Uint32Array(config.globalContextSize.uints),
      tableOffset: compiled.stateTableOffset,
    })
  }

  /**
   * Обновляет значения в глобальном контексте.
   * Используется для изменения внешних условий (время, погода, ввод игрока).
   *
   * @param globalUpdates - Словарь `{ индекс: значение }`.
   * @param type - Тип буфера (`float` или `uint`).
   */
  updateContext(globalUpdates: Record<number, number | boolean>, type: "float" | "uint") {
    // В продакшене — запись в буферы.
    // Пока обновляем по одному или создаем большой массив.
    // API требует массив.
    // Упрощенная обертка:
    for (const [idx, val] of Object.entries(globalUpdates)) {
      const arr = type === "float" ? new Float32Array([Number(val)]) : new Uint32Array([Number(val)])
      this.backend.writeGlobal(Number(idx) * 4, arr, type)
    }
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
    return Array.from(raw).map((id) => this.reverseStateMap[id])
  }
}
