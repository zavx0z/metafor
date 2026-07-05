export type MatrixFieldType = 0 | 1 | 2 | 3 | 4

export type MatrixBraneValue =
  | number
  | boolean
  | string
  | null
  | number[]
  | boolean[]
  | string[]

export type MatrixConditionOperator = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11

export type MatrixConditionScalarValue = number | boolean | string | null

export interface MatrixConditionOperators {
  null?: boolean
  eq?: MatrixConditionScalarValue
  ne?: MatrixConditionScalarValue
  neq?: MatrixConditionScalarValue
  notEq?: MatrixConditionScalarValue
  gt?: MatrixConditionScalarValue
  lt?: MatrixConditionScalarValue
  gte?: MatrixConditionScalarValue
  lte?: MatrixConditionScalarValue
  in?: MatrixConditionScalarValue[]
  notIn?: MatrixConditionScalarValue[]
  include?: MatrixConditionScalarValue
  notInclude?: MatrixConditionScalarValue
  length?: MatrixConditionScalarValue | MatrixConditionOperators
  isEmpty?: boolean
  notGt?: MatrixConditionScalarValue
  notGte?: MatrixConditionScalarValue
  notLt?: MatrixConditionScalarValue
  notLte?: MatrixConditionScalarValue
  between?: [MatrixConditionScalarValue, MatrixConditionScalarValue]
}

export type MatrixConditionValue = MatrixConditionScalarValue | MatrixConditionOperators

export interface NamedSuperposition {
  [state: string]: Record<string, unknown> | null
}

export interface MatrixParsedCheck {
  op: MatrixConditionOperator
  val: MatrixConditionScalarValue | MatrixConditionScalarValue[]
}

export type MatrixScalarValue = number | boolean
export type MatrixValue = MatrixScalarValue | MatrixScalarValue[]

export type MatrixCollapse = [number, Record<number, MatrixConditionValue>] | null

export interface MatrixFieldRecord {
  type: MatrixFieldType
  elementType?: "number" | "string" | "boolean"
  enum?: unknown[]
}

export interface MatrixInputBrane {
  values: [number, MatrixBraneValue][]
  state: number
  collapses: MatrixCollapse[][]
}

export interface MatrixInputData {
  fields?: MatrixFieldRecord[]
  branes?: MatrixInputBrane[]
  entanglement?: PreparedEntanglementProjection
  stateNames?: string[][]
}

export interface FlattenedFieldChecks {
  fieldIndex: number
  checks: MatrixParsedCheck[]
}

export interface FlattenedTransition {
  targetState: number | null
  conditions: FlattenedFieldChecks[]
}

export interface FlattenedBraneInput {
  values: [number, MatrixBraneValue][]
  state: number
  transitions: FlattenedTransition[][]
  stateNames: string[]
}

export interface FlattenedMatrixInput {
  fields: MatrixFieldRecord[]
  branes: FlattenedBraneInput[]
  entanglement?: PreparedEntanglementProjection
}

export interface MatrixFieldValueRecord {
  fieldIndex: number
  value: MatrixValue
}

export interface MatrixConditionRecord {
  fieldIndex: number
  op: MatrixConditionOperator
  value: MatrixScalarValue | MatrixScalarValue[]
}

export interface MatrixTransitionRecord {
  targetState: number
  conditionOffset: number
  conditionCount: number
}

export interface MatrixStateRecord {
  transitionOffset: number
  transitionCount: number
}

export interface MatrixSharedBlockRecord {
  valueOffset: number
  valueCount: number
}

export interface MatrixBraneRecord {
  localValueOffset: number
  localValueCount: number
  sharedBlockRefOffset: number
  sharedBlockRefCount: number
  stateOffset: number
  stateCount: number
  lock: boolean
}

export type MatrixFieldStorageLocation =
  | { scope: "local"; record: MatrixFieldValueRecord }
  | { scope: "shared"; blockIndex: number; record: MatrixFieldValueRecord }

export interface MatrixData {
  fields: MatrixFieldRecord[]
  stringTable: string[]
  sharedBlocks: MatrixSharedBlockRecord[]
  sharedValues: MatrixFieldValueRecord[]
  branes: MatrixBraneRecord[]
  braneValues: MatrixFieldValueRecord[]
  braneSharedBlockRefs: number[]
  stateTable: MatrixStateRecord[]
  transitions: MatrixTransitionRecord[]
  conditions: MatrixConditionRecord[]
  states: number[]
  stateNames: string[][]
}

export interface MatrixStore extends MatrixData {
  getField(braneIndex: number, fieldIndex: number): MatrixFieldValueRecord | undefined
  getFieldLocation(braneIndex: number, fieldIndex: number): MatrixFieldStorageLocation | undefined
  getFieldValue(braneIndex: number, fieldIndex: number): MatrixValue | undefined
  getState(braneIndex: number, stateIndex: number): MatrixStateRecord | undefined
  getStateName(braneIndex: number, stateIndex: number): string | undefined
}

export interface MatrixRuntimeBrane {
  values: Array<[number, MatrixBraneValue]>
  state: number
  collapses: MatrixCollapse[][]
}

export interface MatrixRuntimeData {
  fields: MatrixFieldRecord[]
  branes: MatrixRuntimeBrane[]
  stateNames: string[][]
}

export interface MatrixRuntimeSnapshot {
  version: 1
  runtime: {
    actorIdByBraneIndex: number[]
    braneIndexByActorId: Array<[actorId: number, braneIndex: number]>
    wimpSrcByActorId: Array<[actorId: number, wimpSrc: string]>
    actorIdsByWimpSrc: Array<[wimpSrc: string, actorIds: number[]]>
    runtimeFieldIndexByActorFieldId: Array<[actorId: number, fieldId: number, runtimeFieldIndex: number]>
  }
  data: MatrixRuntimeData
  strong: {
    runtimeFieldIndexByWimpFieldId: Array<[number, number]>
    wimpFieldIdsByRuntimeFieldIndex: number[][]
    braneIndexByWimpFieldId: Array<[number, number]>
    topologyWimpFieldIds: number[]
    topologyActorFieldIds: Array<[actorId: number, fieldId: number]>
  }
  weak: {
    stateMetaStateIdsByBraneIndex: number[][]
    stateHasProcessByBraneIndex: boolean[][]
  }
}

export interface MatrixGravityStore {
  activeActorIds: number[]
  actorIdToBraneIndex: Map<number, number>
  braneIndexToActorId: number[]
  wimpSrcByActorId: Map<number, string>
  actorIdsByWimpSrc: Map<string, number[]>
  structuralDirty: boolean
  hasActor(actorId: number): boolean
  getBraneIndexByActorId(actorId: number): number | undefined
  getActorId(braneIndex: number): number | undefined
  getWimpSrcByActorId(actorId: number): string | undefined
  getActorIdsByWimpSrc(wimpSrc: string): number[]
}

export interface MatrixEntanglementMapping {
  localFields: [number, unknown][][]
  braneEntangledMap: number[][]
  entangledFields: Map<string, [number, unknown][]>
}

export interface PreparedEntanglementBlock {
  key?: string
  braneIndices: number[]
  fields: PreparedEntanglementField[]
}

export interface PreparedEntanglementProjection {
  blocks: PreparedEntanglementBlock[]
}

export interface PreparedEntanglementField {
  fieldIndex: number
  fieldName: string
  payloadIds: string[]
  semanticKeys: string[]
  representativeBraneIndex?: number
}

export interface MatrixStrongStore {
  runtimeFieldIndexByWimpFieldId: Map<number, number>
  wimpFieldIdsByRuntimeFieldIndex: number[][]
  braneIndexByWimpFieldId: Map<number, number>
  topologyWimpFieldIds: Set<number>
  runtimeFieldIndexByActorFieldId: Map<string, number>
  actorFieldIdsByRuntimeFieldIndex: Array<Array<[actorId: number, fieldId: number]>>
  topologyActorFieldIds: Set<string>
  reset(): void
}

export interface StringInterner {
  intern(value: string): number
}

export interface MatrixConditionInstruction {
  fieldType: number
  fieldIndex: number
  op: number
  valEncoded: number
}

export interface MatrixCompiledConditionsResult {
  instructions: MatrixConditionInstruction[]
  heap: number[]
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

export interface ConvertedSuperposition {
  states: string[]
  matrix: {
    transitions: Array<Array<MatrixCollapse>>
  }
}

export type WeakBackendPreference = "cpu" | "gpu" | "auto"
export type WeakMode = "cpu" | "gpu"
export type WeakStepMode = 1 | 2

export interface MaybeGpuNavigator {
  gpu?: {
    requestAdapter: () => Promise<GPUAdapter | null>
  }
}

export type WeakHeapUpdate =
  | {
      kind: "field"
      braneIndex: number
      fieldIndex: number
    }
  | {
      kind: "lock"
      braneIndex: number
      value: boolean
    }

export interface WeakChanges extends Array<[number, number]> {}

export interface WeakRuntime {
  step(mode?: WeakStepMode): void
  readChanges(): Promise<WeakChanges>
  heapUpdate(updates: WeakHeapUpdate[]): void
  clear(): void
  statesSnapshot(): number[]
}

export interface WeakRuntimeSelection {
  mode: WeakMode
  runtime: WeakRuntime
}

export interface WeakStore {
  runtime: WeakRuntime | null
  operationMutex: Promise<void> | null
  initialized: boolean
  mode: WeakMode
  matrix$: MatrixStore | null
  stateMetaStateIdsByBraneIndex: number[][]
  stateHasProcessByBraneIndex: boolean[][]
  reset(): void
}

export interface WeakStateExport {
  heap: Uint32Array
  blockPtrs: number[]
  heapAllocOffset: number
  arrayReserveSize: number
  arrayDataInvalidated: boolean
}

export interface CpuRuntimeState {
  bufferedChanges: WeakChanges
}

export interface CpuRuntimeContext {
  store$: MatrixStore
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
  heapMirror: Uint32Array
  heapWords: number
  heapCapacityWords: number
  braneBlockPtrs: number[]
  sharedBlockPtrs: number[]
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
