const shortestUnitChordCache = new Map<number, number>()
const normalizeCount = (count: number, minimum: number): number =>
  Number.isFinite(count)
    ? Math.max(minimum, Math.floor(count))
    : minimum

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

export const layoutFieldsInPseudoCircle = (
  count: number,
  markerRadius: number,
): PseudoCircleLayout => {
  const safeCount = normalizeCount(count, 0)
  const safeMarkerRadius = Number.isFinite(markerRadius)
    ? Math.max(0, markerRadius)
    : 0
  if (safeCount === 0) return {points: [], radius: 0}
  const cacheKey = `${safeCount}:${safeMarkerRadius.toPrecision(15)}`
  const cached = pseudoCircleLayoutCache.get(cacheKey)
  if (cached) return cached

  const spacing = safeMarkerRadius * 2
  const limit = Math.ceil(Math.sqrt(safeCount)) * 2 + 1
  const candidates: Array<Readonly<{
    angle: number
    shell: number
    x: number
    y: number
  }>> = []
  for (let row = -limit; row <= limit; row += 1) {
    for (let column = -limit; column <= limit; column += 1) {
      const x = spacing * (column + row / 2)
      const y = spacing * Math.sqrt(3) / 2 * row
      candidates.push({
        angle: Math.atan2(y, x),
        shell: column * column + column * row + row * row,
        x,
        y,
      })
    }
  }
  candidates.sort((left, right) =>
    left.shell - right.shell ||
    left.angle - right.angle
  )
  const selected = candidates.slice(0, safeCount)
  const centerX = selected.reduce((sum, point) => sum + point.x, 0) / safeCount
  const centerY = selected.reduce((sum, point) => sum + point.y, 0) / safeCount
  const points = Object.freeze(selected.map((point) => ({
    x: point.x - centerX,
    y: point.y - centerY,
    z: 0,
  })))
  const radius = points.reduce(
    (maximum, point) => Math.max(maximum, Math.hypot(point.x, point.y)),
    0,
  ) + safeMarkerRadius
  const layout = Object.freeze({points, radius})
  pseudoCircleLayoutCache.set(cacheKey, layout)
  return layout
}

export const distributeOnPseudoSphere = (
  count: number,
  radius: number,
): readonly PseudoSpherePoint[] => {
  const safeCount = normalizeCount(count, 0)
  const safeRadius = Number.isFinite(radius) ? Math.max(0, radius) : 0
  if (safeCount === 0) return []
  const goldenAngle = Math.PI * (3 - Math.sqrt(5))
  return Array.from({length: safeCount}, (_, index) => {
    const z = 1 - 2 * (index + 0.5) / safeCount
    const planarRadius = Math.sqrt(Math.max(0, 1 - z * z))
    const angle = index * goldenAngle
    return {
      x: Math.cos(angle) * planarRadius * safeRadius,
      y: Math.sin(angle) * planarRadius * safeRadius,
      z: z * safeRadius,
    }
  })
}

const shortestUnitChord = (count: number): number => {
  const safeCount = normalizeCount(count, 1)
  if (safeCount === 1) return Number.POSITIVE_INFINITY
  const cached = shortestUnitChordCache.get(safeCount)
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
  shortestUnitChordCache.set(safeCount, minimum)
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
