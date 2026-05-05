declare module "tiny-sdf" {
  /**
   * Mapbox tiny-sdf: EDT (Felzenszwalb-Huttenlocher) signed-distance-field
   * генератор. Browser-only — рисует glyph в Canvas2D, считает distance.
   */
  export default class TinySDF {
    size: number
    fontSize: number
    buffer: number
    radius: number
    cutoff: number
    fontFamily: string
    constructor(
      fontSize: number,
      buffer: number,
      radius: number,
      cutoff: number,
      fontFamily: string,
    )
    /** Возвращает ImageData размера (fontSize + buffer*2)² с distance в R/G/B. */
    draw(char: string): ImageData
  }
}
