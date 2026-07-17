import {Color} from "@metafor/engine"

export interface UITextureParameters {
  widthMm: number
  heightMm: number
  pixelWidth: number
  pixelHeight: number
  background?: Color | number
}

/**
 * Offscreen UI target for rendering a fixed logical UI grid into a texture.
 *
 * The GPU render-to-texture backend is intentionally separate from semantic
 * elements. Elements draw to UiSurface; this target describes where that
 * surface output will be consumed as a material texture.
 */
export class UITexture {
  public readonly isUITexture: true = true
  public widthMm: number
  public heightMm: number
  public pixelWidth: number
  public pixelHeight: number
  public background: Color | number | undefined
  public version = 0
  #dirty = true

  constructor(params: UITextureParameters) {
    this.widthMm = params.widthMm
    this.heightMm = params.heightMm
    this.pixelWidth = params.pixelWidth
    this.pixelHeight = params.pixelHeight
    this.background = params.background
  }

  public resize(params: Partial<Pick<UITextureParameters, "widthMm" | "heightMm" | "pixelWidth" | "pixelHeight">>): void {
    this.widthMm = params.widthMm ?? this.widthMm
    this.heightMm = params.heightMm ?? this.heightMm
    this.pixelWidth = params.pixelWidth ?? this.pixelWidth
    this.pixelHeight = params.pixelHeight ?? this.pixelHeight
    this.requestRender()
  }

  public requestRender(): void {
    this.#dirty = true
    this.version += 1
  }

  public consumeDirty(): boolean {
    const dirty = this.#dirty
    this.#dirty = false
    return dirty
  }

  public get dirty(): boolean {
    return this.#dirty
  }

  public get unitsPerPixel(): number {
    return this.widthMm / this.pixelWidth
  }

  public get verticalUnitsPerPixel(): number {
    return this.heightMm / this.pixelHeight
  }
}
