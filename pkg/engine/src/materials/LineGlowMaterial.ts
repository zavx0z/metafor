import { Color } from "../math"
import { LineBasicMaterial, type LineBasicMaterialParameters } from "./LineBasicMaterial"

/**
 * Параметры для создания {@link LineGlowMaterial}.
 */
export interface LineGlowMaterialParameters extends LineBasicMaterialParameters {
  /**
   * Интенсивность свечения. Управляет яркостью и заметностью свечения.
   * @default 2.0
   */
  glowIntensity?: number
  
  /**
   * Цвет свечения. Если не указан, используется основной цвет материала.
   * @default undefined (используется основной цвет)
   */
  glowColor?: number | Color

  /**
   * GPU-side luminance multiplier. The neutral value preserves ordinary lines.
   * @default 1.0
   */
  luminanceBoost?: number

  /**
   * Phase for an optional static spatial shimmer pattern.
   * @default 0.0
   */
  shimmerPhase?: number

  /**
   * Strength of an optional static spatial shimmer pattern.
   * @default 0.0
   */
  shimmerAmount?: number
}

/**
 * Светящийся материал для линий с эффектом свечения.
 * Линии остаются яркими на расстоянии и не тускнеют так сильно, как обычные линии.
 */
export class LineGlowMaterial extends LineBasicMaterial {
  /** @default 2.0 */
  public glowIntensity: number
  
  /** @default undefined (используется основной цвет) */
  public glowColor: Color | null

  /** @default 1.0 */
  public luminanceBoost: number

  /** @default 0.0 */
  public shimmerPhase: number

  /** @default 0.0 */
  public shimmerAmount: number

  /**
   * @param parameters - Параметры материала.
   */
  constructor(parameters: LineGlowMaterialParameters = {}) {
    super(parameters)
    
    this.glowIntensity = parameters.glowIntensity ?? 2.0
    this.luminanceBoost = parameters.luminanceBoost ?? 1.0
    this.shimmerPhase = parameters.shimmerPhase ?? 0.0
    this.shimmerAmount = parameters.shimmerAmount ?? 0.0
    
    if (parameters.glowColor) {
      if (parameters.glowColor instanceof Color) {
        this.glowColor = parameters.glowColor.clone()
      } else {
        this.glowColor = new Color(parameters.glowColor)
      }
    } else {
      this.glowColor = null
    }
  }
}
