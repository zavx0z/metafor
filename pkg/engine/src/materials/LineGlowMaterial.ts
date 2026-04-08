import { Color } from "../math/Color"
import { LineBasicMaterial, LineBasicMaterialParameters } from "./LineBasicMaterial"

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

  /**
   * @param parameters - Параметры материала.
   */
  constructor(parameters: LineGlowMaterialParameters = {}) {
    super(parameters)
    
    this.glowIntensity = parameters.glowIntensity ?? 2.0
    
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
