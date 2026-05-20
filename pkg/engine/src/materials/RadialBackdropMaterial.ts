import {Color} from "../math"
import {Material, type MaterialParameters} from "./Material"

export interface RadialBackdropGlow {
  color: Color | number | string
  /** Normalized center, 0..1. */
  cx: number
  /** Normalized center, 0..1. */
  cy: number
  /** Normalized radius relative to the shortest side. */
  radius: number
  /** Extra multiplier for color alpha. Default 1. */
  opacity?: number
}

export interface RadialBackdropMaterialParameters extends MaterialParameters {
  width: number
  height: number
  base: Color | number | string
  glowA: RadialBackdropGlow
  glowB: RadialBackdropGlow
}

export class RadialBackdropMaterial extends Material {
  public readonly isRadialBackdropMaterial: true = true

  public width: number
  public height: number
  public base: Color
  public glowA: Color
  public glowB: Color
  public glowAParams: [number, number, number, number]
  public glowBParams: [number, number, number, number]

  constructor(parameters: RadialBackdropMaterialParameters) {
    super(parameters)
    this.width = parameters.width
    this.height = parameters.height
    this.base = colorFrom(parameters.base)
    this.glowA = colorFrom(parameters.glowA.color)
    this.glowB = colorFrom(parameters.glowB.color)
    this.glowA.a *= parameters.glowA.opacity ?? 1
    this.glowB.a *= parameters.glowB.opacity ?? 1
    this.glowAParams = [parameters.glowA.cx, parameters.glowA.cy, parameters.glowA.radius, 0]
    this.glowBParams = [parameters.glowB.cx, parameters.glowB.cy, parameters.glowB.radius, 0]
  }
}

function colorFrom(value: Color | number | string): Color {
  return value instanceof Color ? value.clone() : new Color(value)
}
