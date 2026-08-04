import {Color} from "../math"
import {Material, type MaterialParameters} from "./Material"

export interface HolographicMaterialParameters extends MaterialParameters {
  /**
   * Базовый цвет прозрачной голограммы.
   * @default 0x52d7ff
   */
  color?: number | string | Color
  /**
   * Общая плотность поверхности.
   * @default 0.42
   */
  opacity?: number
  /**
   * Интенсивность Френель-контура.
   * @default 1.8
   */
  rimStrength?: number
  /**
   * Частота проекционных scan-lines на единицу мирового пространства.
   * @default 0.65
   */
  scanDensity?: number
  /**
   * Резкость scan-lines в нормализованном диапазоне.
   * @default 0.72
   */
  scanSharpness?: number
  /**
   * Доля разрывов и неоднородности светового рисунка.
   * @default 0.78
   */
  irregularity?: number
  /**
   * Пространственный сдвиг рисунка для соседних объектов.
   * @default 0
   */
  patternOffset?: number
  /**
   * Радиус центра кольцевой полосы. Ноль отключает контур полосы.
   * @default 0
   */
  bandRadius?: number
  /**
   * Половина ширины кольцевой полосы.
   * @default 0
   */
  bandHalfWidth?: number
}

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value))

const materialColor = (
  value: number | string | Color | undefined,
  fallback: number,
): Color => value instanceof Color ? value.clone() : new Color(value ?? fallback)

/**
 * Однопроходная прозрачная голограмма: световой контур и статические
 * world-space scan-lines без текстур, постобработки и временной анимации.
 */
export class HolographicMaterial extends Material {
  public override readonly isGlassMaterial = true as const
  public color: Color
  public opacity: number
  public rimStrength: number
  public scanDensity: number
  public scanSharpness: number
  public irregularity: number
  public patternOffset: number
  public bandRadius: number
  public bandHalfWidth: number

  constructor(parameters: HolographicMaterialParameters = {}) {
    super(parameters)
    this.color = materialColor(parameters.color, 0x52d7ff)
    this.opacity = clamp(parameters.opacity ?? 0.42, 0, 1)
    this.rimStrength = clamp(parameters.rimStrength ?? 1.8, 0, 8)
    this.scanDensity = clamp(parameters.scanDensity ?? 0.65, 0.05, 8)
    this.scanSharpness = clamp(parameters.scanSharpness ?? 0.72, 0, 1)
    this.irregularity = clamp(parameters.irregularity ?? 0.78, 0, 1)
    this.patternOffset = parameters.patternOffset ?? 0
    this.bandRadius = Math.max(0, parameters.bandRadius ?? 0)
    this.bandHalfWidth = Math.max(0, parameters.bandHalfWidth ?? 0)
  }
}
