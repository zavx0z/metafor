import {TextMaterial} from "@metafor/engine"
import {syntaxTokens, type Pane} from "@metafor/elements"
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
  pane: Pane
  text: string
  tokens: readonly EditorToken[]
  startX: number
  y: number
  fontPx: number
  maxPx: number
  materials: EditorTokenMaterialMap
  fallbackMaterial: TextMaterial
  sliceStart?: number
  animOffsetFor?: (absoluteColumn: number) => number
  drawTokenBackground?: (x: number, y: number, w: number, h: number, bg: string) => void
}

export function normalizeEditorTokensForLine(text: string, tokens: readonly EditorToken[]): EditorToken[] {
  const len = text.length
  const out: EditorToken[] = []
  let cursor = 0

  for (const tok of [...tokens].sort((a, b) => a.s - b.s || a.e - b.e)) {
    if (!Number.isFinite(tok.s) || !Number.isFinite(tok.e)) continue
    const rawStart = Math.floor(tok.s)
    const rawEnd = Math.floor(tok.e)
    const s = Math.max(cursor, Math.min(len, rawStart))
    const e = Math.max(s, Math.min(len, rawEnd))
    if (e <= s) continue

    const normalized: EditorToken = {s, e, c: tok.c}
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
  const remaining = (): number => Math.max(0, opts.startX + opts.maxPx - cursorX)

  const placeChunk = (chunkText: string, category: string, bg: string | undefined, chunkColStart: number): void => {
    if (chunkText.length === 0) return
    const w = opts.pane.measureText(chunkText, opts.fontPx)
    const offset = opts.animOffsetFor?.(sliceStart + chunkColStart) ?? 0
    if (!Number.isFinite(offset)) {
      cursorX += w
      return
    }
    const drawX = cursorX + offset
    if (bg !== undefined && w > 0) {
      opts.drawTokenBackground?.(drawX, opts.y, w, opts.fontPx + 2, bg)
    }
    if (chunkText.trim().length > 0) {
      const material = opts.materials.get(category) ?? opts.fallbackMaterial
      opts.pane.drawText(chunkText, drawX, opts.y, {
        fontPx: opts.fontPx,
        material,
        maxWidthPx: remaining(),
      })
    }
    cursorX += w
  }

  const sorted = normalizeEditorTokensForLine(opts.text, opts.tokens)
  for (const tok of sorted) {
    if (tok.s > cursor) placeChunk(opts.text.slice(cursor, tok.s), "d", undefined, cursor)
    placeChunk(opts.text.slice(tok.s, tok.e), tok.c, tok.bg, tok.s)
    cursor = tok.e
  }
  if (cursor < opts.text.length) placeChunk(opts.text.slice(cursor), "d", undefined, cursor)
}
