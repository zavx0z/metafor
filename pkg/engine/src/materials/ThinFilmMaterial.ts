import {Color} from "../math"
import {Material, type MaterialParameters} from "./Material"

export interface ThinFilmMaterialParameters extends MaterialParameters {
  /**
   * Базовый цвет прозрачной мембраны.
   * @default 0x52d7ff
   */
  color?: number | Color
  /**
   * Цвет Френель-свечения, отражений и бликов.
   * @default 0xdaf8ff
   */
  rimColor?: number | Color
  /**
   * Общая плотность мембраны.
   * @default 0.55
   */
  opacity?: number
  /**
   * Интенсивность свечения края.
   * @default 1.45
   */
  rimStrength?: number
  /**
   * Доля спектрального thin-film сдвига.
   * @default 0.82
   */
  iridescence?: number
  /**
   * Относительная оптическая толщина плёнки.
   * @default 0.72
   */
  filmThickness?: number
}

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value))

const materialColor = (
  value: number | Color | undefined,
  fallback: number,
): Color => value instanceof Color ? value.clone() : new Color(value ?? fallback)

/**
 * Однопроходная прозрачная поверхность с Френель-краем и ограниченной
 * спектральной интерференцией.
 */
export class ThinFilmMaterial extends Material {
  /**
   * Transparent surfaces are submitted after regular scene objects.
   */
  public override readonly isGlassMaterial = true as const
  public color: Color
  public rimColor: Color
  public opacity: number
  public rimStrength: number
  public iridescence: number
  public filmThickness: number

  constructor(parameters: ThinFilmMaterialParameters = {}) {
    super(parameters)
    this.color = materialColor(parameters.color, 0x52d7ff)
    this.rimColor = materialColor(parameters.rimColor, 0xdaf8ff)
    this.opacity = clamp(parameters.opacity ?? 0.55, 0, 1)
    this.rimStrength = clamp(parameters.rimStrength ?? 1.45, 0, 8)
    this.iridescence = clamp(parameters.iridescence ?? 0.82, 0, 1)
    this.filmThickness = clamp(parameters.filmThickness ?? 0.72, 0.05, 4)
  }
}
