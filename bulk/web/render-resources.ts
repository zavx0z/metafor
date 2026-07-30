export type GeometryInvalidator<Geometry> = (geometry: Geometry) => void

/**
 * Replaces geometry that is owned by exactly one render record.
 * Shared surface geometries use the cache lifecycle below instead.
 */
export const replaceUniqueRenderGeometry = <Geometry>(
  current: Geometry,
  next: Geometry,
  invalidate: GeometryInvalidator<Geometry>,
): Geometry => {
  if (current !== next) invalidate(current)
  return next
}

export const releaseUniqueRenderGeometry = <Geometry>(
  geometry: Geometry,
  invalidate: GeometryInvalidator<Geometry>,
): void => {
  invalidate(geometry)
}

/**
 * Keeps a viewport-local shared geometry while any live or fading object still
 * references it. Every evicted entry releases its renderer-native buffers.
 */
export const pruneUnusedRenderGeometryCache = <Geometry>(
  cache: Map<string, Geometry>,
  used: ReadonlySet<Geometry>,
  invalidate: GeometryInvalidator<Geometry>,
): void => {
  for (const [key, geometry] of cache) {
    if (used.has(geometry)) continue
    invalidate(geometry)
    cache.delete(key)
  }
}

export const releaseRenderGeometryCache = <Geometry>(
  cache: Map<string, Geometry>,
  invalidate: GeometryInvalidator<Geometry>,
): void => {
  for (const geometry of cache.values()) invalidate(geometry)
  cache.clear()
}
