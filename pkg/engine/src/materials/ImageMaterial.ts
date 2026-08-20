import {Color} from "../math/Color"
import { Material, type MaterialParameters } from "./Material"

export type ImageFit = "cover" | "contain"

export interface ImageViewBox {
  x: number
  y: number
  w: number
  h: number
}

export interface ImageMaterialParameters extends MaterialParameters {
  src: string
  fit?: ImageFit
  opacity?: number
  tint?: Color
  viewBox?: ImageViewBox
  boxAspect?: number
  onTextureChange?: () => void
}

export class ImageMaterial extends Material {
  public readonly isImageMaterial: true = true
  public src: string
  public fit: ImageFit
  public opacity: number
  public tint: Color
  public viewBox: ImageViewBox
  public boxAspect: number
  public clipBounds: [number, number, number, number] | null = null
  public onTextureChange: (() => void) | undefined

  constructor(parameters: ImageMaterialParameters) {
    super(parameters)
    this.src = parameters.src
    this.fit = parameters.fit ?? "cover"
    this.opacity = parameters.opacity ?? 1
    const tint = parameters.tint ?? new Color(1, 1, 1, 1)
    this.tint = new Color(tint.r, tint.g, tint.b, tint.a)
    this.viewBox = parameters.viewBox ?? { x: 0, y: 0, w: 1, h: 1 }
    this.boxAspect = parameters.boxAspect ?? 1
    this.onTextureChange = parameters.onTextureChange
  }
}
