/**
 * Менеджер бран: аллокация памяти, обновление полей, управление жизненным циклом.
 *
 * Использует архитектуру самоописываемых блоков: каждый блок содержит заголовок
 * с метаданными полей, что позволяет шейдеру динамически определять структуру данных.
 *
 * ## Поддержка запутанных бран (Entangled Branes)
 *
 * Если нескольких бран имеют одинаковые значения полей, эти поля выносятся
 * в разделяемый блок (entangled brane), на который ссылаются все браны.
 * Это оптимизирует использование памяти для идентичных данных.
 *
 * ## Архитектура
 *
 * BraneManager работает только с индексами полей (не именами).
 * Поля передаются явно через {@link createEnsemble} и хранятся локально.
 *
 * @example
 * ```ts
 * const manager = new BraneManager(device)
 * const fields: FieldTuple[] = [[0, { type: FieldType.F32 }]]
 * const braneIds = manager.createEnsemble([[[0, 100]]], fields)
 * manager.updateBraneField(braneIds[0], 0, 50)
 * ```
 */

import { FieldType, type FieldTypeValue, type Field } from "../index.t"
import { HeapAllocator } from "../memory/HeapAllocator"
import { BraneBuilder, BlockUtils } from "../memory/BraneBuilder"
import { getStringAtlas } from "../strings/StringAtlas"
import type { FieldTuple, ValueTuple } from "../index.t"

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
  /** Включить debug-логирование. */
  debug?: boolean
}

export class BraneManager {
  private fields: Map<number, Field> = new Map()
  private readonly allocator: HeapAllocator
  private readonly builder: BraneBuilder
  private branes: Map<number, BraneInfo> = new Map()
  private entangledBranes: Map<number, EntangledBraneInfo> = new Map()
  private nextBraneId: number = 0
  private nextEntangledId: number = 0
  private heapData: Uint32Array
  private heapDirty: boolean = false
  private debug: boolean = false

  constructor(
    public readonly device: GPUDevice,
    config: BraneManagerConfig = {},
  ) {
    const heapSize = config.heapSize ?? 16384
    const reserveFirst = config.reserveFirst ?? 1
    this.debug = config.debug ?? false
    this.allocator = new HeapAllocator(heapSize, reserveFirst)
    this.builder = new BraneBuilder(this.debug)
    this.heapData = new Uint32Array(heapSize)
    this.heapData[0] = 0
  }

  /**
   * Создает ансамбль бран.
   *
   * @param params - Массив параметров бран в формате кортежей.
   * @param fields - Поля в формате кортежей [[index, field], ...].
   * @returns Массив ID созданных бран.
   */
  createEnsemble(params: ValueTuple[][], fields: FieldTuple[]): number[] {
    this.fields.clear()
    for (const [fieldId, field] of fields) {
      this.fields.set(fieldId, field)
    }

    if (this.debug) {
      console.log('[BraneManager] Creating ensemble with', params.length, 'branes')
    }

    const componentUsage = new Map<number, Set<number>>()
    params.forEach((braneParams, idx) => {
      braneParams.forEach(([fieldId]) => {
        if (!componentUsage.has(fieldId)) componentUsage.set(fieldId, new Set())
        componentUsage.get(fieldId)!.add(idx)
      })
    })

    const valueEquals = (left: unknown, right: unknown): boolean => {
      if (Array.isArray(left) && Array.isArray(right)) {
        if (left.length !== right.length) return false
        return left.every((value, idx) => Object.is(value, right[idx]))
      }
      return Object.is(left, right)
    }

    const entangledGroups = new Map<string, Set<number>>()
    componentUsage.forEach((braneIndicesSet: Set<number>, fieldId: number) => {
      if (braneIndicesSet.size < 2) return
      const key = Array.from(braneIndicesSet).sort().join(",")
      const ids = Array.from(braneIndicesSet)
      const brane0Params = params[ids[0]!]!
      let firstValue: unknown = undefined
      for (let i = 0; i < brane0Params.length; i++) {
        if (brane0Params[i]![0] === fieldId) {
          firstValue = brane0Params[i]![1]
          break
        }
      }
      if (firstValue === undefined) return
      let allSame = true
      for (let i = 1; i < ids.length && allSame; i++) {
        const braneParams = params[ids[i]!]!
        let found = false
        for (let j = 0; j < braneParams.length; j++) {
          if (braneParams[j]![0] === fieldId) {
            if (!valueEquals(braneParams[j]![1], firstValue)) {
              allSame = false
            }
            found = true
            break
          }
        }
        if (!found) allSame = false
      }
      if (!allSame) return
      if (!entangledGroups.has(key)) {
        entangledGroups.set(key, new Set())
      }
      entangledGroups.get(key)!.add(fieldId)
    })

    if (this.debug) {
      console.log('[BraneManager] Found', entangledGroups.size, 'entangled groups')
    }

    const entangledBraneIds = new Map<string, number>()
    entangledGroups.forEach((fieldIds, key) => {
      const braneIndices = key.split(",").map((value) => Number(value))
      const firstBraneIdx = braneIndices[0]!
      const braneParams = params[firstBraneIdx]!
      const filteredParams = braneParams.filter(([fid]) => fieldIds.has(fid))
      const entangledId = this.createEntangledBrane(filteredParams)
      entangledBraneIds.set(key, entangledId)
    })

    const braneIds: number[] = []
    params.forEach((braneParams, idx) => {
      const entangledIds: number[] = []
      const usedGroupKeys = new Set<string>()
      const localBrane: ValueTuple[] = []

      braneParams.forEach(([fieldId, value]) => {
        const ids = componentUsage.get(fieldId)!
        if (ids.size < 2) {
          localBrane.push([fieldId, value])
          return
        }
        const key = Array.from(ids).sort().join(",")
        if (!entangledBraneIds.has(key)) {
          localBrane.push([fieldId, value])
          return
        }
        if (!usedGroupKeys.has(key)) {
          entangledIds.push(entangledBraneIds.get(key)!)
          usedGroupKeys.add(key)
        }
      })

      const braneId = this.createBrane(localBrane, entangledIds)
      braneIds.push(braneId)
    })

    if (this.debug) {
      console.log('[BraneManager] Ensemble created with brane IDs:', braneIds)
    }

    return braneIds
  }

  createEntangledBrane(params: ValueTuple[]): number {
    if (this.debug) {
      console.log('[BraneManager] Creating entangled brane with fields:', params.map(([fid]) => fid))
    }
    const result = this.builder.build(params, this.fields, { sharedPtrs: [] })
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
    if (this.debug) {
      console.log(`[BraneManager] Entangled brane created: id=${entangledId}, blockPtr=${result.blockPtr}`)
    }
    return entangledId
  }

  createBrane(params: ValueTuple[], entangledBraneIds: number[] = []): number {
    if (this.debug) {
      console.log('[BraneManager] Creating brane with fields:', params.map(([fid]) => fid), 'entangledIds:', entangledBraneIds)
    }
    const sharedPtrs = entangledBraneIds.map((id) => {
      const entangled = this.entangledBranes.get(id)
      if (!entangled) {
        throw new Error(`Entangled brane with ID ${id} not found`)
      }
      return entangled.blockPtr
    })
    const result = this.builder.build(params, this.fields, { sharedPtrs })
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
    if (this.debug) {
      console.log(`[BraneManager] Brane created: id=${braneId}, blockPtr=${result.blockPtr}`)
    }
    return braneId
  }

  updateBraneField(braneId: number, fieldId: number, newValue: unknown): void {
    const brane = this.branes.get(braneId)
    if (!brane) {
      throw new Error(`Brane with ID ${braneId} not found`)
    }
    const field = this.fields.get(fieldId)
    if (!field) {
      throw new Error(`Field with ID ${fieldId} not found`)
    }
    const block = this.heapData.slice(brane.blockPtr, brane.blockPtr + brane.blockSize)
    const fieldInfo = BlockUtils.findField(block, fieldId)
    if (!fieldInfo) {
      throw new Error(`Field with ID ${fieldId} not found in brane block`)
    }
    const absoluteOffset = brane.blockPtr + fieldInfo.meta.offset
    switch (field.type) {
      case FieldType.F32: {
        const view = new DataView(this.heapData.buffer)
        view.setFloat32(absoluteOffset * 4, Number(newValue), true)
        break
      }
      case FieldType.U32:
        if (Array.isArray(field.enumValues)) {
          const enumIndex = field.enumValues.indexOf(newValue)
          if (enumIndex === -1) {
            throw new Error(
              `Value '${String(newValue)}' not found in enum '${fieldId}': [${field.enumValues.join(", ")}]`,
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
          throw new Error(`Expected array for field '${fieldId}'`)
        }
        const elementType = field.elementType
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
        throw new Error(`Unsupported field type: ${field.type}`)
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

  /**
   * Очищает все данные бран и сбрасывает состояние менеджера.
   *
   * @remarks
   * **Side Effects:**
   * - Очищает карты бран и запутанных бран.
   * - Сбрасывает счетчики ID.
   * - Очищает heap (заполняет нулями).
   * - Сбрасывает аллокатор.
   */
  clear(): void {
    this.fields.clear()
    this.branes.clear()
    this.entangledBranes.clear()
    this.nextBraneId = 0
    this.nextEntangledId = 0
    this.heapData.fill(0)
    this.allocator.clear()
    this.heapDirty = false
  }

  getBraneInfo(braneId: number): BraneInfo | undefined {
    return this.branes.get(braneId)
  }

  getEnsemble(): BraneInfo[] {
    return Array.from(this.branes.values())
  }
}
