/**
 * SourcePane — source-editor на UiSurface@ui.
 *
 * Главные принципы:
 *  • extends UiSurface → bg/border гарантированно clamp'нуты в pane-rect.
 *  • Immediate-mode rendering: каждый requestRender пересчитывает
 *    видимые строки от #scrollOffset до #scrollOffset+visible и рисует
 *    их через drawText. Никакого translate'а — строки физически не
 *    существуют вне pane-rect.
 *  • highlight/exec-arrow рисуются drawRect/drawText — clamp protect.
 */

import {TextMaterial} from "@metafor/engine"
import {
  div,
  divScrollPosition,
  divScrollTo,
  UiSurface,
  Z,
  palette,
  radii,
  type DivScrollContext,
} from "@metafor/elements"
import {
  createEditorTokenMaterials,
  renderEditorTokenizedLine,
  sourcePathFromLocation,
  tokensForSourceView,
  type EditorToken,
  type EditorTokens,
  type EditorTokenMaterialMap,
} from "@metafor/components"
import {t} from "./i18n.ts"

export type SyntaxToken = EditorToken
export type SourceTokens = EditorTokens

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
const SOURCE_SCROLL_KEY = "debug:source:list"


export class SourcePane extends UiSurface {
  #current: Source | null = null
  #runtimeState: SourceRuntimeState = "idle"

  readonly #locationMaterial = new TextMaterial({color: palette.muted})
  readonly #lineMaterial = new TextMaterial({color: palette.text})
  readonly #gutterMaterial = new TextMaterial({color: palette.muted})
  readonly #gutterHotMaterial = new TextMaterial({color: palette.orange})
  readonly #execArrowMaterial = new TextMaterial({color: palette.orange})
  readonly #tokenMaterials: EditorTokenMaterialMap

  constructor() {
    super({bgColor: palette.bgCode, borderColor: palette.borderDim, borderWidthPx: 1, borderRadiusPx: radii.pane})
    this.node.name = "SourcePane"
    this.#tokenMaterials = createEditorTokenMaterials()
  }

  setSource(source: Source): void {
    const normalized = normalizeCurrentLine(source)
    const prev = this.#current
    const lineChanged = prev?.currentLine !== normalized.currentLine
    const fileChanged = sourcePathFromLocation(prev?.location) !== sourcePathFromLocation(normalized.location)
    const tokens = tokensForSourceView(normalized)
    this.#current = tokens === undefined ? normalized : {...normalized, tokens}
    if (normalized.currentLine > 0) this.#runtimeState = "paused"

    if (normalized.currentLine > 0 && (lineChanged || fileChanged || prev === null)) {
      const visible = this.#visibleLineCount()
      divScrollTo(this, SOURCE_SCROLL_KEY, {top: Math.max(0, normalized.currentLine - 1 - Math.floor(visible / 2)) * LINE_PX})
    }
    this.requestRender()
  }

  setRuntimeState(state: SourceRuntimeState): void {
    if (this.#runtimeState === state) return
    this.#runtimeState = state
    this.requestRender()
  }

  onKey(event: KeyboardEvent): void {
    if (this.#current === null) return
    const visible = this.#visibleLineCount()
    const total = this.#current.lines.length
    const max = Math.max(0, total * LINE_PX - this.#contentH())
    const scrollTop = divScrollPosition(this, SOURCE_SCROLL_KEY).top
    const target = (deltaRows: number): number => Math.max(0, Math.min(max, scrollTop + deltaRows * LINE_PX))
    let handled = true
    switch (event.key) {
      case "ArrowDown": divScrollTo(this, SOURCE_SCROLL_KEY, {top: target(1)}); break
      case "ArrowUp": divScrollTo(this, SOURCE_SCROLL_KEY, {top: target(-1)}); break
      case "PageDown": divScrollTo(this, SOURCE_SCROLL_KEY, {top: target(visible)}); break
      case "PageUp": divScrollTo(this, SOURCE_SCROLL_KEY, {top: target(-visible)}); break
      case "Home": divScrollTo(this, SOURCE_SCROLL_KEY, {top: 0}); break
      case "End": divScrollTo(this, SOURCE_SCROLL_KEY, {top: max}); break
      case "g":
        if (this.#current.currentLine > 0) {
          divScrollTo(this, SOURCE_SCROLL_KEY, {top: Math.max(0, Math.min(max, (this.#current.currentLine - 1 - Math.floor(visible / 2)) * LINE_PX))})
        }
        break
      default: handled = false
    }
    if (handled) event.preventDefault()
  }

  protected render(): void {
    // Header.
    this.drawText(this.#headerLocation(), 20, 10, {
      fontPx: 12,
      material: this.#locationMaterial,
      maxWidthPx: this.rectW - 40,
    })

    this.drawRect(8, HEADER_H_PX, Math.max(1, this.rectW - 16), 1, palette.borderDim, Z.SEPARATOR)

    if (this.#current === null || this.#current.lines.length === 0) {
      this.drawText(t("targetWaiting"), Math.max(12, this.rectW / 2 - 80), PAD_TOP_PX + 18, {
        fontPx: 14,
        material: this.#locationMaterial,
        maxWidthPx: this.rectW - 24,
      })
      return
    }

    const lines = this.#current.lines
    const total = lines.length
    div(this, PAD_LEFT_PX, PAD_TOP_PX, Math.max(1, this.rectW - PAD_LEFT_PX - PAD_RIGHT_PX), this.#contentH(), {
      key: SOURCE_SCROLL_KEY,
      scrollContentHeight: Math.max(this.#contentH(), total * LINE_PX),
      style: {
        background: null,
        borderColor: null,
        borderRadius: 0,
        padding: 0,
        overflowY: "auto",
        scrollbarWidth: SCROLLBAR_W,
      },
      children: (ctx) => this.#renderSourceViewport(ctx, this.#current!),
    })
  }

  #renderSourceViewport(ctx: DivScrollContext, source: Source): void {
    const lines = source.lines
    const total = lines.length
    const currentLine = source.currentLine
    const visible = Math.max(1, Math.floor(ctx.viewportHeight / LINE_PX))
    const scroll = ctx.scrollTop / LINE_PX
    const startIdx = Math.floor(scroll)
    const subPx = ctx.scrollTop - startIdx * LINE_PX

    const gutterPx = this.#gutterWidthPx(total)
    const contentW = ctx.viewportWidth
    const contentH = ctx.viewportHeight
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
    // rect-clip → JS в UiSurface.drawRect.
    // Highlight под текущей строкой (если она в visible-окне).
    const currentRowIdx = currentLine - 1 - startIdx
    if (currentLine > 0 && currentRowIdx >= -1 && currentRowIdx <= visible) {
      const highlightY = PAD_TOP_PX + currentRowIdx * LINE_PX - subPx
      const highlightH = Math.min(LINE_PX, CODE_FONT_PX + 4)
      this.drawRoundedRect(PAD_LEFT_PX, highlightY + (LINE_PX - highlightH) / 2, contentW, highlightH, {
        radius: 4,
        fill: palette.pausedFill,
        border: palette.orange,
        borderWidth: 1,
        z: Z.ELEMENT,
      })
      this.drawRoundedRect(PAD_LEFT_PX + gutterPx + 2, highlightY + 2, 3, LINE_PX - 4, {
        radius: 1.5,
        fill: palette.orange,
        z: Z.ELEMENT_RULE,
      })
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
        const lineTokens = source.tokens?.[lineIndex]
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

  }

  #renderTokenizedLine(text: string, tokens: SyntaxToken[], startX: number, y: number, maxPx: number): void {
    renderEditorTokenizedLine({
      pane: this,
      text,
      tokens,
      startX,
      y,
      fontPx: CODE_FONT_PX,
      maxPx,
      materials: this.#tokenMaterials,
      fallbackMaterial: this.#lineMaterial,
    })
  }

  #headerLocation(): string {
    if (this.#runtimeState === "disconnected") return t("sourceDisconnected")
    if (this.#runtimeState === "loading") return t("sourceLoading")
    if (this.#runtimeState === "running" && this.#current !== null) return `${t("sourceLastPaused")}: ${this.#current.location}`
    if (this.#runtimeState === "running") return t("sourceRunning")
    return this.#current?.location ?? t("sourceWaiting")
  }

  #visibleLineCount(): number {
    return Math.max(1, Math.floor(this.#contentH() / LINE_PX))
  }

  #contentH(): number {
    return Math.max(1, this.rectH - PAD_TOP_PX - PAD_BOTTOM_PX - SCROLLBAR_W - 10)
  }

  #gutterWidthPx(lineCount: number): number {
    if (this.font === null) return GUTTER_MIN_PX
    const digits = Math.max(2, String(Math.max(1, lineCount)).length)
    const digitW = this.measureText("8", CODE_FONT_PX)
    return Math.ceil(Math.max(GUTTER_MIN_PX, GUTTER_LEFT_PAD_PX + digitW * digits + GUTTER_RIGHT_PAD_PX))
  }
}

function normalizeCurrentLine(source: Source): Source {
  if (source.currentLine <= 0 || source.currentLine <= source.lines.length) return source
  return {...source, currentLine: 0}
}

function clipSourceLine(value: string, widthPx: number, fontPx: number): string {
  const max = Math.max(1, Math.floor(widthPx / Math.max(1, fontPx * 0.72)))
  if (value.length <= max) return value
  if (max <= 3) return value.slice(0, max)
  return `${value.slice(0, max - 3)}...`
}
