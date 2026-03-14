import type { MetaAST } from "@metafor/ast"
import { generateUUID as generateUUIDImpl } from "../identifier.ts"

/**
 * Канонический адрес хаба в MetaFor.
 *
 * Формат: `owner/repo` (например, `zavx0z/metafor`).
 */
export type Address = string

/**
 * Уникальный идентификатор экземпляра атома.
 *
 * Формат: стандартный UUID v4 (36 символов с дефисами).
 */
export type UUID = string

/**
 * Генерирует уникальный UUID для атома.
 *
 * Использует нативный crypto.randomUUID() при наличии,
 * иначе fallback на простую генерацию.
 *
 * @returns уникальный идентификатор атома
 */
export function generateUUID(): UUID {
  return generateUUIDImpl()
}
