const GOLDEN_RATIO_CONJUGATE = (Math.sqrt(5) - 1) / 2

const hueChannel = (p: number, q: number, input: number): number => {
  let hue = input
  if (hue < 0) hue += 1
  if (hue > 1) hue -= 1
  if (hue < 1 / 6) return p + (q - p) * 6 * hue
  if (hue < 1 / 2) return q
  if (hue < 2 / 3) return p + (q - p) * (2 / 3 - hue) * 6
  return p
}

/** Stable semantic hue keyed only by canonical State identity. */
export const resolveSemanticStateColor = (
  sourceId: number,
): readonly [number, number, number] => {
  const product = Math.abs(sourceId) * GOLDEN_RATIO_CONJUGATE
  const hue = product - Math.floor(product)
  const saturation = 0.72
  const lightness = 0.56
  const q = lightness < 0.5
    ? lightness * (1 + saturation)
    : lightness + saturation - lightness * saturation
  const p = 2 * lightness - q
  return Object.freeze([
    hueChannel(p, q, hue + 1 / 3),
    hueChannel(p, q, hue),
    hueChannel(p, q, hue - 1 / 3),
  ])
}
