import type { BoundaryStore } from "../../store.t"
import { deriveMatrixData } from "../derived"
import type { GpuBufferMap, GpuRuntimeContext } from "./index.t.ts"
import { createBuffer, createStorageBuffer } from "./buffer"
import { createUniforms, resolveStringTableBuffers } from "./layout"
import { createBindGroup, createComputePipeline } from "./pipeline"
import { debugLog } from "./debug"

function createBraneBlockPtrs(blockPtrs: number[]): Uint32Array {
  return Uint32Array.from(blockPtrs)
}

export function createGpuRuntimeContext(
  device: GPUDevice,
  shaderSource: string,
  store$: BoundaryStore,
  enableDebug = false,
): GpuRuntimeContext {
  debugLog(enableDebug, "[GPUMatrixRuntime] Creating shader module and compute pipeline")
  const pipeline = createComputePipeline(device, shaderSource)
  const derived = deriveMatrixData(store$)
  const atlas = resolveStringTableBuffers(store$.stringTable)
  const braneCount = store$.states.length
  const statesData = derived.states.length > 0 ? derived.states : new Uint32Array(1)
  const dirtyData = new Uint32Array(Math.max(1, braneCount))

  const buffers: GpuBufferMap = {
    braneBlockPtrs: createStorageBuffer(device, createBraneBlockPtrs(derived.blockPtrs)),
    heap: createStorageBuffer(device, derived.heap.length > 0 ? derived.heap : new Uint32Array(1)),
    states: createStorageBuffer(device, statesData, true),
    dirtyFlags: createBuffer(
      device,
      dirtyData,
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    ),
    bytecode: createStorageBuffer(device, derived.bytecode.length > 0 ? derived.bytecode : new Uint32Array(1)),
    bytecodeOffsets: createStorageBuffer(device, derived.bytecodeOffsets.length > 0 ? derived.bytecodeOffsets : new Uint32Array(1)),
    uniforms: createBuffer(device, createUniforms(braneCount), GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST),
    stringRegistry: createStorageBuffer(device, atlas.registry),
    stringHeap: createStorageBuffer(device, atlas.heap),
  }

  const stagingBuffer = device.createBuffer({
    size: Math.max(1, braneCount) * 8,
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
    braneCount,
    heapMirror: derived.heap,
    braneBlockPtrs: derived.blockPtrs,
    sharedBlockPtrs: derived.sharedBlockPtrs,
    stringTableSize: store$.stringTable.length,
  }
}
