import { Text } from "@metafor/engine"
import type { CreateSurfaceLabelOptions, FontMetrics, SurfaceLabel, TextExtents } from "@metafor/types/bulk/layout"
import { getFontMetrics } from "./font-metrics"
import { resolveTextExtents } from "./extents"
import { resolveSurfaceFitScale } from "./fit"

/**
 * Готовый surface-label: узел Text и всё, что нужно для per-frame деформации.
 *
 * `initialStencilPositions` / `initialCoverPositions` — снимок координат на момент создания.
 * Per-frame деформация пишет новые координаты в буфер `geometry` через {@link bendTextAroundEquator}
 * без пересборки Text.
 */
const cloneInitialPositions = (text: Text): { stencil: Float32Array; cover: Float32Array } => {
  const stencil = text.stencilGeometry.attributes.position?.array ?? new Float32Array(0)
  const cover = text.coverGeometry.attributes.position?.array ?? new Float32Array(0)
  const toFloat32 = (array: ArrayLike<number>): Float32Array =>
    array instanceof Float32Array ? new Float32Array(array) : new Float32Array(Array.from(array))
  return { stencil: toFloat32(stencil), cover: toFloat32(cover) }
}

const measureExtents = (positions: Float32Array, fontMetrics: FontMetrics, fontSize: number): TextExtents =>
  resolveTextExtents(positions, fontMetrics, fontSize)

/**
 * Строит surface-label с автоподбором font-size под canonical радиус параллели.
 *
 * Процедура:
 * 1. Строим Text с `baseFontSize`.
 * 2. Меряем ширину (из позиций) и высоты (из font metrics).
 * 3. Считаем fit scale через {@link resolveSurfaceFitScale} — единый по ширине.
 * 4. Если fit scale < 0.999, пересобираем Text с `baseFontSize × fitScale` (одноразовый rebuild).
 */
export const createSurfaceLabel = ({
  text,
  font,
  baseFontSize,
  material,
  curveRadiusMm,
  limits,
  minScale,
}: CreateSurfaceLabelOptions): SurfaceLabel => {
  const fontMetrics = getFontMetrics(font)

  let textNode = new Text(text, font, baseFontSize, material)
  let initial = cloneInitialPositions(textNode)
  let extents = measureExtents(initial.stencil, fontMetrics, baseFontSize)
  let fontSize = baseFontSize

  const fitScale = resolveSurfaceFitScale({ curveRadiusMm, extents, limits, minScale })
  if (fitScale < 0.999) {
    fontSize = baseFontSize * fitScale
    textNode = new Text(text, font, fontSize, material)
    initial = cloneInitialPositions(textNode)
    extents = measureExtents(initial.stencil, fontMetrics, fontSize)
  }

  const coverExtents = measureExtents(initial.cover, fontMetrics, fontSize)

  return {
    textNode,
    fontMetrics,
    extents,
    initialStencilPositions: initial.stencil,
    initialCoverPositions: initial.cover,
    stencilCenterX: extents.centerXmm,
    coverCenterX: coverExtents.centerXmm,
    fontSize,
  }
}
