export type StoredStringTable = string[]

export interface StringInterner {
  intern(value: string): number
}

/**
 * Mutable deduplicated string table owned by Fields.
 *
 * GPU-local atlas/UTF-32 packing no longer lives here.
 * This module owns only canonical string IDs and deduplication.
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

function normalizeString(value: string): string {
  return value.normalize("NFC")
}
