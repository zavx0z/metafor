import type { StringAtlasExport } from "@boundary/atlas"
import type { MatrixInitParams } from "../matrix.t.ts"
import type { GpuBufferMap, GpuRuntimeContext } from "./index.t.ts"
import { createBuffer, createStorageBuffer } from "./buffer"
import { createUniforms, resolveAtlasBuffers } from "./layout"
import { createBindGroup, createComputePipeline } from "./pipeline"
import { debugLog } from "./debug"

export function createGpuRuntimeContext(
  device: GPUDevice,
  shaderSource: string,
  params: MatrixInitParams,
  atlasExport: StringAtlasExport,
  enableDebug = false,
): GpuRuntimeContext {
  debugLog(enableDebug, "[GPUMatrixRuntime] Creating shader module and compute pipeline")
  const pipeline = createComputePipeline(device, shaderSource)

  const atlas = resolveAtlasBuffers(atlasExport)
  const buffers: GpuBufferMap = {
    braneDescriptors: createStorageBuffer(device, params.braneDescriptors),
    heap: createStorageBuffer(device, params.heap),
    states: createStorageBuffer(device, params.states, true),
    dirtyFlags: createBuffer(
      device,
      new Uint32Array(params.states.length),
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    ),
    bytecode: createStorageBuffer(device, params.bytecode),
    bytecodeOffsets: createStorageBuffer(device, params.bytecodeOffsets),
    uniforms: createBuffer(device, createUniforms(params.states.length), GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST),
    stringRegistry: createStorageBuffer(device, atlas.registry),
    stringHeap: createStorageBuffer(device, atlas.heap),
  }

  const stagingBuffer = device.createBuffer({
    size: params.states.byteLength * 2,
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
