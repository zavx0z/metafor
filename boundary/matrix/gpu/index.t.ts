import type { MatrixChanges } from "../matrix.t.ts"

export interface GpuBufferMap {
  braneBlockPtrs: GPUBuffer
  heap: GPUBuffer
  states: GPUBuffer
  dirtyFlags: GPUBuffer
  bytecode: GPUBuffer
  bytecodeOffsets: GPUBuffer
  uniforms: GPUBuffer
  stringRegistry: GPUBuffer
  stringHeap: GPUBuffer
}

export interface GpuRuntimeContext {
  device: GPUDevice
  pipeline: GPUComputePipeline
  bindGroup: GPUBindGroup
  buffers: GpuBufferMap
  stagingBuffer: GPUBuffer
}

export interface GpuReadResult {
  changes: MatrixChanges
  states: Uint32Array
}
