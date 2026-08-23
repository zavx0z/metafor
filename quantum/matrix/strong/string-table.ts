import type { StringInterner } from "@matrix/types/strong"

/**
 * Изменяемая дедуплицированная таблица строк, которой владеет strong-слой.
 *
 * Этот модуль отвечает только за канонические string id и их дедупликацию.
 * Производная вычислительная упаковка выводится отдельно.
 */
export class StoredStringInterner implements StringInterner {
  readonly table: string[]
  private readonly ids = new Map<string, number>()

  constructor(initial?: string[]) {
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

export function createStoredStringInterner(initial?: string[]): StoredStringInterner {
  return new StoredStringInterner(initial)
}

function normalizeString(value: string): string {
  return value.normalize("NFC")
}
