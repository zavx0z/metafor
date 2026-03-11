import type { BoundaryStateSnapshot, DeserializedBoundaryState } from "./types"
import { FORMAT_VERSION, MAGIC_NUMBER, SectionType } from "./types"

/**
 * Сериализует boundary-снимок в двоичный формат.
 */
export function serializeBoundaryState(state: BoundaryStateSnapshot): Uint8Array {
  const sections = [
    { type: SectionType.HEAP, data: state.heap },
    { type: SectionType.BYTECODE, data: state.bytecode },
    { type: SectionType.BYTECODE_OFFSETS, data: state.bytecodeOffsets },
    { type: SectionType.STATES, data: state.states },
    { type: SectionType.STRING_REGISTRY, data: state.stringRegistry },
    { type: SectionType.STRING_HEAP, data: state.stringHeap },
    { type: SectionType.FIELDS, data: new Uint8Array(Buffer.from(JSON.stringify(state.fields))) },
    { type: SectionType.METADATA, data: new Uint8Array(Buffer.from(JSON.stringify(state.metadata))) },
  ]

  const headerSize = 12
  const descriptorSize = 12
  const descriptorsSize = sections.length * descriptorSize
  let dataOffset = headerSize + descriptorsSize

  const descriptors: Array<{ type: number; offset: number; size: number }> = []
  const dataBuffers: Uint8Array[] = []

  for (const section of sections) {
    const data = section.data as Uint32Array | Uint8Array
    const byteLength = data.byteLength
    descriptors.push({
      type: section.type,
      offset: dataOffset,
      size: byteLength,
    })
    dataBuffers.push(new Uint8Array(data.buffer, data.byteOffset, byteLength))
    dataOffset += byteLength
  }

  const buffer = new Uint8Array(dataOffset)
  const view = new DataView(buffer.buffer)

  view.setUint32(0, MAGIC_NUMBER, true)
  view.setUint32(4, FORMAT_VERSION, true)
  view.setUint32(8, sections.length, true)

  for (let index = 0; index < descriptors.length; index++) {
    const descriptor = descriptors[index]!
    const offset = headerSize + index * descriptorSize
    view.setUint32(offset, descriptor.type, true)
    view.setUint32(offset + 4, descriptor.offset, true)
    view.setUint32(offset + 8, descriptor.size, true)
  }

  let writeOffset = headerSize + descriptorsSize
  for (const data of dataBuffers) {
    buffer.set(data, writeOffset)
    writeOffset += data.length
  }

  return buffer
}

/**
 * Восстанавливает boundary-снимок из двоичного формата.
 */
export function deserializeBoundaryState(data: Uint8Array): DeserializedBoundaryState {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)

  const magic = view.getUint32(0, true)
  const version = view.getUint32(4, true)
  const sectionCount = view.getUint32(8, true)

  if (magic !== MAGIC_NUMBER) {
    throw new Error(`Invalid magic number: ${magic.toString(16)}, expected ${MAGIC_NUMBER.toString(16)}`)
  }

  if (version !== FORMAT_VERSION) {
    throw new Error(`Unsupported version: ${version}, expected ${FORMAT_VERSION}`)
  }

  const headerSize = 12
  const descriptorSize = 12
  const sections = new Map<number, { offset: number; size: number }>()

  for (let index = 0; index < sectionCount; index++) {
    const offset = headerSize + index * descriptorSize
    const type = view.getUint32(offset, true)
    const dataOffset = view.getUint32(offset + 4, true)
    const size = view.getUint32(offset + 8, true)
    sections.set(type, { offset: dataOffset, size })
  }

  const getUint32Section = (type: SectionType): Uint32Array => {
    const section = sections.get(type)
    if (!section) {
      throw new Error(`Missing section: ${type}`)
    }
    return new Uint32Array(data.buffer, data.byteOffset + section.offset, section.size / 4)
  }

  const getJsonSection = <T>(type: SectionType): T => {
    const section = sections.get(type)
    if (!section) {
      throw new Error(`Missing section: ${type}`)
    }
    const bytes = data.slice(section.offset, section.offset + section.size)
    return JSON.parse(new TextDecoder().decode(bytes)) as T
  }

  return {
    heap: getUint32Section(SectionType.HEAP),
    bytecode: getUint32Section(SectionType.BYTECODE),
    bytecodeOffsets: getUint32Section(SectionType.BYTECODE_OFFSETS),
    states: getUint32Section(SectionType.STATES),
    stringRegistry: getUint32Section(SectionType.STRING_REGISTRY),
    stringHeap: getUint32Section(SectionType.STRING_HEAP),
    fields: getJsonSection<unknown[]>(SectionType.FIELDS),
    metadata: getJsonSection<{ arrayReserveSize: number; heapAllocOffset: number; braneBlockPtrs: number[] }>(SectionType.METADATA),
  }
}
