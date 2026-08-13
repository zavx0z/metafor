import {Color} from "@metafor/engine"
import {palette} from "@ui/elements"

export type NodeSystemConnectionColorResolver = (connectionType: string | undefined) => Color

/**
 * Stable universal fallback for consumers that do not provide a visual style
 * resolver. Direction and live state never participate in connection identity.
 */
export function defaultNodeSystemConnectionColor(connectionType: string | undefined): Color {
  if (connectionType === undefined) return palette.border
  return fallbackConnectionColor(connectionType)
}

function fallbackConnectionColor(connectionType: string): Color {
  let hash = 2166136261
  for (let index = 0; index < connectionType.length; index += 1) {
    hash ^= connectionType.charCodeAt(index)
    hash = Math.imul(hash, 16777619) >>> 0
  }
  return hslColor(hash % 360, 0.68, 0.64)
}

function hslColor(hue: number, saturation: number, lightness: number): Color {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
  const h = hue / 60
  const x = chroma * (1 - Math.abs(h % 2 - 1))
  const [r1, g1, b1] = h < 1 ? [chroma, x, 0]
    : h < 2 ? [x, chroma, 0]
      : h < 3 ? [0, chroma, x]
        : h < 4 ? [0, x, chroma]
          : h < 5 ? [x, 0, chroma]
            : [chroma, 0, x]
  const m = lightness - chroma / 2
  return new Color(r1 + m, g1 + m, b1 + m, 1)
}
