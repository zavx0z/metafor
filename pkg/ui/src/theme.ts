/**
 * Стандартная палитра + Tone-helpers для consistent UI.
 * Цвета вдохновлены iOS dark / Vision Pro.
 */

import {Color, TextMaterial} from "@metafor/engine"

const rgb = (r: number, g: number, b: number, a = 1): Color => new Color(r / 255, g / 255, b / 255, a)

export const palette = {
  bg: rgb(18, 23, 32, 0.96),
  bgElevated: rgb(27, 34, 45, 0.98),
  bgHot: rgb(38, 49, 66, 0.98),
  bgInput: rgb(10, 14, 21, 0.98),
  bgPanel: rgb(14, 19, 28, 0.98),

  border: rgb(116, 130, 151, 1),
  borderDim: rgb(62, 74, 92, 1),

  text: rgb(232, 238, 247, 1),
  muted: rgb(139, 150, 166, 1),

  cyan: rgb(111, 211, 255, 1),
  green: rgb(82, 196, 123, 1),
  orange: rgb(255, 190, 111, 1),
  red: rgb(255, 127, 111, 1),
  blue: rgb(92, 155, 255, 1),
  violet: rgb(197, 151, 255, 1),

  liveFill: rgb(21, 50, 37, 1),
  pausedFill: rgb(61, 45, 24, 1),
  warnFill: rgb(58, 32, 28, 1),
} as const

export type Tone = "neutral" | "live" | "paused" | "warn"

export function toneFill(kind: Tone): Color {
  if (kind === "live") return palette.liveFill
  if (kind === "paused") return palette.pausedFill
  if (kind === "warn") return palette.warnFill
  return palette.bgElevated
}

export function toneBorder(kind: Tone): Color {
  if (kind === "live") return palette.green
  if (kind === "paused") return palette.orange
  if (kind === "warn") return palette.red
  return palette.border
}

/**
 * Кэш материалов по цвету. Создавать TextMaterial каждый render — мусор.
 */
export class MaterialPalette {
  readonly text = new TextMaterial({color: palette.text})
  readonly muted = new TextMaterial({color: palette.muted})
  readonly cyan = new TextMaterial({color: palette.cyan})
  readonly green = new TextMaterial({color: palette.green})
  readonly orange = new TextMaterial({color: palette.orange})
  readonly red = new TextMaterial({color: palette.red})
  readonly blue = new TextMaterial({color: palette.blue})
  readonly violet = new TextMaterial({color: palette.violet})

  toneText(kind: Tone): TextMaterial {
    if (kind === "live") return this.green
    if (kind === "paused") return this.orange
    if (kind === "warn") return this.red
    return this.text
  }
}
