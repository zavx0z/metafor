/**
 * Параметры подписи на одном уровне глубины.
 *
 * `fontSizeMm` и `surfaceOffsetMm` берутся из {@link LevelLabelSettings}
 * и масштабируются единым `levelScale` из geometry-слоя (без дополнительных surface-скейлов).
 */
export interface LevelLabel {
  depth: number
  isVisible: boolean
  fontSizeMm: number
  surfaceOffsetMm: number
}
