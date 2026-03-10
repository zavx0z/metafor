import shaderSource from "./evolution.wgsl" with { type: "text" }
import type { BoundaryStore } from "../../store.t"
import type { MatrixChanges, MatrixHeapUpdate, MatrixRuntime } from "../matrix.t"
import type { GpuRuntimeContext } from "./index.t.ts"
import { destroyBuffers } from "./buffer"
import { createGpuRuntimeContext } from "./init"
import { readGpuChanges } from "./read"
import { runGpuStep } from "./step"

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
 * - **Full context rebuild**: Destroys and recreates ALL GPU buffers
 * - **Full deriveMatrixData()**: Re-derives packed execution forms from canonical store
 * - **Full bind group recreation**: Re-creates pipeline bind groups
 *
 * This is O(N) where N = total heap + bytecode + string table size.
 *
 * **Why this is unacceptable for production:**
 * - GPU buffer allocation is expensive (driver overhead)
 * - Data transfer CPU→GPU on every update blocks the pipeline
 * - Does not scale with number of branes or field updates
 *
 * **Correct future implementation:**
 * - Partial buffer updates via `GPUQueue.writeBuffer()` with offsets
 * - Incremental deriveMatrixData() that only re-encodes changed fields
 * - Dirty tracking at canonical store level to identify minimal changes
 *
 * **DO NOT use this implementation as a model for production code.**
 * This exists only as a fallback until incremental sync is implemented.
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
   * **PERFORMANCE CRITICAL: Full rebuild on every update.**
   *
   * This is a temporary fallback implementation.
   * See class-level JSDoc for details.
   */
  heapUpdate(_updates: MatrixHeapUpdate[]): void {
    void this.enqueue(() => {
      // FULL REBUILD: This is the performance bottleneck
      const nextContext = createGpuRuntimeContext(this.context.device, shaderSource, this.store, false)
      destroyContext(this.context)
      this.context = nextContext
      this.lastStates = [...this.store.states]
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
}
