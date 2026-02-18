/**
 * Boundary — движок квантовых полей на WebGPU.
 *
 * ## Архитектура
 *
 * Модуль реализует парадигму "квантовой машины состояний", где переходы между
 * состояниями происходят на GPU в параллельном режиме. Основные компоненты:
 *
 * - **{@link Boundary}** — фасад модуля, координирует инициализацию и эволюцию.
 * - **{@link GPUBackend}** — драйвер WebGPU, управляет буферами и compute-шейдерами.
 * - **{@link RulesCompiler}** — транслирует JSON-правила в байт-код для VM на GPU.
 * - **{@link BraneManager}** — менеджер памяти бран (аллокация, обновление полей).
 * - **{@link StringAtlas}** — система интернирования строк для GPU.
 *
 * ## Поток данных
 *
 * ```
 * JSON Config → RulesCompiler → bytecode → GPUBackend
 *                          ↓
 * BraneManager → heap → GPUBuffer → compute pass → new states
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
import type { CompiledEnsemble } from "./types"

/**
 * Определение типа поля браны.
 * Используется для автоматического маппинга в FieldType и выделения памяти.
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
 * Граф переходов между состояниями.
 * Ключ верхнего уровня — имя состояния, значение — карта переходов.
 * `null` означает состояние без исходящих переходов (терминальное).
 */
export type Superposition = Record<string, Record<string, any> | null>

/**
 * Определение отдельной браны.
 */
export interface BraneDefinition {
  /** Уникальный идентификатор браны (для отладки). */
  id: string
  /** Начальные значения полей. */
  fields: Record<string, unknown>
  /** Имя начального состояния (должно быть в superposition). */
  state: string
  /** Граф переходов для этой браны. */
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
 * Конфигурация границы для инициализации.
 */
export interface BoundaryConfig {
  /** Схема типов полей (общая для всех бран). */
  fields: FieldsDefinition
  /** Массив определений бран. */
  branes: BraneDefinition[]
}

/**
 * Фасад модуля Boundary. Координирует инициализацию GPU-ресурсов,
 * компиляцию правил и эволюцию бран.
 *
 * @example
 * ```ts
 * const adapter = await navigator.gpu.requestAdapter()
 * const device = await adapter.requestDevice()
 * const boundary = new Boundary(device, { debug: { all: true } })
 *
 * await boundary.init({
 *   fields: { hp: { type: "number" }, name: { type: "string" } },
 *   branes: [{
 *     id: "hero",
 *     fields: { hp: 100, name: "Arthur" },
 *     state: "IDLE",
 *     superposition: { IDLE: { FIGHT: { hp: { gt: 50 } } }, FIGHT: null }
 *   }]
 * })
 *
 * boundary.step()
 * const states = await boundary.getStates()
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

  constructor(device: GPUDevice, options?: { debug?: DebugOptions }) {
    this.debugOptions = options?.debug ?? null
    this.backend = new GPUBackend(device)
    this.braneManager = new BraneManager(device, { debug: this.isDebugEnabled('branes') })
  }

  private isDebugEnabled(category: keyof DebugOptions): boolean {
    if (!this.debugOptions) return false
    if (this.debugOptions.all) return true
    return !!this.debugOptions[category]
  }

  /**
   * Инициализирует GPU-ресурсы и загружает конфигурацию.
   *
   * **Side Effects:**
   * - Очищает FieldRegistry и StringAtlas.
   * - Аллоцирует GPU-буферы (не освобождаются автоматически).
   *
   * @param config - Конфигурация границы.
   *
   * @throws {Error} Если тип поля не распознан.
   */
  async init(config: BoundaryConfig) {
    const debug = this.isDebugEnabled.bind(this)

    if (debug('fields')) {
      console.log('[Boundary] Initializing fields:', config.fields)
    }

    FieldRegistry.clear()
    resetStringAtlas()

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
        if (debug('fields')) {
          console.log(`[Boundary] Registered field: ${name} = ${fieldType}`, registerOptions)
        }
      }
    }

    if (debug('branes')) {
      console.log('[Boundary] Creating ensemble with', config.branes.length, 'branes')
      config.branes.forEach((b, i) => {
        console.log(`  [Brane ${i}] id="${b.id}", state="${b.state}", fields=`, b.fields)
      })
    }

    this.braneIds = this.braneManager.createEnsemble(config.branes.map((f) => f.fields))

    if (debug('compiler')) {
      console.log('[Boundary] Compiling ensemble rules...')
    }
    const compiled = this.compiler.compileEnsemble(
      config.branes.map((f) => f.superposition),
      config.fields,
      { debug: debug('compiler') },
    )
    this.stateMaps = compiled.stateMaps
    this.reverseStateMaps = compiled.reverseStateMaps

    if (debug('compiler')) {
      console.log('[Boundary] Compiled bytecode:', compiled.bytecode.length, 'words')
      console.log('[Boundary] State maps:', this.stateMaps)
    }

    const states = new Uint32Array(
      config.branes.map((f, i) => this.stateMaps[i]![f.state] ?? 0),
    )

    if (debug('branes')) {
      console.log('[Boundary] Initial states (encoded):', Array.from(states))
      console.log('[Boundary] Brane IDs:', this.braneIds)
    }

    const { braneDescriptors: braneBlockPointers, heap } = this.braneManager.getGPUBuffers()

    const braneDescriptors = new Uint32Array(config.branes.length * 2)
    for (let i = 0; i < config.branes.length; i++) {
      braneDescriptors[i * 2] = braneBlockPointers[i]!
      braneDescriptors[i * 2 + 1] = compiled.bytecodeOffsets[i]!
    }

    const atlas = getStringAtlas()
    const atlasExport = atlas.export()
    const registryData = atlasExport.registry.length > 0 ? atlasExport.registry : new Uint32Array(1)
    const heapData = atlasExport.heap.length > 0 ? atlasExport.heap : new Uint32Array(1)

    if (debug('strings')) {
      console.log('[Boundary] String Atlas:', {
        registry: atlasExport.registry.length,
        heap: atlasExport.heap.length,
      })
    }

    if (debug('gpu')) {
      console.log('[Boundary] Initializing GPU backend:', {
        braneCount: config.branes.length,
        bytecodeSize: compiled.bytecode.length,
        heapSize: heap.length,
        statesSize: states.length,
      })
    }

    await this.backend.init({
      braneCount: config.branes.length,
      bytecode: compiled.bytecode,
      bytecodeOffsets: compiled.bytecodeOffsets,
      states,
      braneDescriptors,
      heap,
    }, debug('gpu'))
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
   * **Side Effect:** Если изменился размер heap, отправляет новые данные на GPU.
   *
   * @param braneIndex - Индекс браны в массиве конфигурации `[0..branes.length-1]`.
   * @param fieldName - Имя поля (должно быть зарегистрировано).
   * @param value - Новое значение (тип должен соответствовать схеме).
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
export type {
  CompiledRules,
  CompiledFieldRules,
  CompiledEnsemble,
  StateId,
} from "./types"
export { OP, TYPE } from "./opcodes"
