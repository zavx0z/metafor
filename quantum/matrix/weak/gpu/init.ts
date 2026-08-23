import type { GpuBufferMap, GpuRuntimeContext } from "@matrix/types/gpu"
import type { MatrixStore } from "@matrix/types/store"
import { deriveWeakData } from "./derived"
import { createBuffer, createStorageBufferWithCapacity, nextCapacityWords } from "./buffer"
import { createInitialArrayHeapIndex } from "./heap"
import {unpackMeta} from "./layout-heap"
import { createUniforms, resolveStringTableBuffers } from "./layout"
import { createBindGroup, createComputePipeline } from "./pipeline"
import { debugLog } from "./debug"
import {FIELD_TYPE} from "../constants"

function createBraneBlockPtrs(blockPtrs: number[]): Uint32Array {
  return Uint32Array.from(blockPtrs)
}

function createHeapMirrorWithCapacity(heap: Uint32Array, capacityWords: number): Uint32Array {
  const mirror = new Uint32Array(capacityWords)
  mirror.set(heap)
  return mirror
}

function blockWords(heap: Uint32Array, ptr: number, store$: MatrixStore): number {
  const localCount = heap[ptr] ?? 0
  const sharedCount = heap[ptr + 1] ?? 0
  let words = 3 + localCount * 2 + sharedCount
  for (let index = 0; index < localCount; index++) {
    const fieldIndex = heap[ptr + 3 + index * 2] ?? -1
    const meta = unpackMeta(heap[ptr + 4 + index * 2] ?? 0)
    words += meta.size
    if (store$.fields[fieldIndex]?.type !== FIELD_TYPE.ARRAY_PTR) continue
    const arrayPtr = heap[ptr + meta.offset] ?? 0
    if (arrayPtr !== 0) words += 1 + (heap[arrayPtr] ?? 0)
  }
  return words
}

function bytecodeWordsByBrane(offsets: Uint32Array, totalWords: number): number[] {
  return Array.from(offsets, (offset, index) => (offsets[index + 1] ?? totalWords) - offset)
}

export function createGpuRuntimeContext(
  device: GPUDevice,
  shaderSource: string,
  store$: MatrixStore,
  enableDebug = false,
): GpuRuntimeContext {
  debugLog(enableDebug, "[GPUWeakRuntime] Creating shader module and compute pipeline")
  const pipeline = createComputePipeline(device, shaderSource)
  const derived = deriveWeakData(store$)
  const atlas = resolveStringTableBuffers(store$.stringTable)
  const braneCount = store$.branes.length
  const braneCapacity = nextCapacityWords(Math.max(1, braneCount))
  const statesData = derived.states.length > 0 ? derived.states : new Uint32Array(1)
  const dirtyData = new Uint32Array(braneCapacity)
  const heapWords = derived.heap.length > 0 ? derived.heap.length : 1
  const heapCapacityWords = nextCapacityWords(heapWords)
  const bytecodeWords = derived.bytecode.length > 0 ? derived.bytecode.length : 1
  const bytecodeCapacityWords = nextCapacityWords(bytecodeWords)
  const bytecodeMirror = new Uint32Array(bytecodeCapacityWords)
  bytecodeMirror.set(derived.bytecode)
  const stringRegistryWords = atlas.registry.length > 0 ? atlas.registry.length : 1
  const stringRegistryCapacityWords = nextCapacityWords(stringRegistryWords)
  const stringHeapWords = atlas.heap.length > 0 ? atlas.heap.length : 1
  const stringHeapCapacityWords = nextCapacityWords(stringHeapWords)

  const buffers: GpuBufferMap = {
    braneBlockPtrs: createStorageBufferWithCapacity(device, createBraneBlockPtrs(derived.blockPtrs), braneCapacity),
    heap: createStorageBufferWithCapacity(device, derived.heap.length > 0 ? derived.heap : new Uint32Array(1), heapCapacityWords),
    states: createStorageBufferWithCapacity(device, statesData, braneCapacity, true),
    dirtyFlags: createBuffer(
      device,
      dirtyData,
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    ),
    bytecode: createStorageBufferWithCapacity(
      device,
      derived.bytecode.length > 0 ? derived.bytecode : new Uint32Array(1),
      bytecodeCapacityWords,
    ),
    bytecodeOffsets: createStorageBufferWithCapacity(
      device,
      derived.bytecodeOffsets.length > 0 ? derived.bytecodeOffsets : new Uint32Array(1),
      braneCapacity,
    ),
    uniforms: createBuffer(device, createUniforms(braneCount), GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST),
    stringRegistry: createStorageBufferWithCapacity(device, atlas.registry.length > 0 ? atlas.registry : new Uint32Array(1), stringRegistryCapacityWords, true),
    stringHeap: createStorageBufferWithCapacity(device, atlas.heap.length > 0 ? atlas.heap : new Uint32Array(1), stringHeapCapacityWords, true),
  }

  const stagingBuffer = device.createBuffer({
    size: braneCapacity * 8,
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
    braneCapacity,
    heapMirror: createHeapMirrorWithCapacity(derived.heap, heapCapacityWords),
    heapWords,
    heapCapacityWords,
    braneBlockPtrs: derived.blockPtrs,
    sharedBlockPtrs: derived.sharedBlockPtrs,
    blockAllocationWordsByPtr: new Map(
      [...derived.sharedBlockPtrs, ...derived.blockPtrs].map((ptr) => [ptr, blockWords(derived.heap, ptr, store$)]),
    ),
    deadHeapWords: 0,
    bytecodeOffsets: Array.from(derived.bytecodeOffsets),
    bytecodeWordsByBrane: bytecodeWordsByBrane(derived.bytecodeOffsets, derived.bytecode.length),
    bytecodeMirror,
    bytecodeWords,
    bytecodeCapacityWords,
    deadBytecodeWords: 0,
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
