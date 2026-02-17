/**
* Boundary — главный класс библиотеки.
*
* Онтология (квантовая теория поля):
* - Boundary (Граница) — область пространства, содержащая браны
* - Brane (Брана) — агент/сущность с полями данных, суперпозицией и состоянием
* - Field (Поле) — данные внутри браны (hp, mana, name)
* - Superposition (Суперпозиция) — граф возможных переходов между состояниями
* - State (Состояние) — текущее наблюдаемое состояние
*/

import { GPUBackend } from "./backend"
import { RulesCompiler } from "./compiler"
import { BraneManager, FieldType, FieldRegistry, type FieldTypeValue } from "./context"
import { resetStringAtlas, getStringAtlas } from "./typeBridge"

export type BraneFieldDefinition =
  | { type: "number" }
  | { type: "boolean" }
  | { type: "string" }
  | { type: "array<string>" }
  | { type: "array<number>" }
  | { type: "enum<string>"; values: string[] }
  | { type: "enum<number>"; values: number[] }

export type BraneSchema = Record<string, BraneFieldDefinition>

export type Superposition = Record<string, Record<string, any> | null>

export interface BraneDefinition {
  id: string
  brane: Record<string, unknown>
  state: string
  superposition: Superposition
}

export interface BoundaryConfig {
  fields: BraneSchema
  branes: BraneDefinition[]
}

export class Boundary {
  private backend: GPUBackend
  private compiler = new RulesCompiler()
  private braneManager: BraneManager
  private stateMaps: Record<string, number>[] = []
  private reverseStateMaps: string[][] = []
  private braneIds: number[] = []

  constructor(device: GPUDevice) {
    this.backend = new GPUBackend(device)
    this.braneManager = new BraneManager(device)
  }

  async init(config: BoundaryConfig) {
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
      }
    }

    this.braneIds = this.braneManager.createEnsemble(config.branes.map((f) => f.brane))

    const compiled = this.compiler.compileEnsemble(
      config.branes.map((f) => f.superposition),
      config.fields,
    )
    this.stateMaps = compiled.stateMaps
    this.reverseStateMaps = compiled.reverseStateMaps

    const states = new Uint32Array(
      config.branes.map((f, i) => this.stateMaps[i]![f.state] ?? 0),
    )

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

    await this.backend.init({
      braneCount: config.branes.length,
      bytecode: compiled.bytecode,
      bytecodeOffsets: compiled.bytecodeOffsets,
      states,
      braneDescriptors,
      heap,
    })
  }

  step() {
    this.backend.run()
  }

  async getStates(): Promise<string[]> {
    const raw = await this.backend.read()
    return Array.from(raw).map((id, i) => this.reverseStateMaps[i]![id]!)
  }

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
