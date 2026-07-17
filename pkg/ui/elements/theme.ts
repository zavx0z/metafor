/**
 * Стандартная палитра + Tone-helpers для consistent UI.
 * Цвета вдохновлены iOS dark / Vision Pro.
 */

import {Color, TextMaterial} from "@metafor/engine"
import islandsDarkTheme from "./themes/islands-dark.color-theme.json"

const rgb = (r: number, g: number, b: number, a = 1): Color => new Color(r / 255, g / 255, b / 255, a)

export const palette = {
  transparent: rgb(0, 0, 0, 0),

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
  borderBright: rgb(180, 195, 220, 1), // Outline для контрастных поверхностей (console).
  windowActiveBorder: rgb(132, 192, 220, 0.82),

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
 * Цветовые схемы редакторов обычно публикуются в формате VS Code theme JSON.
 * Наш редактор пока рендерит компактные категории, поэтому здесь один слой
 * адаптации из TextMate scopes в локальные категории токенов.
 */
export const syntaxTokenCategories = ["k", "s", "n", "c", "t", "f", "p", "d"] as const
export type SyntaxCategory = (typeof syntaxTokenCategories)[number]
export type SyntaxTokenColors = Record<SyntaxCategory, Color>

export type VscodeTokenColorRule = {
  name?: string
  scope?: string | readonly string[]
  settings?: {
    foreground?: string
    fontStyle?: string
  }
}

export type VscodeColorTheme = {
  name?: string
  type?: string
  colors?: Record<string, string>
  tokenColors?: readonly VscodeTokenColorRule[]
}

export const metaforDarkSyntaxTokens: SyntaxTokenColors = {
  k: rgb(255, 123, 114, 1),  // keyword
  s: rgb(165, 214, 255, 1),  // string
  n: rgb(121, 192, 255, 1),  // number
  c: rgb(139, 148, 158, 1),  // comment
  t: rgb(255, 166, 87, 1),   // type / member
  f: rgb(210, 168, 255, 1),  // function-call
  p: rgb(201, 209, 217, 1),  // punctuation
  d: rgb(225, 228, 233, 1),  // default identifier
} as const

const vscodeScopeMap: Record<SyntaxCategory, readonly string[]> = {
  k: ["keyword", "storage"],
  s: ["string"],
  n: ["constant.numeric", "constant.language", "constant"],
  c: ["comment"],
  t: ["entity.name.type", "entity.name.class", "support.type", "storage.type"],
  f: ["entity.name.function", "support.function", "variable.function"],
  p: ["punctuation.separator.delimiter", "punctuation.terminator.statement", "punctuation.separator", "punctuation", "keyword.operator"],
  d: [],
}

function normalizeHexColor(value: string | undefined): string | undefined {
  const raw = value?.trim()
  if (raw === undefined) return undefined
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(raw)
  if (match === null) return undefined
  const body = match[1]!
  if (body.length === 3) return body.split("").map((ch) => ch + ch).join("").toLowerCase()
  return body.toLowerCase()
}

function colorFromHex(value: string | undefined, fallback: Color): Color {
  const hex = normalizeHexColor(value)
  if (hex === undefined) return fallback.clone()
  const rgbHex = hex.length === 8 ? hex.slice(0, 6) : hex
  const alphaHex = hex.length === 8 ? hex.slice(6, 8) : undefined
  const r = Number.parseInt(rgbHex.slice(0, 2), 16)
  const g = Number.parseInt(rgbHex.slice(2, 4), 16)
  const b = Number.parseInt(rgbHex.slice(4, 6), 16)
  const a = alphaHex === undefined ? 1 : Number.parseInt(alphaHex, 16) / 255
  return rgb(r, g, b, a)
}

function ruleScopes(scope: string | readonly string[] | undefined): string[] {
  const raw = typeof scope === "string" ? [scope] : scope ?? []
  const out: string[] = []
  for (const item of raw) {
    for (const part of item.split(",")) {
      const trimmed = part.trim()
      if (trimmed.length > 0) out.push(trimmed)
    }
  }
  return out
}

function scopeParts(scope: string): string[] {
  return scope.split(/\s+|>/).map((part) => part.trim()).filter((part) => part.length > 0)
}

function matchesScope(scope: string, selector: string, exact: boolean): boolean {
  if (scope === selector) return true
  for (const part of scopeParts(scope)) {
    if (part === selector) return true
    if (!exact && part.startsWith(`${selector}.`)) return true
  }
  return false
}

function foregroundFor(theme: VscodeColorTheme, selectors: readonly string[]): string | undefined {
  const rules = theme.tokenColors ?? []
  for (const selector of selectors) {
    for (let i = rules.length - 1; i >= 0; i--) {
      const rule = rules[i]
      const foreground = rule?.settings?.foreground
      if (foreground === undefined) continue
      if (ruleScopes(rule?.scope).some((scope) => matchesScope(scope, selector, true))) return foreground
    }
  }
  for (const selector of selectors) {
    for (let i = rules.length - 1; i >= 0; i--) {
      const rule = rules[i]
      const foreground = rule?.settings?.foreground
      if (foreground === undefined) continue
      if (ruleScopes(rule?.scope).some((scope) => matchesScope(scope, selector, false))) return foreground
    }
  }
  return undefined
}

export function resolveVscodeScopeColorHex(
  theme: VscodeColorTheme,
  selectors: readonly string[],
  fallback?: string,
): string | undefined {
  const color = foregroundFor(theme, selectors) ?? fallback ?? theme.colors?.["editor.foreground"]
  const hex = normalizeHexColor(color)
  return hex === undefined ? undefined : `#${hex}`
}

export function resolveVscodeSyntaxTokens(
  theme: VscodeColorTheme,
  fallback: SyntaxTokenColors = metaforDarkSyntaxTokens,
): SyntaxTokenColors {
  const editorForeground = theme.colors?.["editor.foreground"]
  const out = {} as SyntaxTokenColors
  for (const category of syntaxTokenCategories) {
    const color = foregroundFor(theme, vscodeScopeMap[category])
      ?? (category === "d" ? editorForeground : undefined)
    out[category] = colorFromHex(color, fallback[category])
  }
  return out
}

export const activeVscodeSyntaxTheme = islandsDarkTheme as VscodeColorTheme
export const activeSyntaxThemeName = activeVscodeSyntaxTheme.name ?? "Islands Dark"

/**
 * Цвета для синтаксических токенов в code-editor. Категории генерируют
 * editor/highlighter и server-side scanner в pkg/interpreter/src/syntax.ts.
 */
export const syntaxTokens = resolveVscodeSyntaxTokens(activeVscodeSyntaxTheme)

export const radii = {
  control: 6,
  pane: 14,
  paneLarge: 18,
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
 * Кэш TextMaterial'ов по palette-цветам. Создавать TextMaterial каждый
 * render — мусор; этот объект инстанцируется один раз на UiSurface.
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
