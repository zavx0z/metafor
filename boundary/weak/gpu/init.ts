import type { BoundaryStore } from "../../store.t"
import { deriveWeakData } from "./derived"
import type { GpuBufferMap, GpuRuntimeContext } from "./index.t.ts"
import { createBuffer, createStorageBuffer, createStorageBufferWithCapacity, nextCapacityWords } from "./buffer"
import { createInitialArrayHeapIndex } from "./heap"
import { createUniforms, resolveStringTableBuffers } from "./layout"
import { createBindGroup, createComputePipeline } from "./pipeline"
import { debugLog } from "./debug"

function createBraneBlockPtrs(blockPtrs: number[]): Uint32Array {
  return Uint32Array.from(blockPtrs)
}

function createHeapMirrorWithCapacity(heap: Uint32Array, capacityWords: number): Uint32Array {
  const mirror = new Uint32Array(capacityWords)
  mirror.set(heap)
  return mirror
}

export function createGpuRuntimeContext(
  device: GPUDevice,
  shaderSource: string,
  store$: BoundaryStore,
  enableDebug = false,
): GpuRuntimeContext {
  debugLog(enableDebug, "[GPUWeakRuntime] Creating shader module and compute pipeline")
  const pipeline = createComputePipeline(device, shaderSource)
  const derived = deriveWeakData(store$)
  const atlas = resolveStringTableBuffers(store$.stringTable)
  const braneCount = store$.states.length
  const statesData = derived.states.length > 0 ? derived.states : new Uint32Array(1)
  const dirtyData = new Uint32Array(Math.max(1, braneCount))
  const heapWords = derived.heap.length > 0 ? derived.heap.length : 1
  const heapCapacityWords = nextCapacityWords(heapWords)
  const stringRegistryWords = atlas.registry.length > 0 ? atlas.registry.length : 1
  const stringRegistryCapacityWords = nextCapacityWords(stringRegistryWords)
  const stringHeapWords = atlas.heap.length > 0 ? atlas.heap.length : 1
  const stringHeapCapacityWords = nextCapacityWords(stringHeapWords)

  const buffers: GpuBufferMap = {
    braneBlockPtrs: createStorageBuffer(device, createBraneBlockPtrs(derived.blockPtrs)),
    heap: createStorageBufferWithCapacity(device, derived.heap.length > 0 ? derived.heap : new Uint32Array(1), heapCapacityWords),
    states: createStorageBuffer(device, statesData, true),
    dirtyFlags: createBuffer(
      device,
      dirtyData,
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    ),
    bytecode: createStorageBuffer(device, derived.bytecode.length > 0 ? derived.bytecode : new Uint32Array(1)),
    bytecodeOffsets: createStorageBuffer(device, derived.bytecodeOffsets.length > 0 ? derived.bytecodeOffsets : new Uint32Array(1)),
    uniforms: createBuffer(device, createUniforms(braneCount), GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST),
    stringRegistry: createStorageBufferWithCapacity(device, atlas.registry.length > 0 ? atlas.registry : new Uint32Array(1), stringRegistryCapacityWords),
    stringHeap: createStorageBufferWithCapacity(device, atlas.heap.length > 0 ? atlas.heap : new Uint32Array(1), stringHeapCapacityWords),
  }

  const stagingBuffer = device.createBuffer({
    size: Math.max(1, braneCount) * 8,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  })
  const bindGroup = createBindGroup(device, pipeline, buffers)

  debugLog(enableDebug, "[GPUWeakRuntime] Initialization complete")
  return {
    device,
    pipeline,
    bindGroup,
    buffers,
    stagingBuffer,
    braneCount,
    heapMirror: createHeapMirrorWithCapacity(derived.heap, heapCapacityWords),
    heapWords,
    heapCapacityWords,
    braneBlockPtrs: derived.blockPtrs,
    sharedBlockPtrs: derived.sharedBlockPtrs,
    arraySlots: createInitialArrayHeapIndex(derived.heap, derived.blockPtrs, derived.sharedBlockPtrs, store$.fields),
    arrayFreeList: [],
    stringTableSize: store$.stringTable.length,
    stringRegistryWords,
    stringRegistryCapacityWords,
    stringHeapWords,
    stringHeapCapacityWords,
    stringTableSnapshot: [...store$.stringTable],
  }
}
