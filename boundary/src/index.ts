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
import { BraneManager, FieldType, FieldRegistry, type FieldTypeValue } from "./core"
import { resetStringAtlas, getStringAtlas } from "./strings"
import { GPU } from "./gpu/device"
import type { DebugOptions, BoundaryConfig } from "./index.t"

export { GPU }
export type {
  FieldDefinition,
  FieldsDefinition,
  Superposition,
  BraneDefinition,
  DebugOptions,
  BoundaryConfig,
  BraneIndex,
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
 *   fields: { hp: { type: "number" }, name: { type: "string" } },
 *   branes: [{
 *     id: "hero",
 *     params: { hp: 100, name: "Arthur" },
 *     state: "IDLE",
 *     superposition: { IDLE: { FIGHT: { hp: { gt: 50 } } }, FIGHT: null }
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
  private stateMaps: Record<string, number>[] = []
  private reverseStateMaps: string[][] = []
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
   * Очищает данные границы (FieldRegistry, StringAtlas, GPU-буферы, BraneManager).
   *
   * @remarks
   * **Side Effects:**
   * - Очищает FieldRegistry и StringAtlas.
   * - Уничтожает все GPU-буферы.
   * - Сбрасывает состояние BraneManager.
   * - После вызова требуется повторный `write()` для работы.
   */
  clear() {
    FieldRegistry.clear()
    resetStringAtlas()
    this.braneManager.clear()
    this.backend.clear()
    this.stateMaps = []
    this.reverseStateMaps = []
    this.braneIds = []
  }

  /**
   * Записывает конфигурацию на границу (GPU-ресурсы должны быть инициализированы).
   *
   * @remarks
   * **Side Effects:**
   * - Очищает FieldRegistry и StringAtlas перед записью.
   * - Аллоцирует GPU-буферы (не освобождаются автоматически).
   *
   * @param config - Конфигурация полевой границы (fields + branes).
   *
   * @throws {Error} Если тип поля не распознан.
   */
  async write(config: BoundaryConfig) {
    const debug = this.isDebugEnabled.bind(this)

    if (debug("fields")) {
      console.log("[Boundary] Writing fields:", config.fields)
    }

    this.clear()

    const registry = FieldRegistry.getInstance()
    for (const [name, def] of Object.entries(config.fields)) {
      const defTyped = def as { type?: string; values?: any[] } | string
      const typeStr = typeof defTyped === "string" ? defTyped : defTyped.type
      let fieldType: FieldTypeValue
      let elementType: string | undefined
      const enumValues = typeof defTyped !== "string" && "values" in defTyped ? defTyped.values : undefined

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
          throw new Error(`Unknown brane field type: '${typeStr}' for field '${name}'`)
      }
      if (!registry.has(name)) {
        const registerOptions = {
          ...(elementType !== undefined ? { elementType } : {}),
          ...(enumValues !== undefined ? { enumValues } : {}),
        }
        registry.register(name, fieldType, registerOptions)
        if (debug("fields")) {
          console.log(`[Boundary] Registered field: ${name} = ${fieldType}`, registerOptions)
        }
      }
    }

    if (debug("branes")) {
      console.log("[Boundary] Creating ensemble with", config.branes.length, "branes")
      config.branes.forEach((b, i) => console.log(`  [Brane ${i}] state="${b.state}", params=`, b.params))
    }

    this.braneIds = this.braneManager.createEnsemble(config.branes.map((f) => f.params))

    if (debug("compiler")) {
      console.log("[Boundary] Compiling ensemble rules...")
    }
    const compiled = this.compiler.compileEnsemble(
      config.branes.map((f) => f.superposition),
      config.fields,
      { debug: debug("compiler") },
    )
    this.stateMaps = compiled.stateMaps
    this.reverseStateMaps = compiled.reverseStateMaps

    if (debug("compiler")) {
      console.log("[Boundary] Compiled bytecode:", compiled.bytecode.length, "words")
      console.log("[Boundary] State maps:", this.stateMaps)
    }

    const states = new Uint32Array(config.branes.map((f, i) => this.stateMaps[i]![f.state] ?? 0))

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
  }

  /**
   * Читает текущие состояния бран из GPU.
   *
   * **Внимание:** Асинхронная операция с синхронизацией CPU/GPU (медленно).
   *
   * @returns Массив имён состояний (по индексу браны).
   */
  async getStates(): Promise<string[]> {
    const raw = await this.backend.read()
    return Array.from(raw).map((id, i) => this.reverseStateMaps[i]![id]!)
  }

  /**
   * Обновляет значение поля браны в heap.
   *
   * @remarks
   * **Side Effect:** Если изменился размер heap, отправляет новые данные на GPU.
   *
   * @param braneIndex - Индекс браны в массиве конфигурации `[0..branes.length-1]`.
   * @param fieldName - Имя поля (должно быть зарегистрировано в FieldRegistry).
   * @param value - Новое значение (тип должен соответствовать схеме fields).
   *
   * @throws {Error} Если braneIndex вне диапазона.
   */
  updateBraneField(braneIndex: number, fieldName: string, value: unknown): void {
    const braneId = this.braneIds[braneIndex]
    if (braneId === undefined) {
      throw new Error(`Unknown brane index: ${braneIndex}`)
    }
    this.braneManager.updateBraneField(braneId, fieldName, value)
    if (this.braneManager.isHeapDirty()) {
      const { heap } = this.braneManager.getGPUBuffers()
      this.backend.updateHeap(heap)
      this.braneManager.clearDirtyFlag()
    }
  }
}

// Экспорты для совместимости
export { FieldType, FieldRegistry } from "./core"
export { BraneManager, type BraneInfo, type EntangledBraneInfo } from "./core/BraneManager"
export { HeapAllocator, type AllocResult } from "./memory"
export { BraneBuilder, BlockUtils, packMeta, unpackMeta, encodeString, decodeString } from "./memory"
export { StringAtlas, getStringAtlas, resetStringAtlas, type StringId, type StringMeta } from "./strings"
export { GPUBackend } from "./gpu"
export { RulesCompiler } from "./compiler"
export type { CompiledRules, CompiledFieldRules, CompiledEnsemble, StateId } from "./index.t"
export { OP, TYPE } from "./opcodes"
