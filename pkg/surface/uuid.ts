const encodeUtf8 = (value: string): Uint8Array => new TextEncoder().encode(value)

const toHex = (value: number): string => value.toString(16).padStart(2, "0")

const toUuid = (bytes: Uint8Array): string => {
  const next = Uint8Array.from(bytes.slice(0, 16))
  next[6] = (next[6]! & 0x0f) | 0x50
  next[8] = (next[8]! & 0x3f) | 0x80

  const hex = Array.from(next, toHex).join("")
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20, 32)].join("-")
}

const mixUint32 = (state: number, value: number): number => Math.imul(state ^ value, 0x9e3779b1) >>> 0

const hash128 = (input: string): Uint8Array => {
  let h1 = 0x243f6a88
  let h2 = 0x85a308d3
  let h3 = 0x13198a2e
  let h4 = 0x03707344

  for (const byte of encodeUtf8(input)) {
    h1 = mixUint32(h1, byte)
    h2 = mixUint32(h2, h1)
    h3 = mixUint32(h3, h2)
    h4 = mixUint32(h4, h3)
  }

  h1 = mixUint32(h1, h4 >>> 1)
  h2 = mixUint32(h2, h1 >>> 1)
  h3 = mixUint32(h3, h2 >>> 1)
  h4 = mixUint32(h4, h3 >>> 1)

  return new Uint8Array([
    h1 >>> 24,
    h1 >>> 16,
    h1 >>> 8,
    h1,
    h2 >>> 24,
    h2 >>> 16,
    h2 >>> 8,
    h2,
    h3 >>> 24,
    h3 >>> 16,
    h3 >>> 8,
    h3,
    h4 >>> 24,
    h4 >>> 16,
    h4 >>> 8,
    h4,
  ])
}

/**
 * Детерминированно строит UUID из канонического набора строковых частей.
 *
 * Используется для persisted relation entities, у которых нет собственного
 * runtime object id, но которым нужен стабильный UUID внутри relational модели.
 */
export const deriveUuid = (...parts: Array<string | number | null | undefined>): string => {
  const canonical = parts
    .map((part) => (part === null ? "<null>" : part === undefined ? "<undefined>" : String(part)))
    .join("\x1f")
  return toUuid(hash128(canonical))
}
