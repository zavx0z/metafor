/**
 * Бинарная сериализация Matrix.
 *
 * @packageDocumentation
 */

import type { MatrixState, DeserializedState } from "./format.t"
import { MAGIC_NUMBER, FORMAT_VERSION, SectionType } from "./format.t"

/**
 * Сериализует состояние Matrix в бинарный формат.
 *
 * @param state - Состояние для сериализации
 * @returns Uint8Array с бинарными данными
 */
export function serializeMatrix(state: MatrixState): Uint8Array {
  // Подготовка данных
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

  // Расчёт смещений
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

  // Создание буфера
  const totalSize = dataOffset
  const buffer = new Uint8Array(totalSize)
  const view = new DataView(buffer.buffer)

  // Запись заголовка
  view.setUint32(0, MAGIC_NUMBER, true)
  view.setUint32(4, FORMAT_VERSION, true)
  view.setUint32(8, sections.length, true)

  // Запись дескрипторов
  for (let i = 0; i < descriptors.length; i++) {
    const desc = descriptors[i]!
    const offset = headerSize + i * descriptorSize
    view.setUint32(offset, desc.type, true)
    view.setUint32(offset + 4, desc.offset, true)
    view.setUint32(offset + 8, desc.size, true)
  }

  // Запись данных
  let writeOffset = headerSize + descriptorsSize
  for (const data of dataBuffers) {
    buffer.set(data, writeOffset)
    writeOffset += data.length
  }

  return buffer
}

/**
 * Десериализует бинарные данные в состояние Matrix.
 *
 * @param data - Бинарные данные
 * @returns DeserializedState
 * @throws {Error} Если файл повреждён или версия несовместима
 */
export function deserializeMatrix(data: Uint8Array): DeserializedState {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)

  // Чтение заголовка
  const magic = view.getUint32(0, true)
  const version = view.getUint32(4, true)
  const sectionCount = view.getUint32(8, true)

  if (magic !== MAGIC_NUMBER) {
    throw new Error(`Invalid magic number: ${magic.toString(16)}, expected ${MAGIC_NUMBER.toString(16)}`)
  }

  if (version !== FORMAT_VERSION) {
    throw new Error(`Unsupported version: ${version}, expected ${FORMAT_VERSION}`)
  }

  // Чтение дескрипторов
  const headerSize = 12
  const descriptorSize = 12
  const sections = new Map<number, { offset: number; size: number }>()

  for (let i = 0; i < sectionCount; i++) {
    const offset = headerSize + i * descriptorSize
    const type = view.getUint32(offset, true)
    const dataOffset = view.getUint32(offset + 4, true)
    const size = view.getUint32(offset + 8, true)
    sections.set(type, { offset: dataOffset, size })
  }

  // Чтение данных
  const getUint32Section = (type: SectionType): Uint32Array => {
    const section = sections.get(type)
    if (!section) throw new Error(`Missing section: ${type}`)
    return new Uint32Array(data.buffer, data.byteOffset + section.offset, section.size / 4)
  }

  const getJsonSection = <T>(type: SectionType): T => {
    const section = sections.get(type)
    if (!section) throw new Error(`Missing section: ${type}`)
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
