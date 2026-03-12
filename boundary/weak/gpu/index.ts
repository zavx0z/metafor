import shaderSource from "./evolution.wgsl" with { type: "text" }
import type { BoundaryStore } from "../../store.t"
import { FIELD_TYPE, VALUE_TYPE } from "../constants"
import { deriveWeakData } from "./derived"
import { findFieldValueOffset } from "./layout-heap"
import type { WeakChanges, WeakHeapUpdate, WeakRuntime } from "../runtime.t"
import { createPackContext, encodeValue } from "./pack"
import type { GpuRuntimeContext } from "./index.t.ts"
import { createStorageBuffer, createStorageBufferWithCapacity, destroyBuffers, nextCapacityWords } from "./buffer"
import { createGpuRuntimeContext } from "./init"
import { resolveStringTableBuffers } from "./layout"
import { createBindGroup } from "./pipeline"
import { readGpuChanges } from "./read"
import { runGpuStep } from "./step"
import type { ArrayHeapSlot } from "./heap"
import { createInitialArrayHeapIndex, updateGpuHeapFields } from "./heap"
import { createStringAtlasAppendExport } from "./string-pack"

let gpuOperationQueue: Promise<void> = Promise.resolve()

function enqueueGpuOperation<T>(task: () => Promise<T> | T): Promise<T> {
  const scheduled = gpuOperationQueue.then(() => task())
  gpuOperationQueue = scheduled.then(
    () => undefined,
    () => undefined,
  )
  return scheduled
}

function destroyContext(context: GpuRuntimeContext): void {
  destroyBuffers([
    context.buffers.braneBlockPtrs,
    context.buffers.heap,
    context.buffers.states,
    context.buffers.dirtyFlags,
    context.buffers.bytecode,
    context.buffers.bytecodeOffsets,
    context.buffers.uniforms,
    context.buffers.stringRegistry,
    context.buffers.stringHeap,
    context.stagingBuffer,
  ])
}

/**
 * GPU runtime для Weak.
 *
 * Каноническая истина остаётся в Boundary store, а этот runtime держит только
 * производные буферы и их CPU-side mirror для частичной синхронизации.
 */
export class GPUWeakRuntime implements WeakRuntime {
  private context: GpuRuntimeContext
  private readonly store$: BoundaryStore
  private lastStates: number[]
  private pending: Promise<unknown> = Promise.resolve()

  private constructor(context: GpuRuntimeContext, store$: BoundaryStore) {
    this.context = context
    this.store$ = store$
    this.lastStates = [...store$.states]
  }

  static async create(device: GPUDevice, store$: BoundaryStore): Promise<GPUWeakRuntime> {
    const context = createGpuRuntimeContext(device, shaderSource, store$, false)
    return new GPUWeakRuntime(context, store$)
  }

  step(): void {
    void this.enqueue(() =>
      runGpuStep(
        this.context.device,
        this.context.pipeline,
        this.context.bindGroup,
        this.context.buffers.dirtyFlags,
        this.context.buffers.states,
      ),
    )
  }

  async readChanges(): Promise<WeakChanges> {
    return await this.enqueue(async () => {
      const result = await readGpuChanges(
        this.context.device,
        this.context.buffers.dirtyFlags,
        this.context.buffers.states,
        this.context.stagingBuffer,
        this.context.braneCount,
      )
      this.lastStates = result.states
      return result.changes
    })
  }

  statesSnapshot(): number[] {
    return [...this.lastStates]
  }

  /**
   * Синхронизирует канонические изменения с GPU без полной пересборки контекста.
   *
   * Если текущий derived layout больше не подходит, обновляет только затронутые
   * производные буферы.
   */
  heapUpdate(updates: WeakHeapUpdate[]): void {
    void this.enqueue(() => {
      if (updates.length === 0) {
        return
      }

      const stringTableChanged = this.store$.stringTable.length !== this.context.stringTableSize
      if (stringTableChanged) {
        this.syncStringBuffers()
      }

      if (!this.tryApplyHeapUpdates(updates)) {
        this.refreshHeapBuffers()
      }
    })
  }

  clear(): void {
    this.lastStates = []
    void this.enqueue(() => destroyContext(this.context))
  }

  private enqueue<T>(task: () => Promise<T> | T): Promise<T> {
    const scheduled = this.pending.then(() => enqueueGpuOperation(task))
    this.pending = scheduled.then(
      () => undefined,
      () => undefined,
    )
    return scheduled
  }

  private syncStringBuffers(): void {
    if (this.tryAppendStringBuffers()) {
      return
    }

    this.refreshStringBuffers()
  }

  private refreshStringBuffers(): void {
    const atlas = resolveStringTableBuffers(this.store$.stringTable)
    const nextStringRegistryWords = atlas.registry.length > 0 ? atlas.registry.length : 1
    const nextStringHeapWords = atlas.heap.length > 0 ? atlas.heap.length : 1
    const nextStringRegistryCapacityWords = nextCapacityWords(nextStringRegistryWords)
    const nextStringHeapCapacityWords = nextCapacityWords(nextStringHeapWords)
    const nextStringRegistry = createStorageBufferWithCapacity(
      this.context.device,
      atlas.registry.length > 0 ? atlas.registry : new Uint32Array(1),
      nextStringRegistryCapacityWords,
    )
    const nextStringHeap = createStorageBufferWithCapacity(
      this.context.device,
      atlas.heap.length > 0 ? atlas.heap : new Uint32Array(1),
      nextStringHeapCapacityWords,
    )
    const previousStringRegistry = this.context.buffers.stringRegistry
    const previousStringHeap = this.context.buffers.stringHeap

    this.context.buffers.stringRegistry = nextStringRegistry
    this.context.buffers.stringHeap = nextStringHeap
    this.context.bindGroup = createBindGroup(this.context.device, this.context.pipeline, this.context.buffers)
    this.context.stringTableSize = this.store$.stringTable.length
    this.context.stringRegistryWords = nextStringRegistryWords
    this.context.stringRegistryCapacityWords = nextStringRegistryCapacityWords
    this.context.stringHeapWords = nextStringHeapWords
    this.context.stringHeapCapacityWords = nextStringHeapCapacityWords
    this.context.stringTableSnapshot = [...this.store$.stringTable]

    destroyBuffers([previousStringRegistry, previousStringHeap])
  }

  private tryAppendStringBuffers(): boolean {
    const previousTable = this.context.stringTableSnapshot
    const nextTable = this.store$.stringTable

    if (nextTable.length < previousTable.length) {
      return false
    }

    for (let index = 0; index < previousTable.length; index++) {
      if (nextTable[index] !== previousTable[index]) {
        return false
      }
    }

    const appended = createStringAtlasAppendExport(nextTable, previousTable.length, this.context.stringHeapWords)
    if (appended.count === 0) {
      this.context.stringTableSize = nextTable.length
      this.context.stringTableSnapshot = [...nextTable]
      return true
    }

    const canGrowRegistryInPlace =
      this.context.stringRegistryWords + appended.registry.length <= this.context.stringRegistryCapacityWords
    const canGrowHeapInPlace =
      this.context.stringHeapWords + appended.heap.length <= this.context.stringHeapCapacityWords
    if (canGrowRegistryInPlace && canGrowHeapInPlace) {
      if (appended.registry.length > 0) {
        this.context.device.queue.writeBuffer(
          this.context.buffers.stringRegistry,
          this.context.stringRegistryWords * 4,
          appended.registry.buffer,
          appended.registry.byteOffset,
          appended.registry.byteLength,
        )
      }
      if (appended.heap.length > 0) {
        this.context.device.queue.writeBuffer(
          this.context.buffers.stringHeap,
          this.context.stringHeapWords * 4,
          appended.heap.buffer,
          appended.heap.byteOffset,
          appended.heap.byteLength,
        )
      }

      this.context.stringTableSize = nextTable.length
      this.context.stringRegistryWords += appended.registry.length
      this.context.stringHeapWords += appended.heap.length
      this.context.stringTableSnapshot = [...nextTable]
      return true
    }

    const previousStringRegistry = this.context.buffers.stringRegistry
    const previousStringHeap = this.context.buffers.stringHeap
    const nextStringRegistryWords = this.context.stringRegistryWords + appended.registry.length
    const nextStringHeapWords = this.context.stringHeapWords + appended.heap.length
    const nextStringRegistryCapacityWords = nextCapacityWords(nextStringRegistryWords)
    const nextStringHeapCapacityWords = nextCapacityWords(nextStringHeapWords)
    const nextStringRegistry = this.context.device.createBuffer({
      size: nextStringRegistryCapacityWords * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    })
    const nextStringHeap = this.context.device.createBuffer({
      size: nextStringHeapCapacityWords * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    })

    const command = this.context.device.createCommandEncoder()
    if (this.context.stringRegistryWords > 0) {
      command.copyBufferToBuffer(previousStringRegistry, 0, nextStringRegistry, 0, this.context.stringRegistryWords * 4)
    }
    if (this.context.stringHeapWords > 0) {
      command.copyBufferToBuffer(previousStringHeap, 0, nextStringHeap, 0, this.context.stringHeapWords * 4)
    }
    this.context.device.queue.submit([command.finish()])

    if (appended.registry.length > 0) {
      this.context.device.queue.writeBuffer(
        nextStringRegistry,
        this.context.stringRegistryWords * 4,
        appended.registry.buffer,
        appended.registry.byteOffset,
        appended.registry.byteLength,
      )
    }
    if (appended.heap.length > 0) {
      this.context.device.queue.writeBuffer(
        nextStringHeap,
        this.context.stringHeapWords * 4,
        appended.heap.buffer,
        appended.heap.byteOffset,
        appended.heap.byteLength,
      )
    }

    this.context.buffers.stringRegistry = nextStringRegistry
    this.context.buffers.stringHeap = nextStringHeap
    this.context.bindGroup = createBindGroup(this.context.device, this.context.pipeline, this.context.buffers)
    this.context.stringTableSize = nextTable.length
    this.context.stringRegistryWords = nextStringRegistryWords
    this.context.stringRegistryCapacityWords = nextStringRegistryCapacityWords
    this.context.stringHeapWords = nextStringHeapWords
    this.context.stringHeapCapacityWords = nextStringHeapCapacityWords
    this.context.stringTableSnapshot = [...nextTable]

    destroyBuffers([previousStringRegistry, previousStringHeap])
    return true
  }

  private refreshHeapBuffers(): void {
    const nextDerived = deriveWeakData(this.store$)
    const nextBraneBlockPtrs = createStorageBuffer(this.context.device, Uint32Array.from(nextDerived.blockPtrs))
    const nextHeapWords = nextDerived.heap.length > 0 ? nextDerived.heap.length : 1
    const nextHeapCapacityWords = nextCapacityWords(nextHeapWords)
    const nextHeap = createStorageBufferWithCapacity(
      this.context.device,
      nextDerived.heap.length > 0 ? nextDerived.heap : new Uint32Array(1),
      nextHeapCapacityWords,
    )
    const previousBraneBlockPtrs = this.context.buffers.braneBlockPtrs
    const previousHeap = this.context.buffers.heap

    this.context.buffers.braneBlockPtrs = nextBraneBlockPtrs
    this.context.buffers.heap = nextHeap
    this.context.bindGroup = createBindGroup(this.context.device, this.context.pipeline, this.context.buffers)
    const nextHeapMirror = new Uint32Array(nextHeapCapacityWords)
    nextHeapMirror.set(nextDerived.heap)
    this.context.heapMirror = nextHeapMirror
    this.context.heapWords = nextHeapWords
    this.context.heapCapacityWords = nextHeapCapacityWords
    this.context.braneBlockPtrs = nextDerived.blockPtrs
    this.context.sharedBlockPtrs = nextDerived.sharedBlockPtrs
    this.context.arraySlots = createInitialArrayHeapIndex(
      nextDerived.heap,
      nextDerived.blockPtrs,
      nextDerived.sharedBlockPtrs,
      this.store$.fields,
    )
    this.context.arrayFreeList = []
    this.context.stringTableSize = this.store$.stringTable.length

    destroyBuffers([previousBraneBlockPtrs, previousHeap])
  }

  private tryApplyHeapUpdates(updates: WeakHeapUpdate[]): boolean {
    const writes: Array<{ offset: number; value1: number; value2?: number }> = []
    let heapMirror = this.context.heapMirror

    for (const update of updates) {
      if (update.kind === "lock") {
        const blockPtr = this.context.braneBlockPtrs[update.braneIndex]
        if (blockPtr === undefined) {
          return false
        }
        writes.push({ offset: blockPtr + 2, value1: update.value ? 1 : 0 })
        heapMirror[blockPtr + 2] = update.value ? 1 : 0
        continue
      }

      const nextResult = this.resolveFieldWrites(update.braneIndex, update.fieldIndex, heapMirror)
      if (!nextResult) {
        return false
      }

      if (nextResult.heapMirror && nextResult.heapMirror !== heapMirror) {
        heapMirror = nextResult.heapMirror
        this.replaceHeapBuffer(heapMirror)
      }

      for (const write of nextResult.writes) {
        writes.push(write)
      }
    }

    this.context.heapMirror = heapMirror
    updateGpuHeapFields(this.context.device, this.context.buffers.heap, writes)
    return true
  }

  private resolveFieldWrites(
    braneIndex: number,
    fieldIndex: number,
    heapMirror: Uint32Array,
  ): { writes: Array<{ offset: number; value1: number; value2?: number }>; heapMirror?: Uint32Array } | null {
    const location = this.store$.getFieldLocation(braneIndex, fieldIndex)
    const field = this.store$.fields[fieldIndex]
    if (!location || !field) {
      return null
    }

    const blockPtr =
      location.scope === "local"
        ? this.context.braneBlockPtrs[braneIndex]
        : this.context.sharedBlockPtrs[location.blockIndex]
    if (blockPtr === undefined) {
      return null
    }

    const valueOffset = findFieldValueOffset(heapMirror, blockPtr, fieldIndex)
    if (valueOffset === null) {
      return null
    }

    if (field.type === FIELD_TYPE.ARRAY_PTR) {
      return this.resolveArrayWrites(heapMirror, valueOffset, fieldIndex, location.record.value)
    }

    const encoded = encodeValue(location.record.value, createPackContext(field, this.store$.stringTable))
    heapMirror[valueOffset] = encoded.value1

    if (field.type === FIELD_TYPE.STRING_PTR) {
      heapMirror[valueOffset + 1] = encoded.value2
      return { writes: [{ offset: valueOffset, value1: encoded.value1, value2: encoded.value2 }] }
    }

    return { writes: [{ offset: valueOffset, value1: encoded.value1 }] }
  }

  private resolveArrayWrites(
    heapMirror: Uint32Array,
    valueOffset: number,
    fieldIndex: number,
    value: BoundaryStore["braneValues"][number]["value"],
  ): { writes: Array<{ offset: number; value1: number; value2?: number }>; heapMirror?: Uint32Array } | null {
    if (!Array.isArray(value)) {
      return null
    }

    const currentPtr = heapMirror[valueOffset] ?? 0
    const currentSlot = this.context.arraySlots.get(valueOffset)
    if (value.length === 0) {
      if (currentSlot) {
        this.releaseArraySlot(currentSlot)
        this.context.arraySlots.delete(valueOffset)
      }
      heapMirror[valueOffset] = 0
      heapMirror[valueOffset + 1] = 0
      return { writes: [{ offset: valueOffset, value1: 0, value2: 0 }] }
    }

    const currentLength = currentPtr === 0 ? 0 : (heapMirror[currentPtr] ?? 0)
    if (currentLength !== value.length) {
      const field = this.store$.fields[fieldIndex]
      if (!field) {
        return null
      }

      const requiredSize = 1 + value.length
      let targetSlot = currentSlot
      if (targetSlot && targetSlot.size < requiredSize) {
        this.releaseArraySlot(targetSlot)
        this.context.arraySlots.delete(valueOffset)
        targetSlot = undefined
      }

      if (!targetSlot) {
        targetSlot = this.takeArraySlot(requiredSize)
      }

      let nextHeapMirror = heapMirror
      if (!targetSlot) {
        const allocation = this.allocateArrayTail(requiredSize, heapMirror)
        nextHeapMirror = allocation.heapMirror
        targetSlot = allocation.slot
      }

      if (currentSlot && targetSlot.ptr === currentSlot.ptr && currentSlot.size > requiredSize) {
        this.releaseArraySlot({ ptr: currentSlot.ptr + requiredSize, size: currentSlot.size - requiredSize })
      }

      nextHeapMirror[targetSlot.ptr] = value.length
      const arrayContext = createPackContext(field, this.store$.stringTable)
      value.forEach((item, index) => {
        nextHeapMirror[targetSlot.ptr + 1 + index] = encodeValue(
          item,
          {
            type: arrayContext.subType ?? VALUE_TYPE.FLOAT,
            stringTable: this.store$.stringTable,
          },
        ).value1
      })

      nextHeapMirror[valueOffset] = targetSlot.ptr
      nextHeapMirror[valueOffset + 1] = 0
      this.context.arraySlots.set(valueOffset, { ptr: targetSlot.ptr, size: requiredSize })
      return {
        heapMirror: nextHeapMirror,
        writes: [
          { offset: valueOffset, value1: targetSlot.ptr, value2: 0 },
          ...Array.from({ length: requiredSize }, (_, index) => ({
            offset: targetSlot!.ptr + index,
            value1: nextHeapMirror[targetSlot!.ptr + index]!,
          })),
        ],
      }
    }

    const field = this.store$.fields[fieldIndex]
    if (!field) {
      return null
    }

    const arrayContext = createPackContext(field, this.store$.stringTable)
    const encodedItems = value.map((item) =>
      encodeValue(
        item,
        {
          type: arrayContext.subType ?? VALUE_TYPE.FLOAT,
          stringTable: this.store$.stringTable,
        },
      ).value1,
    )

    const arrayWords = new Uint32Array(1 + encodedItems.length)
    arrayWords[0] = value.length
    encodedItems.forEach((item, index) => {
      arrayWords[index + 1] = item
      heapMirror[currentPtr + 1 + index] = item
    })

    heapMirror[currentPtr] = value.length
    heapMirror[valueOffset] = currentPtr
    heapMirror[valueOffset + 1] = 0
    this.context.arraySlots.set(valueOffset, { ptr: currentPtr, size: 1 + value.length })

    return {
      writes: [
        { offset: valueOffset, value1: currentPtr, value2: 0 },
        ...Array.from(arrayWords).map((word, index) => ({
          offset: currentPtr + index,
          value1: word,
        })),
      ],
    }
  }

  private replaceHeapBuffer(nextHeapMirror: Uint32Array): void {
    const nextHeapWords = nextHeapMirror.length > 0 ? nextHeapMirror.length : 1
    if (nextHeapWords <= this.context.heapCapacityWords) {
      this.context.device.queue.writeBuffer(this.context.buffers.heap, 0, nextHeapMirror.buffer, nextHeapMirror.byteOffset, nextHeapMirror.byteLength)
    this.context.heapWords = nextHeapWords
    return
    }

    const previousHeap = this.context.buffers.heap
    const nextHeapCapacityWords = nextCapacityWords(nextHeapWords)
    const nextHeap = createStorageBufferWithCapacity(
      this.context.device,
      nextHeapMirror.length > 0 ? nextHeapMirror : new Uint32Array(1),
      nextHeapCapacityWords,
    )

    this.context.buffers.heap = nextHeap
    this.context.bindGroup = createBindGroup(this.context.device, this.context.pipeline, this.context.buffers)
    this.context.heapWords = nextHeapWords
    this.context.heapCapacityWords = nextHeapCapacityWords

    destroyBuffers([previousHeap])
  }

  private allocateArrayTail(requiredSize: number, heapMirror: Uint32Array): { heapMirror: Uint32Array; slot: ArrayHeapSlot } {
    const previousHeapWords = this.context.heapWords
    const nextHeapWords = this.context.heapWords + requiredSize
    if (nextHeapWords <= heapMirror.length) {
      this.context.heapWords = nextHeapWords
      return {
        heapMirror,
        slot: { ptr: previousHeapWords, size: requiredSize },
      }
    }

    const expandedCapacityWords = nextCapacityWords(nextHeapWords)
    const nextHeapMirror = new Uint32Array(expandedCapacityWords)
    nextHeapMirror.set(heapMirror.subarray(0, this.context.heapWords))
    this.context.heapWords = nextHeapWords
    return {
      heapMirror: nextHeapMirror,
      slot: { ptr: previousHeapWords, size: requiredSize },
    }
  }

  private takeArraySlot(requiredSize: number): ArrayHeapSlot | undefined {
    let bestIndex = -1
    let bestSize = Number.POSITIVE_INFINITY

    for (let index = 0; index < this.context.arrayFreeList.length; index++) {
      const slot = this.context.arrayFreeList[index]!
      if (slot.size < requiredSize) {
        continue
      }
      if (slot.size < bestSize) {
        bestIndex = index
        bestSize = slot.size
      }
    }

    if (bestIndex === -1) {
      return undefined
    }

    const slot = this.context.arrayFreeList.splice(bestIndex, 1)[0]!
    if (slot.size > requiredSize) {
      this.releaseArraySlot({ ptr: slot.ptr + requiredSize, size: slot.size - requiredSize })
      return { ptr: slot.ptr, size: requiredSize }
    }
    return slot
  }

  private releaseArraySlot(slot: ArrayHeapSlot): void {
    if (slot.size <= 0) {
      return
    }

    let nextSlot = slot
    const freeList = [...this.context.arrayFreeList, nextSlot].sort((left, right) => left.ptr - right.ptr)
    const merged: ArrayHeapSlot[] = []
    for (const candidate of freeList) {
      const previous = merged[merged.length - 1]
      if (previous && previous.ptr + previous.size === candidate.ptr) {
        previous.size += candidate.size
      } else {
        merged.push({ ptr: candidate.ptr, size: candidate.size })
      }
    }
    this.context.arrayFreeList = merged
  }
}
