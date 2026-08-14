/** Constant-time comparison for local bearer and control tokens. */
export function safeEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left)
  const rightBytes = new TextEncoder().encode(right)
  if (leftBytes.length !== rightBytes.length) return false
  let mismatch = 0
  for (let index = 0; index < leftBytes.length; index += 1) mismatch |= leftBytes[index]! ^ rightBytes[index]!
  return mismatch === 0
}
