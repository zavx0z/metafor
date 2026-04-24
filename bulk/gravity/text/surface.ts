import { Text, type TextMaterial, type TrueTypeFont } from "@metafor/engine"
import type { FontMetrics } from "./font-metrics"
import { getFontMetrics } from "./font-metrics"
import type { TextExtents } from "./extents"
import { resolveTextExtents } from "./extents"
import type { SurfaceArcLimits, SurfaceCurveRadii } from "./fit"
import { resolveSurfaceFitScale } from "./fit"

/**
 * Готовый surface-label: узел Text и всё, что нужно для per-frame проекции.
 *
 * `initialStencilPositions` / `initialCoverPositions` — снимок координат
 * на момент создания. Per-frame проекция пишет новые координаты в буфер `geometry`
 * через {@link projectSurfaceText} без пересборки Text.
 *
 * `centerXmm` — якорь горизонтального центра текста.
 * Baseline всегда `y = 0` по соглашению Text-геометрии.
 */
export interface SurfaceLabel {
  textNode: Text
  fontMetrics: FontMetrics
  extents: TextExtents
  initialStencilPositions: Float32Array
  initialCoverPositions: Float32Array
  stencilCenterX: number
  coverCenterX: number
  fontSize: number
}

export interface CreateSurfaceLabelOptions {
  text: string
  font: TrueTypeFont
  baseFontSize: number
  material: TextMaterial
  /** Параметры канонической посадки: радиусы и лимиты для выбора итогового fontSize. */
  curve: SurfaceCurveRadii
  limits: SurfaceArcLimits
  /** Минимальный масштаб — ниже не сжимаем (вместо полного схлопывания в точку). */
  minScale: number
}

const cloneInitialPositions = (text: Text): { stencil: Float32Array; cover: Float32Array } => {
  const stencil = text.stencilGeometry.attributes.position?.array ?? new Float32Array(0)
  const cover = text.coverGeometry.attributes.position?.array ?? new Float32Array(0)
  return {
    stencil: new Float32Array(stencil instanceof Float32Array ? stencil : Array.from(stencil as ArrayLike<number>)),
    cover: new Float32Array(cover instanceof Float32Array ? cover : Array.from(cover as ArrayLike<number>)),
  }
}

const measureExtents = (positions: Float32Array, fontMetrics: FontMetrics, fontSize: number): TextExtents =>
  resolveTextExtents(positions, fontMetrics, fontSize)

/**
 * Строит surface-label с автоподбором font-size под canonical посадку.
 *
 * Процедура:
 * 1. Строим Text с `baseFontSize`.
 * 2. Меряем `TextExtents` (width из позиций, ascender/descender из шрифта).
 * 3. Считаем fit scale через {@link resolveSurfaceFitScale} — учитывает ширину, ascender И descender.
 * 4. Если fit scale < 0.999, пересобираем Text с `baseFontSize × fitScale` (single rebuild).
 *
 * Повторные пересборки не нужны: fit scale — единый множитель, который однократно приводит
 * ширину, ascender-арку и descender-арку в допустимые пределы.
 */
export const createSurfaceLabel = ({
  text,
  font,
  baseFontSize,
  material,
  curve,
  limits,
  minScale,
}: CreateSurfaceLabelOptions): SurfaceLabel => {
  const fontMetrics = getFontMetrics(font)

  let textNode = new Text(text, font, baseFontSize, material)
  let initial = cloneInitialPositions(textNode)
  let extents = measureExtents(initial.stencil, fontMetrics, baseFontSize)
  let fontSize = baseFontSize

  const fitScale = resolveSurfaceFitScale({ curve, extents, limits, minScale })
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
