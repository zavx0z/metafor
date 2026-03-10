import type { StringAtlasExport } from "@boundary/atlas"
import { StringAtlas } from "@boundary/atlas"

export type StoredStringTable = string[]

export interface StringInterner {
  intern(value: string): number
}

/**
 * Mutable deduplicated string table owned by Fields.
 */
export class StoredStringInterner implements StringInterner {
  readonly table: StoredStringTable
  private readonly ids = new Map<string, number>()

  constructor(initial?: StoredStringTable) {
    this.table = initial ?? [""]

    for (let index = 0; index < this.table.length; index++) {
      const value = normalizeString(this.table[index]!)
      this.table[index] = value
      this.ids.set(value, index)
    }
  }

  intern(value: string): number {
    const normalized = normalizeString(value)
    const existing = this.ids.get(normalized)
    if (existing !== undefined) {
      return existing
    }

    const id = this.table.length
    this.table.push(normalized)
    this.ids.set(normalized, id)
    return id
  }
}

export function createStoredStringInterner(initial?: StoredStringTable): StoredStringInterner {
  return new StoredStringInterner(initial)
}

/**
 * GPU-local materialization from the canonical stored string table.
 */
export function createStringAtlasExport(stringTable: StoredStringTable): StringAtlasExport {
  const atlas = new StringAtlas()

  for (let index = 0; index < stringTable.length; index++) {
    const value = stringTable[index]!
    const id = atlas.intern(value)
    if (id !== index) {
      throw new Error(`Stored string table lost canonical ordering at index ${index}`)
    }
  }

  return atlas.exportData()
}

function normalizeString(value: string): string {
  return value.normalize("NFC")
}
