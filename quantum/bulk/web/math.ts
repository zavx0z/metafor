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

/** Переводит локальную длину готовой Visual projection в мировой scale. */
export const renderLocalLength = (localLength: number, inheritedAtomScale: number): number =>
  localLength * Math.max(Math.abs(inheritedAtomScale), 1e-6)
