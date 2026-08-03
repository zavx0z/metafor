const shortestUnitChordCache = new Map<number, number>()
const MAX_LAYOUT_CACHE_ENTRIES = 128

/** Upper bound for deterministic in-process layout work. */
export const MAX_FIELD_LAYOUT_COUNT = 4_096

const normalizeCount = (count: number, minimum: number): number => {
  if (Number.isNaN(count)) return minimum
  if (!Number.isFinite(count)) {
    throw new RangeError("Field layout count must be finite")
  }
  const normalized = Math.max(minimum, Math.floor(count))
  if (normalized > MAX_FIELD_LAYOUT_COUNT) {
    throw new RangeError(
      `Field layout count ${normalized} exceeds ${MAX_FIELD_LAYOUT_COUNT}`,
    )
  }
  return normalized
}

export type PseudoSpherePoint = Readonly<{
  x: number
  y: number
  z: number
}>

export type PseudoCircleLayout = Readonly<{
  points: readonly PseudoSpherePoint[]
  radius: number
}>

const pseudoCircleLayoutCache = new Map<string, PseudoCircleLayout>()
const EMPTY_PSEUDO_SPHERE = Object.freeze(
  [],
) as readonly PseudoSpherePoint[]
const EMPTY_PSEUDO_CIRCLE = Object.freeze({
  points: Object.freeze([]),
  radius: 0,
}) satisfies PseudoCircleLayout

const retainRecent = <Key, Value>(
  cache: Map<Key, Value>,
  key: Key,
  value: Value,
): void => {
  cache.set(key, value)
  if (cache.size <= MAX_LAYOUT_CACHE_ENTRIES) return
  const oldestKey = cache.keys().next().value
  if (oldestKey !== undefined) cache.delete(oldestKey)
}

const readRecent = <Key, Value>(
  cache: Map<Key, Value>,
  key: Key,
): Value | undefined => {
  const value = cache.get(key)
  if (value === undefined) return undefined
  cache.delete(key)
  cache.set(key, value)
  return value
}

export const layoutFieldsInPseudoCircle = (
  count: number,
  markerRadius: number,
): PseudoCircleLayout => {
  const safeCount = normalizeCount(count, 0)
  const safeMarkerRadius = Number.isFinite(markerRadius)
    ? Math.max(0, markerRadius)
    : 0
  if (safeCount === 0) return EMPTY_PSEUDO_CIRCLE
  const cacheKey = `${safeCount}:${String(safeMarkerRadius)}`
  const cached = readRecent(pseudoCircleLayoutCache, cacheKey)
  if (cached) return cached

  const outerCount = safeCount - 1
  const ringRadius = outerCount === 0
    ? 0
    : Math.max(
        safeMarkerRadius * 2,
        outerCount === 1
          ? 0
          : safeMarkerRadius / Math.sin(Math.PI / outerCount),
      )
  const angleStep = outerCount === 0 ? 0 : Math.PI * 2 / outerCount
  const zeroThreshold = ringRadius * Number.EPSILON * 4
  const points = Object.freeze(Array.from(
    {length: safeCount},
    (_, index): PseudoSpherePoint => {
      if (index === 0) return Object.freeze({x: 0, y: 0, z: 0})
      const angle = -Math.PI / 2 + angleStep * (index - 1)
      const x = Math.cos(angle) * ringRadius
      const y = Math.sin(angle) * ringRadius
      return Object.freeze({
        x: Math.abs(x) <= zeroThreshold ? 0 : x,
        y: Math.abs(y) <= zeroThreshold ? 0 : y,
        z: 0,
      })
    },
  ))
  const radius = ringRadius + safeMarkerRadius
  const layout: PseudoCircleLayout = Object.freeze({points, radius})
  retainRecent(pseudoCircleLayoutCache, cacheKey, layout)
  return layout
}

export const distributeOnPseudoSphere = (
  count: number,
  radius: number,
): readonly PseudoSpherePoint[] => {
  const safeCount = normalizeCount(count, 0)
  const safeRadius = Number.isFinite(radius) ? Math.max(0, radius) : 0
  if (safeCount === 0) return EMPTY_PSEUDO_SPHERE
  const goldenAngle = Math.PI * (3 - Math.sqrt(5))
  return Object.freeze(Array.from({length: safeCount}, (_, index) => {
    const z = 1 - 2 * (index + 0.5) / safeCount
    const planarRadius = Math.sqrt(Math.max(0, 1 - z * z))
    const angle = index * goldenAngle
    return Object.freeze({
      x: Math.cos(angle) * planarRadius * safeRadius,
      y: Math.sin(angle) * planarRadius * safeRadius,
      z: z * safeRadius,
    })
  }))
}

const shortestUnitChord = (count: number): number => {
  const safeCount = normalizeCount(count, 1)
  if (safeCount === 1) return Number.POSITIVE_INFINITY
  const cached = readRecent(shortestUnitChordCache, safeCount)
  if (cached !== undefined) return cached
  const points = distributeOnPseudoSphere(safeCount, 1)
  let minimum = Number.POSITIVE_INFINITY
  for (let left = 0; left < points.length; left += 1) {
    const from = points[left]!
    for (let right = left + 1; right < points.length; right += 1) {
      const to = points[right]!
      minimum = Math.min(
        minimum,
        Math.hypot(from.x - to.x, from.y - to.y, from.z - to.z),
      )
    }
  }
  retainRecent(shortestUnitChordCache, safeCount, minimum)
  return minimum
}

export const pseudoSphereRadiusForFieldCount = (
  count: number,
  markerRadius: number,
): number => {
  const safeCount = normalizeCount(count, 1)
  const safeMarkerRadius = Number.isFinite(markerRadius)
    ? Math.max(0, markerRadius)
    : 0
  if (safeCount === 1) return 0
  return safeMarkerRadius * 2 / shortestUnitChord(safeCount)
}
