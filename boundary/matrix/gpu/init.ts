import type { BoundaryStore } from "../../store.t"
import type { GpuBufferMap, GpuRuntimeContext } from "./index.t.ts"
import { createBuffer, createStorageBuffer } from "./buffer"
import { createUniforms, resolveStringTableBuffers } from "./layout"
import { createBindGroup, createComputePipeline } from "./pipeline"
import { debugLog } from "./debug"

function createBraneBlockPtrs(blockPtrs: number[]): Uint32Array {
  const descriptors = new Uint32Array(blockPtrs.length)
  for (let i = 0; i < blockPtrs.length; i++) {
    descriptors[i] = blockPtrs[i] ?? 0
  }
  return descriptors
}

export function createGpuRuntimeContext(
  device: GPUDevice,
  shaderSource: string,
  store$: BoundaryStore,
  enableDebug = false,
): GpuRuntimeContext {
  debugLog(enableDebug, "[GPUMatrixRuntime] Creating shader module and compute pipeline")
  const pipeline = createComputePipeline(device, shaderSource)

  const atlas = resolveStringTableBuffers(store$.stringTable)
  const braneBlockPtrs = createBraneBlockPtrs(store$.blockPtrs)
  const buffers: GpuBufferMap = {
    braneBlockPtrs: createStorageBuffer(device, braneBlockPtrs),
    heap: createStorageBuffer(device, store$.heap),
    states: createStorageBuffer(device, store$.states, true),
    dirtyFlags: createBuffer(
      device,
      new Uint32Array(store$.states.length),
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    ),
    bytecode: createStorageBuffer(device, store$.bytecode),
    bytecodeOffsets: createStorageBuffer(device, store$.bytecodeOffsets),
    uniforms: createBuffer(device, createUniforms(store$.states.length), GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST),
    stringRegistry: createStorageBuffer(device, atlas.registry),
    stringHeap: createStorageBuffer(device, atlas.heap),
  }

  const stagingBuffer = device.createBuffer({
    size: store$.states.byteLength * 2,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  })
  const bindGroup = createBindGroup(device, pipeline, buffers)

  debugLog(enableDebug, "[GPUMatrixRuntime] Initialization complete")
  return {
    device,
    pipeline,
    bindGroup,
    buffers,
    stagingBuffer,
  }
}
