/**
 * SourceCard — source-editor на Card@ui.
 *
 * Главные принципы:
 *  • extends Card → bg/border гарантированно clamp'нуты в card-rect.
 *  • Immediate-mode rendering: каждый requestRender пересчитывает
 *    видимые строки от #scrollOffset до #scrollOffset+visible и рисует
 *    их через drawText. Никакого translate'а — строки физически не
 *    существуют вне card-rect.
 *  • highlight/exec-arrow рисуются drawRect/drawText — clamp protect.
 */

import {TextMaterial} from "@metafor/engine"
import {Card, Z, palette, syntaxTokens, scrollbar, ScrollListState} from "@metafor/ui"

export type SyntaxToken = {s: number; e: number; c: string}
export type SourceTokens = SyntaxToken[][]

export type Source = {
  lines: string[]
  currentLine: number
  location: string
  tokens?: SourceTokens
}

export type SourceRuntimeState = "idle" | "loading" | "paused" | "running" | "disconnected"

const PAD_TOP_PX = 34
const PAD_LEFT_PX = 8
const PAD_RIGHT_PX = 8
const PAD_BOTTOM_PX = 6
const HEADER_H_PX = 28
const GUTTER_MIN_PX = 44
const GUTTER_LEFT_PAD_PX = 6
const GUTTER_RIGHT_PAD_PX = 8
const CODE_LEFT_PAD_PX = 8
const LINE_PX = 16
const CODE_FONT_PX = 12
const SCROLLBAR_W = 4


export class SourceCard extends Card {
  #current: Source | null = null
  readonly #list: ScrollListState
  #runtimeState: SourceRuntimeState = "idle"

  readonly #titleMaterial = new TextMaterial({color: palette.cyan})
  readonly #locationMaterial = new TextMaterial({color: palette.muted})
  readonly #lineMaterial = new TextMaterial({color: palette.text})
  readonly #gutterMaterial = new TextMaterial({color: palette.muted})
  readonly #gutterHotMaterial = new TextMaterial({color: palette.orange})
  readonly #execArrowMaterial = new TextMaterial({color: palette.orange})
  readonly #tokenMaterials: Map<string, TextMaterial> = new Map()

  constructor() {
    super({bgColor: palette.bgCode, borderColor: palette.borderDim, borderWidthPx: 1})
    this.node.name = "SourceCard"
    this.#list = new ScrollListState({onChange: () => this.requestRender()})
    for (const [category, color] of Object.entries(syntaxTokens)) {
      this.#tokenMaterials.set(category, new TextMaterial({color}))
    }
  }

  setSource(source: Source): void {
    const prev = this.#current
    const lineChanged = prev?.currentLine !== source.currentLine
    const fileChanged = stripLine(prev?.location) !== stripLine(source.location)
    this.#current = source
    if (source.currentLine > 0) this.#runtimeState = "paused"

    if (source.currentLine > 0 && (lineChanged || fileChanged || prev === null)) {
      const visible = this.#visibleLineCount()
      this.#list.jumpTo(Math.max(0, source.currentLine - 1 - Math.floor(visible / 2)))
    }
    this.requestRender()
  }

  setRuntimeState(state: SourceRuntimeState): void {
    if (this.#runtimeState === state) return
    this.#runtimeState = state
    this.requestRender()
  }

  onWheel(event: WheelEvent): void {
    if (this.#current === null) return
    const visible = this.#visibleLineCount()
    this.#list.applyWheel(event, LINE_PX, this.#current.lines.length, visible)
  }

  onKey(event: KeyboardEvent): void {
    if (this.#current === null) return
    const visible = this.#visibleLineCount()
    const total = this.#current.lines.length
    const max = Math.max(0, total - visible)
    const target = (delta: number): number => Math.max(0, Math.min(max, this.#list.scroll + delta))
    let handled = true
    switch (event.key) {
      case "ArrowDown": this.#list.scrollTo(target(1)); break
      case "ArrowUp": this.#list.scrollTo(target(-1)); break
      case "PageDown": this.#list.scrollTo(target(visible)); break
      case "PageUp": this.#list.scrollTo(target(-visible)); break
      case "Home": this.#list.scrollTo(0); break
      case "End": this.#list.scrollTo(max); break
      case "g":
        if (this.#current.currentLine > 0) {
          this.#list.scrollTo(Math.max(0, Math.min(max, this.#current.currentLine - 1 - Math.floor(visible / 2))))
        }
        break
      default: handled = false
    }
    if (handled) event.preventDefault()
  }

  protected render(): void {
    // Header.
    const titleStr = `Source · ${this.#runtimeState}`
    this.drawText(titleStr, 20, 8, {
      fontPx: 13,
      material: this.#titleMaterial,
      maxWidthPx: this.rectW - 40,
    })

    const titleW = this.measureText(titleStr, 13)
    const locStartX = 20 + titleW + 14
    const locMaxW = Math.max(40, this.rectW - locStartX - 20)
    if (locMaxW > 40) {
      this.drawText(this.#headerLocation(), locStartX, 12, {
        fontPx: 11,
        material: this.#locationMaterial,
        maxWidthPx: locMaxW,
      })
    }

    this.drawRect(8, HEADER_H_PX, Math.max(1, this.rectW - 16), 1, palette.borderDim, Z.SEPARATOR)

    if (this.#current === null || this.#current.lines.length === 0) {
      this.drawText("waiting for target…", Math.max(12, this.rectW / 2 - 80), PAD_TOP_PX + 18, {
        fontPx: 14,
        material: this.#locationMaterial,
        maxWidthPx: this.rectW - 24,
      })
      return
    }

    const lines = this.#current.lines
    const total = lines.length
    const currentLine = this.#current.currentLine
    const visible = this.#visibleLineCount()
    this.#list.clamp(total, visible)
    const scroll = this.#list.scroll
    const startIdx = Math.floor(scroll)
    const subPx = (scroll - startIdx) * LINE_PX

    const gutterPx = this.#gutterWidthPx(total)
    const contentW = Math.max(1, this.rectW - PAD_LEFT_PX - PAD_RIGHT_PX - SCROLLBAR_W - 4)
    const contentH = Math.max(1, this.rectH - PAD_TOP_PX - PAD_BOTTOM_PX)
    const codeMaxPx = Math.max(1, contentW - gutterPx - CODE_LEFT_PAD_PX - 8)

    // Gutter rule.
    this.drawRect(
      PAD_LEFT_PX + gutterPx,
      PAD_TOP_PX,
      1,
      contentH,
      palette.borderRule,
      Z.SEPARATOR,
    )

    // Clip всю code-area (highlight + строки): text-clip → шейдер,
    // rect-clip → JS в Card.drawRect.
    this.pushClip(PAD_LEFT_PX, PAD_TOP_PX, contentW, contentH)

    // Highlight под текущей строкой (если она в visible-окне).
    const currentRowIdx = currentLine - 1 - startIdx
    if (currentLine > 0 && currentRowIdx >= -1 && currentRowIdx <= visible) {
      const highlightY = PAD_TOP_PX + currentRowIdx * LINE_PX - subPx
      const highlightH = Math.min(LINE_PX, CODE_FONT_PX + 4)
      this.drawRect(
        PAD_LEFT_PX,
        highlightY + (LINE_PX - highlightH) / 2,
        contentW,
        highlightH,
        palette.highlightLine,
        Z.ELEMENT,
      )
      this.drawText("▶", PAD_LEFT_PX + GUTTER_LEFT_PAD_PX * 0.4, highlightY + 1, {
        fontPx: CODE_FONT_PX,
        material: this.#execArrowMaterial,
        maxWidthPx: 12,
      })
    }

    // Видимые строки. +1 row сверху-снизу для smooth scroll'а.
    const renderCount = visible + 1
    for (let i = 0; i < renderCount; i++) {
      const lineIndex = startIdx + i
      if (lineIndex >= total) break
      if (lineIndex < 0) continue
      const lineNo = lineIndex + 1
      const isCurrent = lineNo === currentLine
      const rowY = PAD_TOP_PX + i * LINE_PX - subPx
      // Skip rows за пределами content-area (clip protection).
      if (rowY + LINE_PX < PAD_TOP_PX - 1) continue
      if (rowY > PAD_TOP_PX + contentH + 1) break

      const numStr = String(lineNo)
      const numW = this.measureText(numStr, CODE_FONT_PX)
      const numX = Math.max(
        PAD_LEFT_PX + GUTTER_LEFT_PAD_PX,
        PAD_LEFT_PX + gutterPx - GUTTER_RIGHT_PAD_PX - numW,
      )
      this.drawText(numStr, numX, rowY, {
        fontPx: CODE_FONT_PX,
        material: isCurrent ? this.#gutterHotMaterial : this.#gutterMaterial,
        maxWidthPx: gutterPx - GUTTER_LEFT_PAD_PX - GUTTER_RIGHT_PAD_PX,
      })

      const lineText = clipSourceLine(lines[lineIndex] ?? "", codeMaxPx, CODE_FONT_PX)
      if (lineText.trim().length > 0) {
        const codeStartX = PAD_LEFT_PX + gutterPx + CODE_LEFT_PAD_PX
        const lineTokens = this.#current.tokens?.[lineIndex]
        if (lineTokens !== undefined && lineTokens.length > 0) {
          this.#renderTokenizedLine(lineText, lineTokens, codeStartX, rowY, codeMaxPx)
        } else {
          this.drawText(lineText, codeStartX, rowY, {
            fontPx: CODE_FONT_PX,
            material: this.#lineMaterial,
            maxWidthPx: codeMaxPx,
          })
        }
      }
    }

    this.popClip()

    if (total > visible) {
      scrollbar(this, this.rectW - PAD_RIGHT_PX - SCROLLBAR_W, PAD_TOP_PX, contentH, {
        offset: scroll,
        visible,
        total,
        trackWidth: SCROLLBAR_W,
      })
    }
  }

  #renderTokenizedLine(text: string, tokens: SyntaxToken[], startX: number, y: number, maxPx: number): void {
    let cursor = 0
    let cursorX = startX
    const remaining = (): number => Math.max(0, startX + maxPx - cursorX)
    const placeChunk = (chunkText: string, category: string): void => {
      if (chunkText.length === 0) return
      const w = this.measureText(chunkText, CODE_FONT_PX)
      if (chunkText.trim().length === 0) {
        cursorX += w
        return
      }
      const material = this.#tokenMaterials.get(category) ?? this.#lineMaterial
      this.drawText(chunkText, cursorX, y, {
        fontPx: CODE_FONT_PX,
        material,
        maxWidthPx: remaining(),
      })
      cursorX += w
    }
    const sorted = [...tokens].sort((a, b) => a.s - b.s)
    for (const tok of sorted) {
      if (tok.s > cursor) placeChunk(text.slice(cursor, tok.s), "d")
      const span = text.slice(tok.s, Math.min(tok.e, text.length))
      placeChunk(span, tok.c)
      cursor = Math.max(cursor, tok.e)
    }
    if (cursor < text.length) placeChunk(text.slice(cursor), "d")
  }

  #headerLocation(): string {
    if (this.#runtimeState === "disconnected") return "inspector disconnected"
    if (this.#runtimeState === "loading") return "loading source..."
    if (this.#runtimeState === "running" && this.#current !== null) return `last paused frame: ${this.#current.location}`
    if (this.#runtimeState === "running") return "target running"
    return this.#current?.location ?? "waiting for paused source"
  }

  #visibleLineCount(): number {
    const contentH = Math.max(1, this.rectH - PAD_TOP_PX - PAD_BOTTOM_PX)
    return Math.max(1, Math.floor(contentH / LINE_PX))
  }

  #gutterWidthPx(lineCount: number): number {
    if (this.font === null) return GUTTER_MIN_PX
    const digits = Math.max(2, String(Math.max(1, lineCount)).length)
    const digitW = this.measureText("8", CODE_FONT_PX)
    return Math.ceil(Math.max(GUTTER_MIN_PX, GUTTER_LEFT_PAD_PX + digitW * digits + GUTTER_RIGHT_PAD_PX))
  }
}

function stripLine(location: string | undefined): string {
  if (location === undefined) return ""
  const idx = location.lastIndexOf(":")
  if (idx < 0) return location
  return location.slice(0, idx)
}

function clipSourceLine(value: string, widthPx: number, fontPx: number): string {
  const max = Math.max(1, Math.floor(widthPx / Math.max(1, fontPx * 0.72)))
  if (value.length <= max) return value
  if (max <= 3) return value.slice(0, max)
  return `${value.slice(0, max - 3)}...`
}
