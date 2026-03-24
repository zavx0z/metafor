import { createHash } from "node:crypto"

const toUuid = (bytes: Uint8Array): string => {
  const next = Uint8Array.from(bytes.slice(0, 16))
  next[6] = (next[6]! & 0x0f) | 0x50
  next[8] = (next[8]! & 0x3f) | 0x80

  const hex = Buffer.from(next).toString("hex")
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-")
}

/**
 * Детерминированно строит UUID из канонического набора строковых частей.
 *
 * Используется для persisted relation entities, у которых нет собственного runtime object id,
 * но которым нужен стабильный UUID внутри канонической relational модели.
 */
export const deriveUuid = (...parts: Array<string | number | null | undefined>): string => {
  const hash = createHash("sha1")
  hash.update(parts.map((part) => (part === null ? "<null>" : part === undefined ? "<undefined>" : String(part))).join("\x1f"))
  return toUuid(hash.digest())
}
