import type { BraneValue } from "@boundary/fields"
import { force$ } from "../store"

/**
 * Конвертирует values из Record в кортежи [fieldIndex, value].
 */
export function valuesToTuples(values: Record<string, unknown>): [number, BraneValue][] {
  const tuples: [number, BraneValue][] = []
  for (const [name, value] of Object.entries(values)) {
    const fieldIndex = force$.fieldNameIndex.get(name)
    if (fieldIndex !== undefined) {
      tuples.push([fieldIndex, value as BraneValue])
    }
  }
  return tuples
}
