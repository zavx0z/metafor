/**
 * ConsolePane — append-only target log on the shared @metafor/elements UiSurface system.
 *
 * It deliberately uses the same UiSurface chrome, clipping, text measurement and
 * div scroll primitive as EditorPane so the source/console stack aligns as one UI surface.
 */

import {UiSurface, Z, div, divScrollPosition, divScrollTo, palette, radii} from "@metafor/elements"
import {Divider as divider} from "@metafor/components"
import {t} from "./i18n.ts"

export type ConsoleEntry = {
  ts: string
  level?: string | undefined
  text: string
}

const LINE_PX = 16
const FONT_PX = 12
const TS_FONT_PX = 10
const PAD_X = 20
const HEADER_H_PX = 38
const CONTENT_TOP_PX = 58
const BOTTOM_PAD_PX = 12
const TS_GUTTER_PX = 68
const SCROLLBAR_W = 4
const MAX_ENTRIES = 1000
const AUTOSCROLL_TOLERANCE_PX = 20
const CONSOLE_SCROLL_KEY = "debug:console:list"

export class ConsolePane extends UiSurface {
  #entries: ConsoleEntry[] = []

  constructor() {
    super({
      bgColor: palette.bgCode,
      borderColor: palette.borderDim,
      borderWidthPx: 1,
      borderRadiusPx: radii.pane,
    })
    this.node.name = "ConsolePane"
  }

  pushEntries(entries: ConsoleEntry[]): void {
    if (entries.length === 0) return
    const wasAtBottom = this.#isAtBottom()
    this.#entries.push(...entries)
    while (this.#entries.length > MAX_ENTRIES) this.#entries.shift()
    if (wasAtBottom) this.#scrollToBottom()
    this.requestRender()
  }

  clear(): void {
    this.#entries = []
    divScrollTo(this, CONSOLE_SCROLL_KEY, {top: 0})
    this.requestRender()
  }

  toText(): string {
    return this.#entries.map((entry) => `${formatTimestamp(entry.ts)}\t${entry.text}`).join("\n")
  }

  onKey(event: KeyboardEvent): void {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "c") {
      event.preventDefault()
      const text = this.toText()
      if (text.length > 0) void navigator.clipboard.writeText(text)
    }
  }

  protected render(): void {
    this.drawText(t("consoleTarget"), PAD_X, 10, {
      fontPx: 13,
      material: this.materials.cyan,
      maxWidthPx: Math.max(1, this.rectW - PAD_X * 2 - 100),
    })
    const counter = `${this.#entries.length} ${t("lines")}`
    this.drawText(counter, Math.max(PAD_X, this.rectW - PAD_X - 90), 12, {
      fontPx: 11,
      material: this.materials.muted,
      maxWidthPx: 80,
    })
    divider(this, PAD_X, HEADER_H_PX, Math.max(1, this.rectW - PAD_X * 2))

    const contentH = this.#contentH()
    if (this.#entries.length === 0) {
      this.drawText(t("waitingStdout"), PAD_X, CONTENT_TOP_PX + 10, {
        fontPx: 12,
        material: this.materials.muted,
        maxWidthPx: this.rectW - PAD_X * 2,
      })
      return
    }

    div(this, PAD_X, CONTENT_TOP_PX, this.rectW - PAD_X * 2, contentH, {
      key: CONSOLE_SCROLL_KEY,
      scrollContentHeight: Math.max(contentH, this.#entries.length * LINE_PX),
      style: {
        background: null,
        borderColor: null,
        borderRadius: 0,
        padding: 0,
        overflowY: "auto",
      },
      children: (ctx) => {
        const startIdx = Math.max(0, Math.floor(ctx.scrollTop / LINE_PX) - 1)
        const endIdx = Math.min(this.#entries.length, Math.ceil((ctx.scrollTop + ctx.viewportHeight) / LINE_PX) + 1)
        for (let idx = startIdx; idx < endIdx; idx++) {
          const entry = this.#entries[idx]
          if (entry === undefined) continue
          const y = CONTENT_TOP_PX + idx * LINE_PX - ctx.scrollTop
          this.#drawEntry(entry, y, ctx.viewportWidth)
        }
        edgeFade(this, PAD_X, CONTENT_TOP_PX, ctx.viewportWidth, ctx.viewportHeight)
      },
    })
  }

  #drawEntry(entry: ConsoleEntry, y: number, contentW: number): void {
    this.drawText(formatTimestamp(entry.ts), PAD_X, y, {
      fontPx: TS_FONT_PX,
      material: this.materials.muted,
      maxWidthPx: TS_GUTTER_PX - 8,
    })
    const bodyX = PAD_X + TS_GUTTER_PX
    const bodyMaxPx = Math.max(20, PAD_X + contentW - bodyX)
    const value = entry.text.length > 4096 ? `${entry.text.slice(0, 4096)}...` : entry.text
    this.drawText(clipConsoleLine(value, bodyMaxPx, FONT_PX), bodyX, y, {
      fontPx: FONT_PX,
      material: this.#materialForLevel(entry.level),
      maxWidthPx: bodyMaxPx,
    })
  }

  #materialForLevel(level: string | undefined) {
    switch (level) {
      case "warning":
      case "warn": return this.materials.warn
      case "error": return this.materials.error
      case "debug":
      case "verbose": return this.materials.muted
      default: return this.materials.text
    }
  }

  #contentH(): number {
    return Math.max(1, this.rectH - CONTENT_TOP_PX - BOTTOM_PAD_PX)
  }

  #isAtBottom(): boolean {
    const totalHeight = this.#entries.length * LINE_PX
    if (totalHeight <= this.#contentH()) return true
    const maxScroll = totalHeight - this.#contentH()
    return divScrollPosition(this, CONSOLE_SCROLL_KEY).top >= maxScroll - AUTOSCROLL_TOLERANCE_PX
  }

  #scrollToBottom(): void {
    const totalHeight = this.#entries.length * LINE_PX
    divScrollTo(this, CONSOLE_SCROLL_KEY, {top: Math.max(0, totalHeight - this.#contentH())})
  }
}

function formatTimestamp(ts: string): string {
  const t = ts.indexOf("T")
  if (t < 0) return ts
  const dot = ts.indexOf(".", t)
  return ts.slice(t + 1, dot < 0 ? undefined : dot)
}

function clipConsoleLine(value: string, widthPx: number, fontPx: number): string {
  const max = Math.max(1, Math.floor(widthPx / Math.max(1, fontPx * 0.7)))
  if (value.length <= max) return value
  if (max <= 3) return value.slice(0, max)
  return `${value.slice(0, max - 3)}...`
}

function edgeFade(pane: UiSurface, x: number, y: number, w: number, h: number): void {
  const size = Math.max(0, Math.min(18, h / 2))
  if (size <= 0 || w <= 0 || h <= 0) return
  const steps = 8
  const stepH = size / steps
  for (let i = 0; i < steps; i++) {
    const topT = 1 - i / steps
    const topColor = palette.bgCode.clone()
    topColor.a = 0.86 * topT * topT
    pane.drawRect(x, y + i * stepH, w, stepH + 0.75, topColor, Z.TEXT + 0.03)

    const bottomT = (i + 1) / steps
    const bottomColor = palette.bgCode.clone()
    bottomColor.a = 0.86 * bottomT * bottomT
    pane.drawRect(x, y + h - size + i * stepH, w, stepH + 0.75, bottomColor, Z.TEXT + 0.03)
  }
}
