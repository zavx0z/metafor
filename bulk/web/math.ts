/**
 * Чистые числовые помощники viewport-а: easing, lerp, расстояние до сегмента.
 *
 * Без runtime-зависимостей и без замыкания над внутренним state. Извлечены
 * из `bulk/web/index.ts` чтобы держать главный entry-файл сжатым.
 */

/** Линейная интерполяция: `from → to` по `progress ∈ [0,1]`. */
export const mixScalar = (from: number, to: number, progress: number): number =>
  from + (to - from) * progress

/** Smoothing-easing — `1 − (1−x)³`. */
export const easeOutCubic = (value: number): number => 1 - Math.pow(1 - value, 3)

/**
 * Лерп-коэффициент для frame-rate-independent сглаживания.
 *
 * Возвращает значение `α ∈ [0,1]`, такое что `current = mix(current, target, α)` за кадр
 * длительности `deltaMs` имеет характерное время `smoothingMs`.
 */
export const computeLerpFactor = (deltaMs: number, smoothingMs: number): number => {
  if (!Number.isFinite(deltaMs) || deltaMs <= 0) return 0
  return 1 - Math.exp(-deltaMs / Math.max(1, smoothingMs))
}

/**
 * Расстояние в пикселях от точки до отрезка `[start, end]` в 2D-проекции.
 *
 * Используется в hover-picking-е для измерения близости курсора к wireframe-ребру.
 */
export const getDistanceToSegmentPx = (
  pointX: number,
  pointY: number,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): number => {
  const dx = endX - startX
  const dy = endY - startY
  const lengthSq = dx * dx + dy * dy
  if (lengthSq <= 1e-6) return Math.hypot(pointX - startX, pointY - startY)
  const projection = Math.max(0, Math.min(1, ((pointX - startX) * dx + (pointY - startY) * dy) / lengthSq))
  const closestX = startX + dx * projection
  const closestY = startY + dy * projection
  return Math.hypot(pointX - closestX, pointY - closestY)
}
