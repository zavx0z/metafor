import shaderSource from "./evolution.wgsl" with { type: "text" }
import type { BoundaryStore } from "../../store.t"
import { findBraneFieldLocation } from "../../store.access"
import { FIELD_TYPE, VALUE_TYPE } from "../constants"
import { findFieldValueOffset } from "../heap"
import type { MatrixChanges, MatrixHeapUpdate, MatrixRuntime } from "../matrix.t"
import { createPackContext, encodeValue } from "../pack"
import type { GpuRuntimeContext } from "./index.t.ts"
import { destroyBuffers } from "./buffer"
import { createGpuRuntimeContext } from "./init"
import { readGpuChanges } from "./read"
import { runGpuStep } from "./step"
import { updateGpuHeapFields } from "./heap"

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
 * GPU Matrix runtime.
 *
 * ## CRITICAL PERFORMANCE NOTE
 *
 * **This is a temporary implementation with known performance limitations.**
 *
 * Current behavior on `heapUpdate()`:
 * - Fast path: partial `GPUQueue.writeBuffer()` updates for scalar/string/lock changes
 * - Fallback path: full context rebuild for structural changes (for example string table growth or array reallocation)
 *
 * Fallback rebuild is O(N) where N = total heap + bytecode + string table size.
 *
 * **Why this is unacceptable for production:**
 * - Structural updates still trigger GPU buffer allocation and full data transfer
 * - Array growth / new strings remain expensive until full incremental sync exists
 * - Does not yet scale optimally for mutation-heavy workloads with frequent structural changes
 *
 * **Correct future implementation:**
 * - Incremental string buffer growth without full bind-group rebuild
 * - Incremental array allocation / compaction without re-deriving all heap blocks
 * - Dirty tracking at canonical store level to identify minimal structural changes
 *
 * **DO NOT use this implementation as a model for production code.**
 * This runtime now uses partial sync where safe, but still keeps a rebuild fallback for structural mutations.
 */
export class GPUMatrixRuntime implements MatrixRuntime {
  private context: GpuRuntimeContext
  private readonly store: BoundaryStore
  private lastStates: number[]
  private pending: Promise<unknown> = Promise.resolve()

  private constructor(context: GpuRuntimeContext, store: BoundaryStore) {
    this.context = context
    this.store = store
    this.lastStates = [...store.states]
  }

  static async create(device: GPUDevice, store: BoundaryStore): Promise<GPUMatrixRuntime> {
    const context = createGpuRuntimeContext(device, shaderSource, store, false)
    return new GPUMatrixRuntime(context, store)
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

  async readChanges(): Promise<MatrixChanges> {
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
   * Applies incremental GPU sync when canonical mutations preserve the existing derived layout.
   *
   * Falls back to full rebuild only for structural mutations that would invalidate
   * current heap / string buffer sizes.
   */
  heapUpdate(updates: MatrixHeapUpdate[]): void {
    void this.enqueue(() => {
      if (updates.length === 0) {
        return
      }

      const stringTableChanged = this.store.stringTable.length !== this.context.stringTableSize
      if (stringTableChanged || !this.tryApplyHeapUpdates(updates)) {
        this.rebuildContext()
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

  private rebuildContext(): void {
    const nextContext = createGpuRuntimeContext(this.context.device, shaderSource, this.store, false)
    destroyContext(this.context)
    this.context = nextContext
    this.lastStates = [...this.store.states]
  }

  private tryApplyHeapUpdates(updates: MatrixHeapUpdate[]): boolean {
    const writes: Array<{ offset: number; value1: number; value2?: number }> = []

    for (const update of updates) {
      if (update.kind === "lock") {
        const blockPtr = this.context.braneBlockPtrs[update.braneIndex]
        if (blockPtr === undefined) {
          return false
        }
        writes.push({ offset: blockPtr + 2, value1: update.value ? 1 : 0 })
        this.context.heapMirror[blockPtr + 2] = update.value ? 1 : 0
        continue
      }

      const nextWrites = this.resolveFieldWrites(update.braneIndex, update.fieldIndex)
      if (!nextWrites) {
        return false
      }

      for (const write of nextWrites) {
        writes.push(write)
      }
    }

    updateGpuHeapFields(this.context.device, this.context.buffers.heap, writes)
    return true
  }

  private resolveFieldWrites(
    braneIndex: number,
    fieldIndex: number,
  ): Array<{ offset: number; value1: number; value2?: number }> | null {
    const location = findBraneFieldLocation(this.store, braneIndex, fieldIndex)
    const field = this.store.fields[fieldIndex]
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

    const valueOffset = findFieldValueOffset(this.context.heapMirror, blockPtr, fieldIndex)
    if (valueOffset === null) {
      return null
    }

    if (field.type === FIELD_TYPE.ARRAY_PTR) {
      return this.resolveArrayWrites(valueOffset, fieldIndex, location.record.value)
    }

    const encoded = encodeValue(location.record.value, createPackContext(field, this.store.stringTable))
    this.context.heapMirror[valueOffset] = encoded.value1

    if (field.type === FIELD_TYPE.STRING_PTR) {
      this.context.heapMirror[valueOffset + 1] = encoded.value2
      return [{ offset: valueOffset, value1: encoded.value1, value2: encoded.value2 }]
    }

    return [{ offset: valueOffset, value1: encoded.value1 }]
  }

  private resolveArrayWrites(
    valueOffset: number,
    fieldIndex: number,
    value: BoundaryStore["braneValues"][number]["value"],
  ): Array<{ offset: number; value1: number; value2?: number }> | null {
    if (!Array.isArray(value)) {
      return null
    }

    const currentPtr = this.context.heapMirror[valueOffset] ?? 0
    if (value.length === 0) {
      this.context.heapMirror[valueOffset] = 0
      this.context.heapMirror[valueOffset + 1] = 0
      return [{ offset: valueOffset, value1: 0, value2: 0 }]
    }

    if (currentPtr === 0) {
      return null
    }

    const currentLength = this.context.heapMirror[currentPtr] ?? 0
    if (currentLength !== value.length) {
      return null
    }

    const field = this.store.fields[fieldIndex]
    if (!field) {
      return null
    }

    const arrayContext = createPackContext(field, this.store.stringTable)
    const encodedItems = value.map((item) =>
      encodeValue(
        item,
        {
          type: arrayContext.subType ?? VALUE_TYPE.FLOAT,
          stringTable: this.store.stringTable,
        },
      ).value1,
    )

    const arrayWords = new Uint32Array(1 + encodedItems.length)
    arrayWords[0] = value.length
    encodedItems.forEach((item, index) => {
      arrayWords[index + 1] = item
      this.context.heapMirror[currentPtr + 1 + index] = item
    })

    this.context.heapMirror[currentPtr] = value.length
    this.context.heapMirror[valueOffset] = currentPtr
    this.context.heapMirror[valueOffset + 1] = 0

    return [
      { offset: valueOffset, value1: currentPtr, value2: 0 },
      ...Array.from(arrayWords).map((word, index) => ({
        offset: currentPtr + index,
        value1: word,
      })),
    ]
  }
}
