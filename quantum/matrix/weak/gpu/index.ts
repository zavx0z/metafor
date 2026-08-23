import shaderSource from "./evolution.wgsl" with { type: "text" }
import type { ArrayHeapSlot, GpuRuntimeContext } from "@metafor/types/matrix/gpu"
import type { MatrixFieldValueRecord, MatrixStore, MatrixValue } from "@metafor/types/matrix/store"
import type { WeakChanges, WeakHeapUpdate, WeakRuntime, WeakStepMode, WeakStructuralUpdate } from "@metafor/types/matrix/weak"
import { FIELD_TYPE, VALUE_TYPE } from "../constants"
import { braneHasPatternCondition, deriveWeakBraneBytecode, deriveWeakData } from "./derived"
import { findFieldValueOffset, packMeta } from "./layout-heap"
import { createPackContext, encodeValue, fieldTypeToBytecodeType } from "./pack"
import { createStorageBufferWithCapacity, destroyBuffers, nextCapacityWords } from "./buffer"
import { createGpuRuntimeContext } from "./init"
import { resolveStringTableBuffers } from "./layout"
import { createBindGroup } from "./pipeline"
import { readGpuChanges } from "./read"
import { runGpuStep } from "./step"
import { createInitialArrayHeapIndex, updateGpuHeapFields } from "./heap"
import { createStringAtlasAppendExport } from "./string-pack"
import { StepMode } from "../constants"
import {watchGpuDeviceLoss} from "../device"

let gpuOperationQueue: Promise<void> = Promise.resolve()

function enqueueSerializedGpuOperation<T>(task: () => Promise<T> | T): Promise<T> {
  const scheduled = gpuOperationQueue.then(() => task())
  gpuOperationQueue = scheduled.then(
    () => undefined,
    () => undefined,
  )
  return scheduled
}

const gpuErrorScopes: GPUErrorFilter[] = ["validation", "out-of-memory", "internal"]

const asError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error))

async function runCheckedGpuOperation<T>(
  device: GPUDevice,
  task: () => Promise<T> | T,
): Promise<T> {
  let pushedScopes = 0
  let result!: T
  let operationError: Error | null = null

  try {
    for (const scope of gpuErrorScopes) {
      device.pushErrorScope(scope)
      pushedScopes++
    }
    result = await task()
  } catch (error) {
    operationError = asError(error)
  }

  const scopedErrors: Array<{scope: GPUErrorFilter; error: GPUError}> = []
  for (let index = pushedScopes - 1; index >= 0; index--) {
    try {
      const error = await device.popErrorScope()
      if (error) scopedErrors.push({scope: gpuErrorScopes[index]!, error})
    } catch (error) {
      operationError ??= asError(error)
    }
  }

  if (operationError) throw operationError
  const scopedError = scopedErrors[0]
  if (scopedError) {
    throw new Error(`Ошибка WebGPU (${scopedError.scope}): ${scopedError.error.message}`)
  }
  return result
}

function enqueueGpuOperation<T>(
  device: GPUDevice,
  task: () => Promise<T> | T,
): Promise<T> {
  return enqueueSerializedGpuOperation(() => runCheckedGpuOperation(device, task))
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
 * Параллельный WebGPU-исполнитель Weak.
 *
 * Каноническая истина остаётся в Matrix Store. Экземпляр держит производные
 * буферы, последовательно ставит операции в очередь и проверяет каждую из них
 * через области ошибок WebGPU. Первая ошибка операции или потеря устройства
 * сохраняется в {@link fault}; все последующие границы чтения завершаются этой
 * ошибкой. Переход на CPU внутри уже начатой причинной трассы не выполняется.
 *
 * @see [Отложенная ошибка и ошибка проверки WebGPU](https://github.com/zavx0z/metafor/blob/main/matrix/weak/tests/weak.gpu.test.ts#L94-L130)
 * @see [Потеря устройства передаётся наблюдателю](https://github.com/zavx0z/metafor/blob/main/matrix/weak/device.spec.ts#L37-L55)
 * @see [F32, U32, BOOL, null, строки и массивы совпадают с CPU](https://github.com/zavx0z/metafor/blob/main/matrix/weak/tests/weak.conditions.test.ts)
 */
export class GPUWeakRuntime implements WeakRuntime {
  private context: GpuRuntimeContext
  private readonly store$: MatrixStore
  private lastStates: number[]
  private pending: Promise<void> = Promise.resolve()
  private faultError: Error | null = null
  private closed = false

  private constructor(context: GpuRuntimeContext, store$: MatrixStore) {
    this.context = context
    this.store$ = store$
    this.lastStates = [...store$.states]

    watchGpuDeviceLoss(context.device, (info, error) => {
      if (this.closed) return
      if (error) {
        this.recordFault(error)
        return
      }
      const details = [info?.reason, info?.message].filter(Boolean).join(": ")
      this.recordFault(new Error(`GPU-устройство потеряно${details ? `: ${details}` : ""}`))
    })
  }

  static async create(device: GPUDevice, store$: MatrixStore): Promise<GPUWeakRuntime> {
    const context = await enqueueGpuOperation(
      device,
      () => createGpuRuntimeContext(device, shaderSource, store$, false),
    )
    return new GPUWeakRuntime(context, store$)
  }

  step(mode: WeakStepMode = StepMode.Full): void {
    this.schedule(() =>
      runGpuStep(
        this.context.device,
        this.context.pipeline,
        this.context.bindGroup,
        this.context.buffers.dirtyFlags,
        this.context.buffers.states,
        this.context.buffers.uniforms,
        this.context.braneCount,
        mode,
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

  fault(): string | null {
    return this.faultError?.message ?? null
  }

  /**
   * Синхронизирует канонические изменения с GPU без полной пересборки контекста.
   *
   * Если текущий derived layout больше не подходит, обновляет только затронутые
   * производные буферы.
   */
  heapUpdate(updates: WeakHeapUpdate[]): void {
    this.schedule(() => {
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
      const patternBranes = new Set<number>()
      for (const update of updates) {
        if (
          update.kind === "field" &&
          braneHasPatternCondition(this.store$, update.braneIndex, update.fieldIndex)
        ) {
          patternBranes.add(update.braneIndex)
        }
      }
      for (const braneIndex of patternBranes) this.replaceBraneBytecode(braneIndex)
    })
  }

  structuralUpdate(update: WeakStructuralUpdate): void {
    this.schedule(() => {
      if (this.store$.stringTable.length !== this.context.stringTableSize) this.syncStringBuffers()
      this.ensureBraneCapacity(this.store$.branes.length)

      for (const sharedBlockIndex of new Set(update.sharedBlockIndexes)) {
        this.retireBlock(this.context.sharedBlockPtrs[sharedBlockIndex])
        const fields = this.collectSharedBlockFields(sharedBlockIndex)
        if (!fields) {
          delete this.context.sharedBlockPtrs[sharedBlockIndex]
          continue
        }
        this.context.sharedBlockPtrs[sharedBlockIndex] = this.appendCanonicalBlock(fields, [], false)
      }

      for (const braneIndex of new Set(update.braneIndexes)) {
        const brane = this.store$.branes[braneIndex]
        if (!brane) continue
        this.retireBlock(this.context.braneBlockPtrs[braneIndex])
        const refs: number[] = []
        for (let refIndex = brane.sharedBlockRefOffset; refIndex < brane.sharedBlockRefOffset + brane.sharedBlockRefCount; refIndex++) {
          const sharedBlockIndex = this.store$.braneSharedBlockRefs[refIndex]
          const ptr = sharedBlockIndex === undefined ? undefined : this.context.sharedBlockPtrs[sharedBlockIndex]
          if (ptr !== undefined) refs.push(ptr)
        }
        const ptr = this.appendCanonicalBlock(this.collectBraneFields(braneIndex), refs, brane.lock)
        this.context.braneBlockPtrs[braneIndex] = ptr
        this.context.device.queue.writeBuffer(
          this.context.buffers.braneBlockPtrs,
          braneIndex * 4,
          new Uint32Array([ptr]),
        )
        const state = this.store$.states[braneIndex] ?? 0
        this.lastStates[braneIndex] = state
        this.context.device.queue.writeBuffer(
          this.context.buffers.states,
          braneIndex * 4,
          Uint32Array.from([state]),
        )
        this.context.device.queue.writeBuffer(
          this.context.buffers.dirtyFlags,
          braneIndex * 4,
          new Uint32Array([0]),
        )
      }

      const bytecodeBranes = new Set(update.graphBraneIndexes)
      for (const braneIndex of update.braneIndexes) {
        if (braneHasPatternCondition(this.store$, braneIndex)) bytecodeBranes.add(braneIndex)
      }
      if (update.sharedBlockIndexes.length > 0) {
        for (let braneIndex = 0; braneIndex < this.store$.branes.length; braneIndex++) {
          if (braneHasPatternCondition(this.store$, braneIndex)) bytecodeBranes.add(braneIndex)
        }
      }
      for (const braneIndex of bytecodeBranes) {
        this.replaceBraneBytecode(braneIndex)
      }

      this.context.braneCount = this.store$.branes.length
      this.context.device.queue.writeBuffer(
        this.context.buffers.uniforms,
        0,
        new Uint32Array([this.context.braneCount]),
      )
      if (this.context.deadHeapWords > Math.max(1024, Math.floor(this.context.heapWords / 2))) {
        this.refreshHeapBuffers()
      }
      if (this.context.deadBytecodeWords > Math.max(1024, Math.floor(this.context.bytecodeWords / 2))) {
        this.refreshBytecodeBuffers()
      }
    })
  }

  clear(): void {
    if (this.closed) return
    this.closed = true
    this.lastStates = []
    const scheduled = this.pending.then(() =>
      enqueueSerializedGpuOperation(() => destroyContext(this.context)),
    )
    this.pending = scheduled.then(
      () => undefined,
      () => undefined,
    )
    void scheduled.catch(() => undefined)
  }

  private enqueue<T>(task: () => Promise<T> | T): Promise<T> {
    const scheduled = this.pending.then(() => this.execute(task))
    this.pending = scheduled.then(
      () => undefined,
      () => undefined,
    )
    return scheduled
  }

  private schedule(task: () => Promise<void> | void): void {
    const scheduled = this.pending.then(() => this.execute(task))
    this.pending = scheduled.then(
      () => undefined,
      () => undefined,
    )
    void scheduled.catch(() => undefined)
  }

  private async execute<T>(task: () => Promise<T> | T): Promise<T> {
    this.requireHealthy()
    try {
      return await enqueueGpuOperation(this.context.device, task)
    } catch (error) {
      throw this.recordFault(error)
    }
  }

  private requireHealthy(): void {
    if (this.closed) throw new Error("WebGPU runtime Matrix уже остановлен")
    if (this.faultError) throw this.faultError
  }

  private recordFault(error: unknown): Error {
    if (!this.faultError) {
      this.faultError = new Error(`Сбой WebGPU Matrix: ${asError(error).message}`)
    }
    return this.faultError
  }

  private collectBraneFields(braneIndex: number): MatrixFieldValueRecord[] {
    const brane = this.store$.branes[braneIndex]
    if (!brane) return []
    const fields: MatrixFieldValueRecord[] = []
    for (let index = brane.localValueOffset; index < brane.localValueOffset + brane.localValueCount; index++) {
      const field = this.store$.braneValues[index]
      if (field) fields.push(field)
    }
    return fields
  }

  private collectSharedBlockFields(sharedBlockIndex: number): MatrixFieldValueRecord[] | null {
    const block = this.store$.sharedBlocks[sharedBlockIndex]
    if (!block) return null
    const fields: MatrixFieldValueRecord[] = []
    for (let index = block.valueOffset; index < block.valueOffset + block.valueCount; index++) {
      const field = this.store$.sharedValues[index]
      if (field) fields.push(field)
    }
    return fields
  }

  private appendCanonicalBlock(
    fields: MatrixFieldValueRecord[],
    sharedPtrs: number[],
    lock: boolean,
  ): number {
    const blockWords = 3 + fields.length * 2 + sharedPtrs.length + fields.reduce((total, record) => {
      return total + (this.store$.fields[record.fieldIndex] ? 2 : 0)
    }, 0)
    const arrayWords = fields.reduce((total, record) => {
      const field = this.store$.fields[record.fieldIndex]
      return total + (field?.type === FIELD_TYPE.ARRAY_PTR && Array.isArray(record.value) && record.value.length > 0
        ? 1 + record.value.length
        : 0)
    }, 0)
    const blockPtr = this.context.heapWords
    const end = blockPtr + blockWords + arrayWords
    this.ensureHeapCapacity(end)
    const heap = this.context.heapMirror
    let arrayOffset = blockPtr + blockWords
    const allocateHeap = (size: number): number => {
      const ptr = arrayOffset
      arrayOffset += size
      return ptr
    }

    heap[blockPtr] = fields.length
    heap[blockPtr + 1] = sharedPtrs.length
    heap[blockPtr + 2] = lock ? 1 : 0
    let descriptorOffset = blockPtr + 3
    let valueOffset = blockPtr + 3 + fields.length * 2 + sharedPtrs.length
    for (const record of fields) {
      const field = this.store$.fields[record.fieldIndex]
      if (!field) continue
      const fieldType = fieldTypeToBytecodeType(field.type)
      const fieldSize = 2
      const encoded = encodeValue(record.value, createPackContext(field, this.store$.stringTable, allocateHeap, heap))
      heap[descriptorOffset++] = record.fieldIndex
      heap[descriptorOffset++] = packMeta(fieldType, fieldSize, valueOffset - blockPtr)
      heap[valueOffset++] = encoded.value1
      if (fieldSize > 1) heap[valueOffset++] = encoded.value2
      if (field.type === FIELD_TYPE.ARRAY_PTR && encoded.value1 !== 0 && Array.isArray(record.value)) {
        this.context.arraySlots.set(valueOffset - fieldSize, {ptr: encoded.value1, size: 1 + record.value.length})
      }
    }
    for (const ptr of sharedPtrs) heap[descriptorOffset++] = ptr
    this.context.heapWords = end
    this.context.blockAllocationWordsByPtr.set(blockPtr, end - blockPtr)
    this.context.device.queue.writeBuffer(
      this.context.buffers.heap,
      blockPtr * 4,
      heap.subarray(blockPtr, end),
    )
    return blockPtr
  }

  private retireBlock(ptr: number | undefined): void {
    if (ptr === undefined) return
    this.context.deadHeapWords += this.context.blockAllocationWordsByPtr.get(ptr) ?? 0
    this.context.blockAllocationWordsByPtr.delete(ptr)
  }

  private ensureHeapCapacity(requiredWords: number): void {
    if (requiredWords <= this.context.heapCapacityWords) return
    const capacity = nextCapacityWords(requiredWords)
    const mirror = new Uint32Array(capacity)
    mirror.set(this.context.heapMirror.subarray(0, this.context.heapWords))
    const previous = this.context.buffers.heap
    this.context.buffers.heap = createStorageBufferWithCapacity(
      this.context.device,
      mirror.subarray(0, this.context.heapWords),
      capacity,
    )
    this.context.heapMirror = mirror
    this.context.heapCapacityWords = capacity
    this.context.bindGroup = createBindGroup(this.context.device, this.context.pipeline, this.context.buffers)
    destroyBuffers([previous])
  }

  private ensureBytecodeCapacity(requiredWords: number): void {
    if (requiredWords <= this.context.bytecodeCapacityWords) return
    const capacity = nextCapacityWords(requiredWords)
    const mirror = new Uint32Array(capacity)
    mirror.set(this.context.bytecodeMirror.subarray(0, this.context.bytecodeWords))
    const previous = this.context.buffers.bytecode
    this.context.buffers.bytecode = createStorageBufferWithCapacity(
      this.context.device,
      mirror.subarray(0, this.context.bytecodeWords),
      capacity,
    )
    this.context.bytecodeMirror = mirror
    this.context.bytecodeCapacityWords = capacity
    this.context.bindGroup = createBindGroup(this.context.device, this.context.pipeline, this.context.buffers)
    destroyBuffers([previous])
  }

  private replaceBraneBytecode(braneIndex: number): void {
    this.context.deadBytecodeWords += this.context.bytecodeWordsByBrane[braneIndex] ?? 0
    const bytecode = deriveWeakBraneBytecode(this.store$, braneIndex)
    const words = bytecode.length > 0 ? bytecode : new Uint32Array(1)
    const offset = this.context.bytecodeWords
    this.ensureBytecodeCapacity(offset + words.length)
    this.context.bytecodeMirror.set(words, offset)
    this.context.device.queue.writeBuffer(
      this.context.buffers.bytecode,
      offset * 4,
      words,
    )
    this.context.bytecodeWords += words.length
    this.context.bytecodeOffsets[braneIndex] = offset
    this.context.bytecodeWordsByBrane[braneIndex] = words.length
    this.context.device.queue.writeBuffer(
      this.context.buffers.bytecodeOffsets,
      braneIndex * 4,
      new Uint32Array([offset]),
    )
  }

  private ensureBraneCapacity(requiredBranes: number): void {
    if (requiredBranes <= this.context.braneCapacity) return
    const capacity = nextCapacityWords(requiredBranes)
    const previous = {
      braneBlockPtrs: this.context.buffers.braneBlockPtrs,
      states: this.context.buffers.states,
      dirtyFlags: this.context.buffers.dirtyFlags,
      bytecodeOffsets: this.context.buffers.bytecodeOffsets,
      stagingBuffer: this.context.stagingBuffer,
    }
    this.context.buffers.braneBlockPtrs = createStorageBufferWithCapacity(
      this.context.device,
      Uint32Array.from(this.context.braneBlockPtrs),
      capacity,
    )
    this.context.buffers.states = createStorageBufferWithCapacity(
      this.context.device,
      Uint32Array.from(this.lastStates),
      capacity,
      true,
    )
    this.context.buffers.dirtyFlags = createStorageBufferWithCapacity(
      this.context.device,
      new Uint32Array(requiredBranes),
      capacity,
      true,
    )
    this.context.buffers.bytecodeOffsets = createStorageBufferWithCapacity(
      this.context.device,
      Uint32Array.from(this.context.bytecodeOffsets),
      capacity,
    )
    this.context.stagingBuffer = this.context.device.createBuffer({
      size: capacity * 8,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    })
    this.context.braneCapacity = capacity
    this.context.bindGroup = createBindGroup(this.context.device, this.context.pipeline, this.context.buffers)
    destroyBuffers([
      previous.braneBlockPtrs,
      previous.states,
      previous.dirtyFlags,
      previous.bytecodeOffsets,
      previous.stagingBuffer,
    ])
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
      true,
    )
    const nextStringHeap = createStorageBufferWithCapacity(
      this.context.device,
      atlas.heap.length > 0 ? atlas.heap : new Uint32Array(1),
      nextStringHeapCapacityWords,
      true,
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
    const nextBraneBlockPtrs = createStorageBufferWithCapacity(
      this.context.device,
      Uint32Array.from(nextDerived.blockPtrs),
      this.context.braneCapacity,
    )
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
    this.context.blockAllocationWordsByPtr = new Map(
      [...nextDerived.sharedBlockPtrs, ...nextDerived.blockPtrs]
        .map((ptr) => [ptr, this.packedBlockWords(nextDerived.heap, ptr)]),
    )
    this.context.deadHeapWords = 0

    destroyBuffers([previousBraneBlockPtrs, previousHeap])
  }

  private refreshBytecodeBuffers(): void {
    const derived = deriveWeakData(this.store$)
    const words = derived.bytecode.length > 0 ? derived.bytecode.length : 1
    const capacity = nextCapacityWords(words)
    const mirror = new Uint32Array(capacity)
    mirror.set(derived.bytecode)
    const previousBytecode = this.context.buffers.bytecode
    const previousOffsets = this.context.buffers.bytecodeOffsets
    this.context.buffers.bytecode = createStorageBufferWithCapacity(
      this.context.device,
      derived.bytecode.length > 0 ? derived.bytecode : new Uint32Array(1),
      capacity,
    )
    this.context.buffers.bytecodeOffsets = createStorageBufferWithCapacity(
      this.context.device,
      derived.bytecodeOffsets.length > 0 ? derived.bytecodeOffsets : new Uint32Array(1),
      this.context.braneCapacity,
    )
    this.context.bytecodeMirror = mirror
    this.context.bytecodeWords = words
    this.context.bytecodeCapacityWords = capacity
    this.context.bytecodeOffsets = Array.from(derived.bytecodeOffsets)
    this.context.bytecodeWordsByBrane = Array.from(
      derived.bytecodeOffsets,
      (offset, index) => (derived.bytecodeOffsets[index + 1] ?? derived.bytecode.length) - offset,
    )
    this.context.deadBytecodeWords = 0
    this.context.bindGroup = createBindGroup(this.context.device, this.context.pipeline, this.context.buffers)
    destroyBuffers([previousBytecode, previousOffsets])
  }

  private packedBlockWords(heap: Uint32Array, ptr: number): number {
    const localCount = heap[ptr] ?? 0
    const sharedCount = heap[ptr + 1] ?? 0
    let words = 3 + localCount * 2 + sharedCount
    for (let index = 0; index < localCount; index++) {
      const fieldIndex = heap[ptr + 3 + index * 2] ?? -1
      const packed = heap[ptr + 4 + index * 2] ?? 0
      const size = (packed >>> 16) & 0xff
      const offset = packed & 0xffff
      words += size
      if (this.store$.fields[fieldIndex]?.type !== FIELD_TYPE.ARRAY_PTR) continue
      const arrayPtr = heap[ptr + offset] ?? 0
      if (arrayPtr !== 0) words += 1 + (heap[arrayPtr] ?? 0)
    }
    return words
  }

  private tryApplyHeapUpdates(updates: WeakHeapUpdate[]): boolean {
    const writes: Array<{ offset: number; value1: number; value2?: number }> = []
    let heapMirror = this.context.heapMirror
    let requiresFullHeapWrite = false

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

      if (this.store$.fields[update.fieldIndex]?.type === FIELD_TYPE.ARRAY_PTR) {
        requiresFullHeapWrite = true
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
    if (requiresFullHeapWrite) {
      this.context.device.queue.writeBuffer(
        this.context.buffers.heap,
        0,
        heapMirror.buffer,
        heapMirror.byteOffset,
        heapMirror.byteLength,
      )
    } else {
      updateGpuHeapFields(this.context.device, this.context.buffers.heap, writes)
    }
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

    heapMirror[valueOffset + 1] = encoded.value2
    return { writes: [{ offset: valueOffset, value1: encoded.value1, value2: encoded.value2 }] }
  }

  private resolveArrayWrites(
    heapMirror: Uint32Array,
    valueOffset: number,
    fieldIndex: number,
    value: MatrixValue,
  ): { writes: Array<{ offset: number; value1: number; value2?: number }>; heapMirror?: Uint32Array } | null {
    if (value !== null && !Array.isArray(value)) {
      return null
    }

    const currentPtr = heapMirror[valueOffset] ?? 0
    const currentSlot = this.context.arraySlots.get(valueOffset)
    if (value === null) {
      if (currentSlot) {
        this.releaseArraySlot(currentSlot)
        this.context.arraySlots.delete(valueOffset)
      }
      heapMirror[valueOffset] = 0
      heapMirror[valueOffset + 1] = 0
      return { writes: [{ offset: valueOffset, value1: 0, value2: 0 }] }
    }

    if (value.length === 0) {
      if (currentSlot) {
        this.releaseArraySlot(currentSlot)
        this.context.arraySlots.delete(valueOffset)
      }
      heapMirror[valueOffset] = 0
      heapMirror[valueOffset + 1] = 1
      return { writes: [{ offset: valueOffset, value1: 0, value2: 1 }] }
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
      nextHeapMirror[valueOffset + 1] = 1
      this.context.arraySlots.set(valueOffset, { ptr: targetSlot.ptr, size: requiredSize })
      return {
        heapMirror: nextHeapMirror,
        writes: [
          { offset: valueOffset, value1: targetSlot.ptr, value2: 1 },
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
    heapMirror[valueOffset + 1] = 1
    this.context.arraySlots.set(valueOffset, { ptr: currentPtr, size: 1 + value.length })

    return {
      writes: [
        { offset: valueOffset, value1: currentPtr, value2: 1 },
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
