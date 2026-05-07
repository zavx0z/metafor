/**
 * Стандартная палитра + Tone-helpers для consistent UI.
 * Цвета вдохновлены iOS dark / Vision Pro.
 */

import {Color, TextMaterial} from "@metafor/engine"

const rgb = (r: number, g: number, b: number, a = 1): Color => new Color(r / 255, g / 255, b / 255, a)

export const palette = {
  // Background-слои.
  bg: rgb(18, 23, 32, 0.96),
  bgElevated: rgb(27, 34, 45, 0.98),
  bgHot: rgb(38, 49, 66, 0.98),
  bgInput: rgb(10, 14, 21, 0.98),
  bgPanel: rgb(14, 19, 28, 0.98),
  bgPanelDim: rgb(14, 19, 28, 0.88),
  bgCode: rgb(28, 34, 42, 1.0),       // Source-editor / console body bg.
  bgToolbar: rgb(11, 15, 22, 1),

  // Borders / rules.
  border: rgb(116, 130, 151, 1),
  borderDim: rgb(62, 74, 92, 1),
  borderRule: rgb(48, 54, 61, 1),     // Gutter / scrollbar-track / тонкие divider'ы.
  borderBright: rgb(180, 195, 220, 1), // Outline для контрастных карточек (console).

  // Text.
  text: rgb(232, 238, 247, 1),
  muted: rgb(139, 150, 166, 1),

  // Accent colors (text/badge/border).
  cyan: rgb(111, 211, 255, 1),
  green: rgb(82, 196, 123, 1),
  orange: rgb(255, 190, 111, 1),
  red: rgb(255, 127, 111, 1),
  blue: rgb(92, 155, 255, 1),
  violet: rgb(197, 151, 255, 1),

  // Tone fills (для button/badge tone="live"/"paused"/"warn").
  liveFill: rgb(21, 50, 37, 1),
  pausedFill: rgb(61, 45, 24, 1),
  warnFill: rgb(58, 32, 28, 1),

  // Highlights.
  activeRowFill: rgb(43, 73, 117, 0.95),  // Selected list-row (frames-active).
  highlightLine: rgb(36, 64, 164, 1),     // Current paused line (source-editor).

  // Console log levels (отличаются от accent: warm-orange vs bright-orange).
  warnText: rgb(210, 153, 34, 1),
  errorText: rgb(247, 129, 102, 1),
} as const

/**
 * Цвета для синтаксических токенов в code-editor. Категории генерирует
 * server-side TS-scanner в pkg/debug/src/syntax.ts.
 */
export const syntaxTokens = {
  k: rgb(255, 123, 114, 1),  // keyword
  s: rgb(165, 214, 255, 1),  // string
  n: rgb(121, 192, 255, 1),  // number
  c: rgb(139, 148, 158, 1),  // comment
  t: rgb(255, 166, 87, 1),   // type / member
  f: rgb(210, 168, 255, 1),  // function-call
  p: rgb(201, 209, 217, 1),  // punctuation
  d: rgb(225, 228, 233, 1),  // default identifier
} as const

export type SyntaxCategory = keyof typeof syntaxTokens

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
 * Кэш TextMaterial'ов по palette-цветам. Создавать TextMaterial каждый
 * render — мусор; этот объект инстанцируется один раз на Card.
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
  readonly warn = new TextMaterial({color: palette.warnText})
  readonly error = new TextMaterial({color: palette.errorText})

  toneText(kind: Tone): TextMaterial {
    if (kind === "live") return this.green
    if (kind === "paused") return this.orange
    if (kind === "warn") return this.red
    return this.text
  }
}
