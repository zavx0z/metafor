/**
 * @boundary/matrix/store — string interning для matrix layer.
 *
 * Этот модуль содержит функции для интернирования строк,
 * необходимые для deriveMatrixData.
 *
 * @packageDocumentation
 */

/**
 * Mutable string table.
 */
export type StringTable = string[]

/**
 * String interner interface.
 */
export interface StringInterner {
  intern(value: string): number
}

/**
 * Stored string interner для matrix-local string deduplication.
 */
export class MatrixStringInterner implements StringInterner {
  readonly table: StringTable
  private readonly ids = new Map<string, number>()

  constructor(initial?: StringTable) {
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

/**
 * Создать string interner из таблицы.
 */
export function createMatrixStringInterner(initial?: StringTable): MatrixStringInterner {
  return new MatrixStringInterner(initial)
}

function normalizeString(value: string): string {
  return value.normalize("NFC")
}
