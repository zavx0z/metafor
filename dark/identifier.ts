import type { UUID } from "@dark/types/dark"

/**
 * Генерирует уникальный UUID для атома.
 *
 * Использует нативный crypto.randomUUID() при наличии,
 * иначе fallback на простую генерацию.
 *
 * @returns уникальный идентификатор атома
 */
export function generateUUID(): UUID {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  // Fallback для сред без crypto.randomUUID
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === "x" ? r : (r & 0x3) | 0x8
    return v.toString(16)
  }) as UUID
}
