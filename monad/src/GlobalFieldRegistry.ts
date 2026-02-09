export enum FieldType {
  U32 = 0,
  F32 = 1,
  StringPtr = 2,
}

export interface FieldDefinition {
  id: number
  type: FieldType
}

/**
 * Глобальный реестр полей для сопоставления имени -> {id, type}.
 */
export class GlobalFieldRegistry {
  private static instance: GlobalFieldRegistry | null = null
  private fieldIdCounter = 0
  private fieldsByName = new Map<string, FieldDefinition>()
  private fieldsById = new Map<number, { name: string; type: FieldType }>()

  private constructor() {}

  static getInstance(): GlobalFieldRegistry {
    if (!GlobalFieldRegistry.instance) {
      GlobalFieldRegistry.instance = new GlobalFieldRegistry()
    }
    return GlobalFieldRegistry.instance
  }

  registerField(name: string, type: FieldType): FieldDefinition {
    const existing = this.fieldsByName.get(name)
    if (existing) {
      if (existing.type !== type) {
        throw new Error(`Field '${name}' already registered with different type.`)
      }
      return existing
    }
    const def: FieldDefinition = { id: this.fieldIdCounter++, type }
    this.fieldsByName.set(name, def)
    this.fieldsById.set(def.id, { name, type })
    return def
  }

  getField(name: string): FieldDefinition | undefined {
    return this.fieldsByName.get(name)
  }

  getFieldById(id: number): { name: string; type: FieldType } | undefined {
    return this.fieldsById.get(id)
  }
}

export const META_TYPE_BITS = 8
export const META_SIZE_BITS = 8
export const META_OFFSET_BITS = 16

export function packMeta(type: FieldType, sizeInWords: number, offsetInWords: number): number {
  if (type >= (1 << META_TYPE_BITS)) {
    throw new Error(`Type ${type} does not fit into ${META_TYPE_BITS} bits.`)
  }
  if (sizeInWords >= (1 << META_SIZE_BITS)) {
    throw new Error(`Size ${sizeInWords} does not fit into ${META_SIZE_BITS} bits.`)
  }
  if (offsetInWords >= (1 << META_OFFSET_BITS)) {
    throw new Error(`Offset ${offsetInWords} does not fit into ${META_OFFSET_BITS} bits.`)
  }
  return (offsetInWords << (META_TYPE_BITS + META_SIZE_BITS)) | (sizeInWords << META_TYPE_BITS) | type
}

export function unpackMeta(meta: number): { type: FieldType; sizeInWords: number; offsetInWords: number } {
  const type = meta & ((1 << META_TYPE_BITS) - 1)
  const sizeInWords = (meta >> META_TYPE_BITS) & ((1 << META_SIZE_BITS) - 1)
  const offsetInWords = meta >> (META_TYPE_BITS + META_SIZE_BITS)
  return { type: type as FieldType, sizeInWords, offsetInWords }
}

export function sizeInWordsForType(type: FieldType): number {
  switch (type) {
    case FieldType.F32:
    case FieldType.U32:
      return 1
    case FieldType.StringPtr:
      return 2
    default:
      throw new Error(`Unsupported field type: ${type}`)
  }
}
