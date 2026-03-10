import shaderSource from "./evolution.wgsl" with { type: "text" }
import type { BoundaryStore } from "../../store.t"
import type { MatrixChanges, MatrixHeapUpdate, MatrixRuntime } from "../matrix.t"
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

export class GPUMatrixRuntime implements MatrixRuntime {
  private readonly context: GpuRuntimeContext
  private lastStates: Uint32Array
  private pending: Promise<unknown> = Promise.resolve()

  private constructor(context: GpuRuntimeContext, initialStates: Uint32Array) {
    this.context = context
    this.lastStates = initialStates.slice()
  }

  static async create(device: GPUDevice, store: BoundaryStore): Promise<GPUMatrixRuntime> {
    const context = createGpuRuntimeContext(device, shaderSource, store, false)
    return new GPUMatrixRuntime(context, store.states)
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
      )
      this.lastStates = result.states
      return result.changes
    })
  }

  statesSnapshot(): Uint32Array {
    return this.lastStates
  }

  heapUpdate(updates: MatrixHeapUpdate[]): void {
    void this.enqueue(() => updateGpuHeapFields(this.context.device, this.context.buffers.heap, updates))
  }

  clear(): void {
    this.lastStates = new Uint32Array(0)
    void this.enqueue(() =>
      destroyBuffers([
        this.context.buffers.braneBlockPtrs,
        this.context.buffers.heap,
        this.context.buffers.states,
        this.context.buffers.dirtyFlags,
        this.context.buffers.bytecode,
        this.context.buffers.bytecodeOffsets,
        this.context.buffers.uniforms,
        this.context.buffers.stringRegistry,
        this.context.buffers.stringHeap,
        this.context.stagingBuffer,
      ]),
    )
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
