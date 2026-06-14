import {Color, TextMaterial} from "@metafor/engine"
import {syntaxTokens, type UiSurface} from "@ui/elements"
import type {EditorToken} from "./tokens.ts"

export type EditorTokenMaterialMap = Map<string, TextMaterial>

export function createEditorTokenMaterials(): EditorTokenMaterialMap {
  const materials: EditorTokenMaterialMap = new Map()
  for (const [category, color] of Object.entries(syntaxTokens)) {
    materials.set(category, new TextMaterial({color}))
  }
  return materials
}

export type RenderEditorTokenLineOpts = {
  pane: UiSurface
  text: string
  tokens: readonly EditorToken[]
  startX: number
  y: number
  fontPx: number
  letterSpacingPx?: number
  spaceAdvancePx?: number
  maxPx: number
  materials: EditorTokenMaterialMap
  fallbackMaterial: TextMaterial
  sliceStart?: number
  tokensNormalized?: boolean
  chunkWidth?: (startCol: number, endCol: number, text: string) => number
  chunkX?: (startCol: number) => number
  animOffsetFor?: (absoluteColumn: number) => number
  drawTokenBackground?: (x: number, y: number, w: number, h: number, bg: string) => void
}

export type RenderEditorTextRunsOpts = {
  pane: UiSurface
  text: string
  startX: number
  y: number
  fontPx: number
  material: TextMaterial
  maxPx: number
  letterSpacingPx?: number
  spaceAdvancePx?: number
  columnStart?: number
  sliceStart?: number
  columnX?: (col: number) => number
  animOffsetFor?: (absoluteColumn: number) => number
}

export function normalizeEditorTokensForLine(text: string, tokens: readonly EditorToken[]): EditorToken[] {
  const len = text.length
  const out: EditorToken[] = []
  let cursor = 0

  for (const tok of [...tokens].sort((a, b) => a.s - b.s || b.e - a.e)) {
    if (!Number.isFinite(tok.s) || !Number.isFinite(tok.e)) continue
    const rawStart = Math.floor(tok.s)
    const rawEnd = Math.floor(tok.e)
    const s = Math.max(cursor, Math.min(len, rawStart))
    const e = Math.max(s, Math.min(len, rawEnd))
    if (e <= s) continue

    const normalized: EditorToken = {s, e, c: tok.c}
    if (tok.fg !== undefined) normalized.fg = tok.fg
    if (tok.bg !== undefined) normalized.bg = tok.bg
    out.push(normalized)
    cursor = e
  }

  return out
}

export function renderEditorTokenizedLine(opts: RenderEditorTokenLineOpts): void {
  let cursor = 0
  let cursorX = opts.startX
  const sliceStart = opts.sliceStart ?? 0

  const placeChunk = (chunkText: string, category: string, fg: string | undefined, bg: string | undefined, chunkColStart: number): void => {
    if (chunkText.length === 0) return
    const w = opts.chunkWidth?.(chunkColStart, chunkColStart + chunkText.length, chunkText)
      ?? opts.pane.measureText(chunkText, opts.fontPx, opts.letterSpacingPx, opts.spaceAdvancePx)
    const chunkX = opts.chunkX === undefined
      ? cursorX
      : opts.startX + opts.chunkX(chunkColStart)
    const offset = opts.animOffsetFor?.(sliceStart + chunkColStart) ?? 0
    if (!Number.isFinite(offset)) {
      cursorX += w
      return
    }
    const drawX = chunkX + offset
    if (bg !== undefined && w > 0) {
      opts.drawTokenBackground?.(drawX, opts.y, w, opts.fontPx + 2, bg)
    }
    renderEditorTextRuns({
      pane: opts.pane,
      text: chunkText,
      startX: opts.startX,
      y: opts.y,
      fontPx: opts.fontPx,
      material: materialForToken(opts.materials, category, fg) ?? opts.fallbackMaterial,
      maxPx: opts.maxPx,
      columnStart: chunkColStart,
      sliceStart,
      ...(opts.chunkX === undefined ? {} : {columnX: opts.chunkX}),
      ...(opts.animOffsetFor === undefined ? {} : {animOffsetFor: opts.animOffsetFor}),
      ...(opts.letterSpacingPx === undefined ? {} : {letterSpacingPx: opts.letterSpacingPx}),
      ...(opts.spaceAdvancePx === undefined ? {} : {spaceAdvancePx: opts.spaceAdvancePx}),
    })
    cursorX += w
  }

  const sorted = opts.tokensNormalized === true ? opts.tokens : normalizeEditorTokensForLine(opts.text, opts.tokens)
  for (const tok of sorted) {
    if (tok.s > cursor) placeChunk(opts.text.slice(cursor, tok.s), "d", undefined, undefined, cursor)
    placeChunk(opts.text.slice(tok.s, tok.e), tok.c, tok.fg, tok.bg, tok.s)
    cursor = tok.e
  }
  if (cursor < opts.text.length) placeChunk(opts.text.slice(cursor), "d", undefined, undefined, cursor)
}

export function renderEditorTextRuns(opts: RenderEditorTextRunsOpts): void {
  const columnStart = opts.columnStart ?? 0
  const sliceStart = opts.sliceStart ?? 0
  let runStart: number | null = null

  const flush = (end: number): void => {
    if (runStart === null) return
    const runText = opts.text.slice(runStart, end)
    if (runText.trim().length === 0) {
      runStart = null
      return
    }
    const runColumn = columnStart + runStart
    const runX = opts.columnX === undefined
      ? opts.startX + opts.pane.measureText(opts.text.slice(0, runStart), opts.fontPx, opts.letterSpacingPx, opts.spaceAdvancePx)
      : opts.startX + opts.columnX(runColumn)
    const offset = opts.animOffsetFor?.(sliceStart + runColumn) ?? 0
    if (!Number.isFinite(offset)) {
      runStart = null
      return
    }
    const drawX = runX + offset
    const maxWidthPx = Math.max(0, opts.startX + opts.maxPx - drawX)
    if (maxWidthPx > 0) {
      opts.pane.drawText(runText, drawX, opts.y, {
        fontPx: opts.fontPx,
        material: opts.material,
        maxWidthPx,
        fit: false,
        measure: false,
        ...(opts.letterSpacingPx === undefined ? {} : {letterSpacingPx: opts.letterSpacingPx}),
        ...(opts.spaceAdvancePx === undefined ? {} : {spaceAdvancePx: opts.spaceAdvancePx}),
      })
    }
    runStart = null
  }

  for (let i = 0; i < opts.text.length;) {
    const code = opts.text.codePointAt(i) ?? 0
    const width = code > 0xffff ? 2 : 1
    if (isDrawableEditorTextCodePoint(code)) {
      if (runStart === null) runStart = i
    } else {
      flush(i)
    }
    i += width
  }
  flush(opts.text.length)
}

function isDrawableEditorTextCodePoint(code: number): boolean {
  return code >= 0x20 && code !== 0x7f
}

function materialForToken(materials: EditorTokenMaterialMap, category: string, fg: string | undefined): TextMaterial | undefined {
  const hex = normalizeTokenHexColor(fg)
  if (hex === undefined) return materials.get(category)
  const key = `fg:${hex}`
  let material = materials.get(key)
  if (material === undefined) {
    material = new TextMaterial({color: new Color(hex)})
    materials.set(key, material)
  }
  return material
}

function normalizeTokenHexColor(value: string | undefined): string | undefined {
  const raw = value?.trim()
  if (raw === undefined) return undefined
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(raw)
  if (match === null) return undefined
  const body = match[1]!
  if (body.length === 3) return `#${body.split("").map((ch) => ch + ch).join("").toLowerCase()}`
  return `#${body.toLowerCase()}`
}
