import {TextMaterial} from "@metafor/engine"
import type {Card} from "../card.ts"
import {syntaxTokens} from "../theme.ts"
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
  card: Card
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

export function renderEditorTokenizedLine(opts: RenderEditorTokenLineOpts): void {
  let cursor = 0
  let cursorX = opts.startX
  const sliceStart = opts.sliceStart ?? 0
  const remaining = (): number => Math.max(0, opts.startX + opts.maxPx - cursorX)

  const placeChunk = (chunkText: string, category: string, bg: string | undefined, chunkColStart: number): void => {
    if (chunkText.length === 0) return
    const w = opts.card.measureText(chunkText, opts.fontPx)
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
      opts.card.drawText(chunkText, drawX, opts.y, {
        fontPx: opts.fontPx,
        material,
        maxWidthPx: remaining(),
      })
    }
    cursorX += w
  }

  const sorted = [...opts.tokens].sort((a, b) => a.s - b.s)
  for (const tok of sorted) {
    if (tok.s > cursor) placeChunk(opts.text.slice(cursor, tok.s), "d", undefined, cursor)
    const end = Math.min(tok.e, opts.text.length)
    if (end > tok.s) placeChunk(opts.text.slice(tok.s, end), tok.c, tok.bg, tok.s)
    cursor = Math.max(cursor, tok.e)
  }
  if (cursor < opts.text.length) placeChunk(opts.text.slice(cursor), "d", undefined, cursor)
}
