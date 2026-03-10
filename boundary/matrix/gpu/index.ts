import shaderSource from "./evolution.wgsl" with { type: "text" }
import type { StoredStringTable } from "@boundary/fields"
import type { MatrixChanges, MatrixHeapUpdate, MatrixInitParams, MatrixRuntime } from "../matrix.t"
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
  private pending: Promise<unknown> = Promise.resolve()

  private constructor(context: GpuRuntimeContext) {
    this.context = context
  }

  static async create(device: GPUDevice, params: MatrixInitParams, stringTable: StoredStringTable): Promise<GPUMatrixRuntime> {
    const context = createGpuRuntimeContext(device, shaderSource, params, stringTable, false)
    return new GPUMatrixRuntime(context)
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
    return await this.enqueue(() =>
      readGpuChanges(
        this.context.device,
        this.context.buffers.dirtyFlags,
        this.context.buffers.states,
        this.context.stagingBuffer,
      ),
    )
  }

  statesSnapshot(): null {
    return null
  }

  heapUpdate(updates: MatrixHeapUpdate[]): void {
    void this.enqueue(() => updateGpuHeapFields(this.context.device, this.context.buffers.heap, updates))
  }

  clear(): void {
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
