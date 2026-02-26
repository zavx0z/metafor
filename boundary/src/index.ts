/**
 * Boundary — полевая граница (GPU-фасад).
 *
 * ## Архитектура
 *
 * Boundary управляет полями (fields) и бранами (branes):
 * - **Fields** — статика: схема типов полей для GPU
 * - **Branes** — динамика: возмущения в полях с params, state, superposition
 *
 * Основные компоненты:
 *
 * - **{@link Boundary}** — фасад модуля, координирует инициализацию и эволюцию.
 * - **{@link GPUBackend}** — драйвер WebGPU, управляет буферами и compute-шейдерами.
 * - **{@link RulesCompiler}** — транслирует суперпозиции в байт-код для VM на GPU.
 * - **{@link BraneManager}** — менеджер памяти бран (аллокация, обновление params).
 * - **{@link StringAtlas}** — система интернирования строк для GPU.
 *
 * ## Поток данных
 *
 * ```
 * BoundaryConfig (fields + branes) → RulesCompiler → bytecode → GPUBackend
 *                                 ↓
 *          BraneManager → heap → GPUBuffer → compute pass → new states
 * ```
 *
 * ## Ключевые ограничения
 *
 * - Все состояния должны быть объявлены в корне superposition (даже `null`).
 * - Размер heap фиксирован (по умолчанию 16384 u32).
 * - Readback из GPU — асинхронная операция (медленно).
 *
 * @packageDocumentation
 */

import { GPUBackend } from "./gpu/Backend"
import { RulesCompiler } from "./compiler/RulesCompiler"
import { BraneManager } from "./core"
import { resetStringAtlas, getStringAtlas } from "./strings"
import { GPU } from "./gpu/device"
import type { DebugOptions, BoundaryConfig } from "./index.t"

export { GPU }
export { FieldType, type FieldTypeValue, type Field } from "./index.t"
export type {
  FieldDefinition,
  FieldsDefinition,
  Superposition,
  BraneDefinition,
  DebugOptions,
  BoundaryConfig,
  FieldTuple,
  ValueTuple,
  BraneIndex,
  NumericSuperposition,
  Transition,
} from "./index.t"

/**
 * Boundary — полевая граница (GPU-фасад).
 *
 * Координирует GPU-ресурсы, компиляцию суперпозиций и эволюцию бран.
 *
 * @example
 * ```ts
 * // В тестах: _device = await setupDevice()
 * const boundary = new Boundary({ debug: { all: true } })
 *
 * await boundary.write({
 *   fields: [[0, { type: FieldType.F32 }]],
 *   branes: [{
 *     params: [[0, 100]],
 *     state: "IDLE",
 *     superposition: { IDLE: { FIGHT: { 0: { gt: 50 } } }, FIGHT: null }
 *   }]
 * })
 *
 * boundary.step()
 * const states = await boundary.getStates()
 *
 * // Очистка данных (граница сохраняется)
 * boundary.clear()
 * ```
 */
export class Boundary {
  private backend: GPUBackend
  private compiler = new RulesCompiler()
  private braneManager: BraneManager
  private braneIds: number[] = []
  private debugOptions: DebugOptions | null = null

  constructor(options?: { debug?: DebugOptions }) {
    this.debugOptions = options?.debug ?? null
    this.backend = new GPUBackend(GPU.device)
    this.braneManager = new BraneManager(GPU.device, { debug: this.isDebugEnabled("branes") })
  }

  private isDebugEnabled(category: keyof DebugOptions): boolean {
    if (!this.debugOptions) return false
    if (this.debugOptions.all) return true
    return !!this.debugOptions[category]
  }

  /**
   * Очищает данные границы (StringAtlas, GPU-буферы, BraneManager).
   *
   * @remarks
   * **Side Effects:**
   * - Очищает StringAtlas.
   * - Уничтожает все GPU-буферы.
   * - Сбрасывает состояние BraneManager.
   * - После вызова требуется повторный `write()` для работы.
   */
  clear() {
    resetStringAtlas()
    this.braneManager.clear()
    this.backend.clear()
    this.braneIds = []
  }

  /**
   * Записывает конфигурацию на границу (GPU-ресурсы должны быть инициализированы).
   *
   * @remarks
   * **Архитектура:**
   * - **Fields (поля)** — общие для всех бран: схема типов для GPU в формате кортежей
   * - **Branes (браны)** — независимые возмущения: каждая со своими params, state, superposition
   *
   * **Side Effects:**
   * - Очищает StringAtlas перед записью.
   * - Аллоцирует GPU-буферы (не освобождаются автоматически).
   *
   * @param config - Конфигурация полевой границы.
   * @param config.fields - Поля в формате кортежей [[index, field], ...].
   * @param config.branes - Массив бран (по одной на superposition).
   *
   * @throws {Error} Если тип поля не распознан.
   *
   * @example
   * ```ts
   * await boundary.write({
   *   fields: [[0, { type: FieldType.F32 }]],
   *   branes: [
   *     { params: [[0, 100]], state: "IDLE", superposition: {...} },  // брана 0
   *     { params: [[0, 80]], state: "PATROL", superposition: {...} }, // брана 1
   *   ]
   * })
   * ```
   */
  async write(config: BoundaryConfig) {
    const debug = this.isDebugEnabled.bind(this)

    if (debug("fields")) console.log("[Boundary] Writing fields:", config.fields)

    this.clear()

    if (debug("branes")) {
      console.log("[Boundary] Creating ensemble with", config.branes.length, "branes")
      config.branes.forEach((b, i) => {
        console.log(`  [Brane ${i}] initialStateIndex=${b.state}, params=`, b.params)
      })
    }

    this.braneIds = this.braneManager.createEnsemble(
      config.branes.map((b) => b.params),
      config.fields,
    )

    if (debug("compiler")) {
      console.log("[Boundary] Compiling ensemble rules...")
    }
    const compiled = this.compiler.compileEnsemble(
      config.branes.map((f) => f.superposition),
      config.fields,
      { debug: debug("compiler") },
    )

    // Initial states из branes.state
    const states = new Uint32Array(config.branes.map((b) => b.state))

    if (debug("branes")) {
      console.log("[Boundary] Initial states (encoded):", Array.from(states))
      console.log("[Boundary] Brane IDs:", this.braneIds)
    }

    const { braneDescriptors: braneBlockPointers, heap } = this.braneManager.getGPUBuffers()

    const braneDescriptors = new Uint32Array(config.branes.length * 2)
    for (let i = 0; i < config.branes.length; i++) {
      braneDescriptors[i * 2] = braneBlockPointers[i]!
      braneDescriptors[i * 2 + 1] = compiled.bytecodeOffsets[i]!
    }

    const atlas = getStringAtlas()
    const atlasExport = atlas.export()

    if (debug("strings")) {
      console.log("[Boundary] String Atlas:", {
        registry: atlasExport.registry.length,
        heap: atlasExport.heap.length,
      })
    }

    if (debug("gpu")) {
      console.log("[Boundary] Initializing GPU backend:", {
        braneCount: config.branes.length,
        bytecodeSize: compiled.bytecode.length,
        heapSize: heap.length,
        statesSize: states.length,
      })
    }

    await this.backend.init(
      {
        braneCount: config.branes.length,
        bytecode: compiled.bytecode,
        bytecodeOffsets: compiled.bytecodeOffsets,
        states,
        braneDescriptors,
        heap,
      },
      debug("gpu"),
    )
  }

/**
* Выполняет один шаг эволюции (compute pass).
* После вызова новые состояния доступны через {@link getStates}.
*/
step() {
this.backend.run()
// Обрабатываем отложенные освобождения памяти
this.braneManager.processPendingFrees()
}

  /**
   * Читает текущие состояния бран из GPU.
   *
   * **Внимание:** Асинхронная операция с синхронизацией CPU/GPU (медленно).
   *
   * @returns Массив числовых ID состояний (по индексу браны).
   */
  async getStates(): Promise<Uint32Array> {
    return await this.backend.read()
  }

/**
* Обновляет значение поля браны в heap.
*
* @remarks
* **Side Effect:** Если изменился размер heap, отправляет новые данные на GPU.
*
* @param braneIndex - Индекс браны в массиве конфигурации `[0..branes.length-1]`.
* @param fieldId - Индекс поля.
* @param value - Новое значение (тип должен соответствовать схеме fields).
*
* @throws {Error} Если braneIndex вне диапазона.
*/
updateBraneField(braneIndex: number, fieldId: number, value: unknown): void {
const braneId = this.braneIds[braneIndex]
if (braneId === undefined) {
throw new Error(`Unknown brane index: ${braneIndex}`)
}
this.braneManager.updateBraneField(braneId, fieldId, value)
if (this.braneManager.isHeapDirty()) {
const { heap } = this.braneManager.getGPUBuffers()
this.backend.updateHeap(heap)
this.braneManager.clearDirtyFlag()
}
}

/**
* Получает статистику использования памяти.
*
* @returns Статистика памяти
*/
getMemoryStats(): {
used: number
free: number
pendingFrees: number
extraAllocs: number
} {
return this.braneManager.getMemoryStats()
}

/**
* Получает статистику entangled (shared) блоков.
*
* @returns Статистика entangled блоков
*/
getEntangledStats(): {
count: number
totalSize: number
} {
return this.braneManager.getEntangledStats()
}
}

// Экспорты для совместимости
export { BraneManager, type BraneInfo, type EntangledBraneInfo } from "./core/BraneManager"
export { HeapAllocator, type AllocResult } from "./memory"
export { BraneBuilder, BlockUtils, packMeta, unpackMeta, encodeString, decodeString } from "./memory"
export { StringAtlas, getStringAtlas, resetStringAtlas, type StringId, type StringMeta } from "./strings"
export { GPUBackend } from "./gpu"
export { RulesCompiler } from "./compiler"
export type { CompiledRules, CompiledFieldRules, CompiledEnsemble, StateId } from "./index.t"
export { OP, TYPE } from "./opcodes"
