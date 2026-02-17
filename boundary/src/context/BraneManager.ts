/**
 * Менеджер бран: аллокация памяти, обновление полей, управление жизненным циклом.
 *
 * Использует архитектуру самоописываемых блоков: каждый блок содержит заголовок
 * с метаданными полей, что позволяет шейдеру динамически определять структуру данных.
 *
 * ## Поддержка запутанных бран (Entangled Branes)
 *
 * Если несколько бран имеют одинаковые значения полей, эти поля выносятся
 * в разделяемый блок (entangled brane), на который ссылаются все браны.
 * Это оптимизирует использование памяти для идентичных данных.
 *
 * @example
 * ```ts
 * const manager = new BraneManager(device)
 * manager.registerField('hp', FieldType.F32)
 * const id = manager.createBrane({ hp: 100 })
 * manager.updateBraneField(id, 'hp', 50)
 * ```
 */

import { FieldRegistry, FieldType, type FieldTypeValue } from "./FieldRegistry"
import { HeapAllocator } from "./HeapAllocator"
import { BraneBuilder, BlockUtils } from "./BraneBuilder"
import { getStringAtlas } from "../typeBridge"

export interface BraneInfo {
  braneId: number
  blockPtr: number
  blockSize: number
  extraAllocs: { offset: number; size: number }[]
  sharedPtrs: number[]
}

export interface EntangledBraneInfo {
  id: number
  blockPtr: number
  blockSize: number
  extraAllocs: { offset: number; size: number }[]
}

export interface BraneManagerConfig {
  /** Размер кучи в u32 словах. По умолчанию 16384. */
  heapSize?: number
  /** Количество зарезервированных слов в начале кучи. По умолчанию 1. */
  reserveFirst?: number
}

export class BraneManager {
  private readonly registry: FieldRegistry
  private readonly allocator: HeapAllocator
  private readonly builder: BraneBuilder
  private branes: Map<number, BraneInfo> = new Map()
  private entangledBranes: Map<number, EntangledBraneInfo> = new Map()
  private nextBraneId: number = 0
  private nextEntangledId: number = 0
  private heapData: Uint32Array
  private heapDirty: boolean = false

  constructor(
    public readonly device: GPUDevice,
    config: BraneManagerConfig = {},
  ) {
    const heapSize = config.heapSize ?? 16384
    const reserveFirst = config.reserveFirst ?? 1
    this.registry = FieldRegistry.getInstance()
    this.allocator = new HeapAllocator(heapSize, reserveFirst)
    this.builder = new BraneBuilder(this.registry, this.allocator)
    this.heapData = new Uint32Array(heapSize)
    this.heapData[0] = 0
  }

  registerField(
    name: string,
    type: FieldTypeValue,
    options: { elementType?: string; enumValues?: any[] } = {},
  ): number {
    return this.registry.register(name, type, options)
  }

  createEntangledBrane(brane: Record<string, unknown>): number {
    const result = this.builder.build(brane, { sharedPtrs: [] })
    const entangledId = this.nextEntangledId++
    this.heapData.set(result.blockView, result.blockPtr)
    for (const alloc of result.extraAllocs) {
      if (alloc.data) {
        this.heapData.set(alloc.data, alloc.offset)
      }
    }
    const entangledInfo: EntangledBraneInfo = {
      id: entangledId,
      blockPtr: result.blockPtr,
      blockSize: result.blockSize,
      extraAllocs: result.extraAllocs.map(({ offset, size }) => ({ offset, size })),
    }
    this.entangledBranes.set(entangledId, entangledInfo)
    this.heapDirty = true
    return entangledId
  }

  createBrane(brane: Record<string, unknown>, entangledBraneIds: number[] = []): number {
    const sharedPtrs = entangledBraneIds.map((id) => {
      const entangled = this.entangledBranes.get(id)
      if (!entangled) {
        throw new Error(`Entangled brane with ID ${id} not found`)
      }
      return entangled.blockPtr
    })
    const result = this.builder.build(brane, { sharedPtrs })
    this.heapData.set(result.blockView, result.blockPtr)
    for (const alloc of result.extraAllocs) {
      if (alloc.data) {
        this.heapData.set(alloc.data, alloc.offset)
      }
    }
    const braneId = this.nextBraneId++
    const braneInfo: BraneInfo = {
      braneId,
      blockPtr: result.blockPtr,
      blockSize: result.blockSize,
      extraAllocs: result.extraAllocs.map(({ offset, size }) => ({ offset, size })),
      sharedPtrs,
    }
    this.branes.set(braneId, braneInfo)
    this.heapDirty = true
    return braneId
  }

  createEnsemble(branes: Array<Record<string, unknown>>): number[] {
    const componentUsage = new Map<string, Set<number>>()
    branes.forEach((brane, idx) => {
      Object.keys(brane).forEach((component) => {
        if (!componentUsage.has(component)) componentUsage.set(component, new Set())
        componentUsage.get(component)!.add(idx)
      })
    })
    const valueEquals = (left: unknown, right: unknown): boolean => {
      if (Array.isArray(left) && Array.isArray(right)) {
        if (left.length !== right.length) return false
        return left.every((value, idx) => Object.is(value, right[idx]))
      }
      return Object.is(left, right)
    }
    const entangledGroups = new Map<string, Set<string>>()
    componentUsage.forEach((braneIndicesSet, component) => {
      if (braneIndicesSet.size < 2) return
      const key = Array.from(braneIndicesSet).sort().join(",")
      const ids = Array.from(braneIndicesSet)
      const firstValue = branes[ids[0]!]?.[component]
      const allSame = ids.every((idx) => valueEquals(branes[idx]![component], firstValue))
      if (!allSame) return
      if (!entangledGroups.has(key)) {
        entangledGroups.set(key, new Set())
      }
      entangledGroups.get(key)!.add(component)
    })
    const entangledBraneIds = new Map<string, number>()
    entangledGroups.forEach((components, key) => {
      const braneIndices = key.split(",").map((value) => Number(value))
      const firstBraneIdx = braneIndices[0]!
      const braneData = branes[firstBraneIdx] as Record<string, unknown>
      const brane = Object.fromEntries(Array.from(components).map((comp) => [comp, braneData[comp]]))
      const entangledId = this.createEntangledBrane(brane)
      entangledBraneIds.set(key, entangledId)
    })
    const braneIds: number[] = []
    branes.forEach((brane, idx) => {
      const entangledIds: number[] = []
      const usedGroupKeys = new Set<string>()
      const localBrane: Record<string, unknown> = { ...brane }
      Object.keys(brane).forEach((component) => {
        const ids = componentUsage.get(component)!
        if (ids.size < 2) return
        const key = Array.from(ids).sort().join(",")
        if (!entangledBraneIds.has(key)) return
        delete localBrane[component]
        if (!usedGroupKeys.has(key)) {
          entangledIds.push(entangledBraneIds.get(key)!)
          usedGroupKeys.add(key)
        }
      })
      const braneId = this.createBrane(localBrane, entangledIds)
      braneIds.push(braneId)
    })
    return braneIds
  }

  updateBraneField(braneId: number, fieldName: string, newValue: unknown): void {
    const brane = this.branes.get(braneId)
    if (!brane) {
      throw new Error(`Brane with ID ${braneId} not found`)
    }
    const fieldMeta = this.registry.getMeta(fieldName)
    if (!fieldMeta) {
      throw new Error(`Field '${fieldName}' not registered`)
    }
    const block = this.heapData.slice(brane.blockPtr, brane.blockPtr + brane.blockSize)
    const fieldInfo = BlockUtils.findField(block, fieldMeta.fieldId)
    if (!fieldInfo) {
      throw new Error(`Field '${fieldName}' not found in brane block`)
    }
    const absoluteOffset = brane.blockPtr + fieldInfo.meta.offset
    switch (fieldMeta.type) {
      case FieldType.F32: {
        const view = new DataView(this.heapData.buffer)
        view.setFloat32(absoluteOffset * 4, Number(newValue), true)
        break
      }
      case FieldType.U32:
        if (Array.isArray(fieldMeta.enumValues)) {
          const enumIndex = fieldMeta.enumValues.indexOf(newValue)
          if (enumIndex === -1) {
            throw new Error(
              `Value '${String(newValue)}' not found in enum '${fieldName}': [${fieldMeta.enumValues.join(", ")}]`,
            )
          }
          this.heapData[absoluteOffset] = enumIndex
        } else {
          this.heapData[absoluteOffset] = Number(newValue)
        }
        break
      case FieldType.BOOL:
        this.heapData[absoluteOffset] = Number(newValue)
        break
      case FieldType.STRING_PTR: {
        const atlas = getStringAtlas()
        const str = String(newValue)
        const stringId = atlas.intern(str)
        const meta = atlas.getMeta(stringId)
        if (!meta) {
          throw new Error(`Failed to get metadata for string: ${str}`)
        }
        this.heapData[absoluteOffset] = stringId
        this.heapData[absoluteOffset + 1] = meta.hash
        break
      }
      case FieldType.ARRAY_PTR: {
        const oldOffset = this.heapData[absoluteOffset]!
        const oldLength = this.heapData[absoluteOffset + 1]!
        if (oldOffset > 0) {
          const oldWordCount = oldLength + 1
          this.allocator.free(oldOffset, oldWordCount)
          const idx = brane.extraAllocs.findIndex((a) => a.offset === oldOffset)
          if (idx >= 0) {
            brane.extraAllocs.splice(idx, 1)
          }
        }
        if (!Array.isArray(newValue)) {
          throw new Error(`Expected array for field '${fieldName}'`)
        }
        const meta = this.registry.getMeta(fieldName)
        const elementType = meta?.elementType
        const values = newValue as unknown[]
        const newWordCount = values.length + 1
        const newBlock = this.allocator.alloc(newWordCount)
        if (!newBlock) {
          throw new Error(`Not enough memory for array`)
        }
        const arrayView = new Uint32Array(newBlock.size)
        arrayView[0] = values.length
        for (let i = 0; i < values.length; i++) {
          const item = values[i]
          if (elementType === "float" || elementType === "number") {
            const buf = new Float32Array([Number(item)])
            arrayView[i + 1] = new Uint32Array(buf.buffer)[0]!
          } else if (elementType === "integer" || elementType === "boolean") {
            arrayView[i + 1] = Number(item)
          } else if (elementType === "string") {
            const atlas = getStringAtlas()
            const stringId = atlas.intern(String(item))
            arrayView[i + 1] = stringId
          } else {
            arrayView[i + 1] = Number(item)
          }
        }
        this.heapData.set(arrayView, newBlock.offset)
        brane.extraAllocs.push({ offset: newBlock.offset, size: newBlock.size })
        this.heapData[absoluteOffset] = newBlock.offset
        this.heapData[absoluteOffset + 1] = values.length
        break
      }
      default:
        throw new Error(`Unsupported field type: ${fieldMeta.type}`)
    }
    this.heapDirty = true
  }

  deleteBrane(braneId: number): void {
    const brane = this.branes.get(braneId)
    if (!brane) {
      throw new Error(`Brane with ID ${braneId} not found`)
    }
    for (const alloc of brane.extraAllocs) {
      this.allocator.free(alloc.offset, alloc.size)
    }
    this.allocator.free(brane.blockPtr, brane.blockSize)
    this.branes.delete(braneId)
    this.heapDirty = true
  }

  deleteEntangledBrane(entangledId: number): void {
    const entangled = this.entangledBranes.get(entangledId)
    if (!entangled) {
      throw new Error(`Entangled brane with ID ${entangledId} not found`)
    }
    for (const alloc of entangled.extraAllocs) {
      this.allocator.free(alloc.offset, alloc.size)
    }
    this.allocator.free(entangled.blockPtr, entangled.blockSize)
    this.entangledBranes.delete(entangledId)
    this.heapDirty = true
  }

  getBraneBlockPtr(braneId: number): number {
    const brane = this.branes.get(braneId)
    if (!brane) {
      throw new Error(`Brane with ID ${braneId} not found`)
    }
    return brane.blockPtr
  }

  getEntangledBlockPtr(entangledId: number): number {
    const entangled = this.entangledBranes.get(entangledId)
    if (!entangled) {
      throw new Error(`Entangled brane with ID ${entangledId} not found`)
    }
    return entangled.blockPtr
  }

  getGPUBuffers(): { braneDescriptors: Uint32Array; heap: Uint32Array } {
    const braneCount = this.branes.size
    const braneDescriptors = new Uint32Array(braneCount)
    let idx = 0
    for (const [, brane] of this.branes) {
      braneDescriptors[idx++] = brane.blockPtr
    }
    return {
      braneDescriptors,
      heap: this.heapData,
    }
  }

  isHeapDirty(): boolean {
    return this.heapDirty
  }

  clearDirtyFlag(): void {
    this.heapDirty = false
  }

  getBraneInfo(braneId: number): BraneInfo | undefined {
    return this.branes.get(braneId)
  }

  getEnsemble(): BraneInfo[] {
    return Array.from(this.branes.values())
  }
}
