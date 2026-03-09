import shaderSource from "./evolution.wgsl" with { type: "text" }
import type { StringAtlasExport } from "@boundary/atlas"
import type { MatrixChanges, MatrixHeapUpdate, MatrixInitParams, MatrixRuntime } from "../matrix.t"
import type { GpuRuntimeContext } from "./index.t.ts"
import { destroyBuffers } from "./buffer"
import { createGpuRuntimeContext } from "./init"
import { readGpuChanges } from "./read"
import { runGpuStep } from "./step"
import { updateGpuHeapFields } from "./heap"

export class GPUMatrixRuntime implements MatrixRuntime {
  private readonly context: GpuRuntimeContext

  private constructor(context: GpuRuntimeContext) {
    this.context = context
  }

  static async create(device: GPUDevice, params: MatrixInitParams, atlasExport: StringAtlasExport): Promise<GPUMatrixRuntime> {
    const context = createGpuRuntimeContext(device, shaderSource, params, atlasExport, false)
    return new GPUMatrixRuntime(context)
  }

  step(): void {
    runGpuStep(
      this.context.device,
      this.context.pipeline,
      this.context.bindGroup,
      this.context.buffers.dirtyFlags,
      this.context.buffers.states,
    )
  }

  async readChanges(): Promise<MatrixChanges> {
    return await readGpuChanges(
      this.context.device,
      this.context.buffers.dirtyFlags,
      this.context.buffers.states,
      this.context.stagingBuffer,
    )
  }

  statesSnapshot(): null {
    return null
  }

  heapUpdate(updates: MatrixHeapUpdate[]): void {
    updateGpuHeapFields(this.context.device, this.context.buffers.heap, updates)
  }

  clear(): void {
    destroyBuffers([
      this.context.buffers.braneDescriptors,
      this.context.buffers.heap,
      this.context.buffers.states,
      this.context.buffers.dirtyFlags,
      this.context.buffers.bytecode,
      this.context.buffers.bytecodeOffsets,
      this.context.buffers.uniforms,
      this.context.buffers.stringRegistry,
      this.context.buffers.stringHeap,
      this.context.stagingBuffer,
    ])
  }
}
