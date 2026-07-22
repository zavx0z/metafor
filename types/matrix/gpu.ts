import type { MatrixFieldRecord } from "./data.ts"
import type { StringInterner } from "./strong.ts"
import type { WeakChanges } from "./weak.ts"

export interface MaybeGpuNavigator {
  gpu?: {
    requestAdapter: () => Promise<GPUAdapter | null>
  }
}

export interface MatrixEncodingContext {
  type: number
  subType?: number
  enum?: unknown[]
  allocateHeap?: (size: number) => number
  heap?: Uint32Array
  stringInterner?: StringInterner
}

export interface MatrixEncodedValueResult {
  value1: number
  value2: number
}

export interface BytecodeLayout {
  stateTable: number[]
  stateBlocks: number[]
  conditionBlocks: number[]
  heap: number[]
}

export interface FieldBytecode {
  bytecode: Uint32Array
  bytecodeOffset: number
}

export interface CompiledRules {
  bytecode: Uint32Array
  bytecodeOffsets: Uint32Array
}

export interface GpuFlattenedTransition {
  targetState: number | null
  conditions: Array<{
    fieldIndex: number
    checks: Array<{
      op: number
      val: number | boolean | (number | boolean)[]
    }>
  }>
}

export interface HeapStats {
  totalSize: number
  usedSize: number
  arrayReserve: number
  freeSize: number
  utilization: number
}

export interface HeapBlockDump {
  blockPtr: number
  localCount: number
  entangledCount: number
  fields: FieldDump[]
  entangledPointers: number[]
}

export interface FieldDump {
  fieldId: number
  type: number
  typeName: string
  size: number
  offset: number
}

export interface BytecodeDump {
  offset: number
  stateTableSize: number
  states: StateDump[]
}

export interface StateDump {
  stateIdx: number
  statePtr: number
  transitionCount: number
  transitions: TransitionDump[]
  isTerminal: boolean
}

export interface TransitionDump {
  transitionIdx: number
  target: number
  condPtr: number
  conditions: ConditionDump[]
}

export interface ConditionDump {
  conditionIdx: number
  type: number
  typeName: string
  fieldId: number
  op: number
  opName: string
  valEncoded: number
  valDecoded: number | string
}

export interface StringAtlasDump {
  count: number
  strings: StringDump[]
}

export interface StringDump {
  id: number
  value: string
  length: number
  hash: number
  pointer: number
}

export interface WeakDump {
  braneCount: number
  heapBlocks: HeapBlockDump[]
  bytecodeDumps: BytecodeDump[]
  stringAtlas: StringAtlasDump | null
  heapStats: HeapStats
}

export interface DerivedWeakData {
  heap: Uint32Array
  blockPtrs: number[]
  sharedBlockPtrs: number[]
  bytecode: Uint32Array
  bytecodeOffsets: Uint32Array
  states: Uint32Array
}

export interface GpuHeapWordUpdate {
  offset: number
  value1: number
  value2?: number
}

export interface ArrayHeapSlot {
  ptr: number
  size: number
}

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
  braneCount: number
  braneCapacity: number
  heapMirror: Uint32Array
  heapWords: number
  heapCapacityWords: number
  braneBlockPtrs: number[]
  sharedBlockPtrs: number[]
  blockAllocationWordsByPtr: Map<number, number>
  deadHeapWords: number
  bytecodeOffsets: number[]
  bytecodeWordsByBrane: number[]
  bytecodeMirror: Uint32Array
  bytecodeWords: number
  bytecodeCapacityWords: number
  deadBytecodeWords: number
  arraySlots: Map<number, ArrayHeapSlot>
  arrayFreeList: ArrayHeapSlot[]
  stringTableSize: number
  stringRegistryWords: number
  stringRegistryCapacityWords: number
  stringHeapWords: number
  stringHeapCapacityWords: number
  stringTableSnapshot: string[]
}

export interface GpuReadResult {
  changes: WeakChanges
  states: number[]
}

export interface GpuFieldMeta {
  type: number
  size: number
  offset: number
}

export interface GpuHeapInput {
  localFields: [number, number][][]
  braneEntangledMap: number[][]
  entangledFields: Map<string, [number, number][]>
  fieldMeta: Map<number, { fieldType: number; fieldSize: number }>
}

export interface GpuHeapLayout {
  heap: Uint32Array
  blockPtrs: number[]
  sharedBlockPtrs: number[]
  blockSizes: number[]
}

export interface GpuPackContext {
  type: number
  stringTable: string[]
  heap?: Uint32Array
  allocateHeap?: (size: number) => number
  enum?: unknown[]
  subType?: number
}
