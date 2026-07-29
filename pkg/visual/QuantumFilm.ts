import {Color, ThinFilmMaterial} from "@metafor/engine"

export type QuantumFilmOptions = Readonly<{
  glowIntensity?: number
  highlightSize?: number
  opacity?: number
}>

export const deriveQuantumFilmPalette = (
  color: Color,
  opacity: number,
): Readonly<{film: Color; glow: Color}> => ({
  film: new Color(
    color.r * 0.42,
    color.g * 0.42,
    color.b * 0.42,
    opacity,
  ),
  glow: new Color(
    color.r + (1 - color.r) * 0.16,
    color.g + (1 - color.g) * 0.16,
    color.b + (1 - color.b) * 0.16,
  ),
})

export const createQuantumFilmMaterial = (
  color: Color,
  {
    glowIntensity = 2.4,
    highlightSize = 0,
    opacity = 0.55,
  }: QuantumFilmOptions = {},
): ThinFilmMaterial => {
  const palette = deriveQuantumFilmPalette(color, opacity)
  return new ThinFilmMaterial({
    color: palette.film,
    rimColor: palette.glow,
    filmThickness: 0.88,
    iridescence: 0.86,
    opacity,
    rimStrength: Math.min(4, 0.75 + glowIntensity * 0.45),
    highlightSize,
  })
}
