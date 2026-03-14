/**
 * Генерирует уникальный UUID для атома.
 *
 * Использует нативный crypto.randomUUID() при наличии,
 * иначе fallback на простую генерациюF.
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

/**
 * Уникальный идентификатор экземпляра атома.
 *
 * UUID используется как стабильный идентификатор атома в runtime,
 * независимый от его положения в дереве (path) и meta-схемы (meta).
 *
 * Формат: стандартный UUID v4 (36 символов с дефисами).
 *
 * Примеры:
 * - `550e8400-e29b-41d4-a716-446655440000`
 * - `a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11`
 */
export type UUID = string