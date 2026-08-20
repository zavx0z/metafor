import {Material, type MaterialParameters} from "./Material"
import {Color} from "../math/Color"

export type ColorPickerMaterialMode = "wheel" | "value" | "alpha" | "swatch"

export interface ColorPickerMaterialParameters extends MaterialParameters {
  width: number
  height: number
  mode: ColorPickerMaterialMode
  hue: number
  saturation: number
  value: number
  alpha: number
  opacity?: number
  checkerPrimary: Color
  checkerSecondary: Color
  checkerSize: number
}

/** One texture-free analytical quad used by low-level color picker planes. */
export class ColorPickerMaterial extends Material {
  public readonly isColorPickerMaterial: true = true

  public width: number
  public height: number
  public mode: ColorPickerMaterialMode
  public hue: number
  public saturation: number
  public value: number
  public alpha: number
  public opacity: number
  public checkerPrimary: Color
  public checkerSecondary: Color
  public checkerSize: number
  public clipBounds: [number, number, number, number] | null = null

  constructor(parameters: ColorPickerMaterialParameters) {
    super(parameters)
    this.width = finiteNonNegative(parameters.width)
    this.height = finiteNonNegative(parameters.height)
    this.mode = parameters.mode
    this.hue = wrapUnit(parameters.hue)
    this.saturation = clampUnit(parameters.saturation)
    this.value = clampUnit(parameters.value)
    this.alpha = clampUnit(parameters.alpha)
    this.opacity = clampUnit(parameters.opacity ?? 1)
    this.checkerPrimary = parameters.checkerPrimary.clone()
    this.checkerSecondary = parameters.checkerSecondary.clone()
    this.checkerSize = finiteNonNegative(parameters.checkerSize)
  }
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0
}

function clampUnit(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0
}

function wrapUnit(value: number): number {
  if (!Number.isFinite(value)) return 0
  return ((value % 1) + 1) % 1
}
