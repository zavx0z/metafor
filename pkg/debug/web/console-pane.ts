/**
 * ConsolePane — append-only target log on the shared @metafor/elements UiSurface system.
 *
 * It deliberately uses the same UiSurface chrome, clipping, text measurement and
 * scrollbar renderer as SourcePane so the source/console stack aligns as one
 * UI surface.
 */

import {UiSurface, Z, palette, radii, scrollbar} from "@metafor/elements"
import {edgeFade} from "@metafor/components"
import {t} from "./i18n.ts"

export type ConsoleEntry = {
  ts: string
  level?: string | undefined
  text: string
}

const LINE_PX = 16
const FONT_PX = 12
const TS_FONT_PX = 10
const HEADER_H_PX = 28
const CONTENT_TOP_PX = 34
const BOTTOM_PAD_PX = 0
const TS_GUTTER_PX = 60
const SCROLLBAR_W = 4
const MAX_ENTRIES = 1000
const AUTOSCROLL_TOLERANCE_PX = 20
const WHEEL_SPEED = 1.6
const WHEEL_START_BOOST_PX = 16
let lastWheelAt = 0

export class ConsolePane extends UiSurface {
  #scrollOffset = 0
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
    else this.#clampScroll()
    this.requestRender()
  }

  clear(): void {
    this.#entries = []
    this.#scrollOffset = 0
    this.requestRender()
  }

  toText(): string {
    return this.#entries.map((entry) => `${formatTimestamp(entry.ts)}\t${entry.text}`).join("\n")
  }

  override onWheel(event: WheelEvent): void {
    const pixelDelta = event.deltaMode === 1
      ? event.deltaY * LINE_PX
      : event.deltaMode === 2
        ? event.deltaY * this.#contentH()
        : event.deltaY
    if (pixelDelta === 0) return
    const scaledDelta = boostedPixelDelta(pixelDelta * WHEEL_SPEED)
    this.#setScroll(this.#scrollOffset + scaledDelta)
  }

  onKey(event: KeyboardEvent): void {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "c") {
      event.preventDefault()
      const text = this.toText()
      if (text.length > 0) void navigator.clipboard.writeText(text)
    }
  }

  protected render(): void {
    this.drawText(t("consoleTarget"), 12, 8, {
      fontPx: 13,
      material: this.materials.cyan,
      maxWidthPx: Math.max(1, this.rectW - 116),
    })
    const counter = `${this.#entries.length} ${t("lines")}`
    this.drawText(counter, Math.max(12, this.rectW - 90), 10, {
      fontPx: 11,
      material: this.materials.muted,
      maxWidthPx: 80,
    })
    this.drawRect(0, HEADER_H_PX, this.rectW, 1, palette.borderDim, Z.SEPARATOR)

    const contentH = this.#contentH()
    if (this.#entries.length === 0) {
      this.drawText(t("waitingStdout"), 12, CONTENT_TOP_PX + 24, {
        fontPx: 12,
        material: this.materials.muted,
        maxWidthPx: this.rectW - 24,
      })
      return
    }

    this.#clampScroll()
    const startIdx = Math.max(0, Math.floor(this.#scrollOffset / LINE_PX))
    const subPx = this.#scrollOffset - startIdx * LINE_PX
    const visibleRows = Math.max(1, Math.ceil(contentH / LINE_PX) + 1)

    this.pushClip(0, CONTENT_TOP_PX, Math.max(1, this.rectW - SCROLLBAR_W - 2), contentH)
    for (let i = 0; i < visibleRows; i++) {
      const idx = startIdx + i
      const entry = this.#entries[idx]
      if (entry === undefined) break
      const y = CONTENT_TOP_PX + i * LINE_PX - subPx
      if (y + LINE_PX < CONTENT_TOP_PX - 1) continue
      if (y > CONTENT_TOP_PX + contentH + 1) break
      this.#drawEntry(entry, y)
    }
    this.popClip()

    edgeFade(this, {
      x: 0,
      y: CONTENT_TOP_PX,
      w: Math.max(1, this.rectW - SCROLLBAR_W - 2),
      h: contentH,
      color: palette.bgCode,
      sizePx: 18,
    })

    const totalHeight = this.#entries.length * LINE_PX
    if (totalHeight > contentH) {
      scrollbar(this, this.rectW - SCROLLBAR_W, CONTENT_TOP_PX, contentH, {
        offset: this.#scrollOffset / LINE_PX,
        visible: contentH / LINE_PX,
        total: this.#entries.length,
        trackWidth: SCROLLBAR_W,
      })
    }
  }

  #drawEntry(entry: ConsoleEntry, y: number): void {
    this.drawText(formatTimestamp(entry.ts), 0, y, {
      fontPx: TS_FONT_PX,
      material: this.materials.muted,
      maxWidthPx: TS_GUTTER_PX - 8,
    })
    const bodyX = TS_GUTTER_PX
    const bodyMaxPx = Math.max(20, this.rectW - bodyX - SCROLLBAR_W - 6)
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
    return this.#scrollOffset >= maxScroll - AUTOSCROLL_TOLERANCE_PX
  }

  #scrollToBottom(): void {
    const totalHeight = this.#entries.length * LINE_PX
    this.#scrollOffset = Math.max(0, totalHeight - this.#contentH())
  }

  #setScroll(next: number): void {
    const prev = this.#scrollOffset
    this.#scrollOffset = next
    this.#clampScroll()
    if (prev !== this.#scrollOffset) this.requestRender()
  }

  #clampScroll(): void {
    const totalHeight = this.#entries.length * LINE_PX
    const maxScroll = Math.max(0, totalHeight - this.#contentH())
    this.#scrollOffset = Math.max(0, Math.min(maxScroll, this.#scrollOffset))
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

function boostedPixelDelta(delta: number): number {
  const now = performance.now()
  const fresh = now - lastWheelAt > 120
  lastWheelAt = now
  if (!fresh || Math.abs(delta) >= WHEEL_START_BOOST_PX) return delta
  return Math.sign(delta) * WHEEL_START_BOOST_PX
}
