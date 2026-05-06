/**
 * XrSourceCard — source-editor на Card@ui.
 *
 * Главные принципы:
 *  • extends Card → bg/border гарантированно clamp'нуты в card-rect
 *    (никаких "съехал bg вправо/влево из-за parallax").
 *  • Immediate-mode rendering: каждый requestRender пересчитывает
 *    видимые строки от #scrollOffset до #scrollOffset+visible и рисует
 *    их через drawText. Никакого translate(codeContainer) — строки
 *    физически не существуют вне card-rect, leak'нуть некуда.
 *  • highlight/exec-arrow рисуются drawRect/drawText — clamp protect.
 *  • Scan-эффект (animated line) живёт отдельным persistent mesh в
 *    this.node (вне layer'а, не пересоздаётся на каждый rerender);
 *    animate через RAF + canvas.requestRender.
 */

import {
  Color,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Text,
  TextMaterial,
} from "@metafor/engine"
import {Card, Z, palette, scrollbar} from "./xr-card.ts"

export type XrToken = {s: number; e: number; c: string}
export type XrSourceTokens = XrToken[][]

export type XrSource = {
  lines: string[]
  currentLine: number
  location: string
  tokens?: XrSourceTokens
}

export type XrSourceRuntimeState = "idle" | "loading" | "paused" | "running" | "disconnected"

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
const ACTIVITY_SEGMENTS = 18

const COLOR_BG = new Color(28 / 255, 34 / 255, 42 / 255, 1.0)
const COLOR_HIGHLIGHT = new Color(36 / 255, 64 / 255, 164 / 255, 1)
const COLOR_HEADER_RULE = palette.borderDim
const COLOR_GUTTER_RULE = new Color(48 / 255, 54 / 255, 61 / 255, 1)
const COLOR_SCAN = new Color(111 / 255, 211 / 255, 255 / 255, 0.9)

const TOKEN_COLORS: Record<string, Color> = {
  k: new Color(255 / 255, 123 / 255, 114 / 255, 1),
  s: new Color(165 / 255, 214 / 255, 255 / 255, 1),
  n: new Color(121 / 255, 192 / 255, 255 / 255, 1),
  c: new Color(139 / 255, 148 / 255, 158 / 255, 1),
  t: new Color(255 / 255, 166 / 255, 87 / 255, 1),
  f: new Color(210 / 255, 168 / 255, 255 / 255, 1),
  p: new Color(201 / 255, 209 / 255, 217 / 255, 1),
  d: new Color(225 / 255, 228 / 255, 233 / 255, 1),
}

export class XrSourceCard extends Card {
  #current: XrSource | null = null
  #scrollOffset = 0
  #scrollAccum = 0
  #runtimeState: XrSourceRuntimeState = "idle"

  // Persistent scan-mesh + activity dots — живут в this.node, не в layer,
  // чтобы animate через RAF не дёргал full rerender.
  readonly #scanLine: Mesh
  readonly #activitySegments: Mesh[] = []
  #scanRaf: number | null = null
  #scanStartedAt = 0
  #scanLoop = false

  // Cached materials.
  readonly #titleMaterial = new TextMaterial({color: palette.cyan})
  readonly #locationMaterial = new TextMaterial({color: palette.muted})
  readonly #lineMaterial = new TextMaterial({color: palette.text})
  readonly #gutterMaterial = new TextMaterial({color: palette.muted})
  readonly #gutterHotMaterial = new TextMaterial({color: palette.orange})
  readonly #execArrowMaterial = new TextMaterial({color: palette.orange})
  readonly #tokenMaterials: Map<string, TextMaterial> = new Map()

  constructor() {
    super({bgColor: COLOR_BG, borderColor: palette.borderDim, borderWidthPx: 1})
    this.node.name = "SourceCard"

    for (const [category, color] of Object.entries(TOKEN_COLORS)) {
      this.#tokenMaterials.set(category, new TextMaterial({color}))
    }

    this.#scanLine = new Mesh(
      new PlaneGeometry({width: 1, height: 1}),
      new MeshBasicMaterial({color: COLOR_SCAN}),
    )
    this.#scanLine.name = "SourceCard.scanLine"
    this.#scanLine.visible = false
    // Чуть выше border (~-0.0001) и ниже text (Z.TEXT). Микро-z, чтобы
    // perspective parallax не сдвигал scan относительно строк.
    this.#scanLine.position.z = Z.SEPARATOR
    this.node.add(this.#scanLine)

    for (let i = 0; i < ACTIVITY_SEGMENTS; i++) {
      const color = i % 3 === 0
        ? new Color(82 / 255, 196 / 255, 123 / 255, 0.85)
        : i % 3 === 1
          ? new Color(111 / 255, 211 / 255, 255 / 255, 0.75)
          : new Color(255 / 255, 190 / 255, 111 / 255, 0.65)
      const segment = new Mesh(
        new PlaneGeometry({width: 1, height: 1}),
        new MeshBasicMaterial({color}),
      )
      segment.name = "SourceCard.activity"
      segment.visible = false
      segment.position.z = Z.SEPARATOR
      this.#activitySegments.push(segment)
      this.node.add(segment)
    }
  }

  setSource(source: XrSource): void {
    const prev = this.#current
    const lineChanged = prev?.currentLine !== source.currentLine
    const fileChanged = stripLine(prev?.location) !== stripLine(source.location)
    this.#current = source
    if (source.currentLine > 0) this.#runtimeState = "paused"
    if (lineChanged || fileChanged || prev === null) this.#startScan(false)

    if (source.currentLine > 0 && (lineChanged || fileChanged || prev === null)) {
      const visible = this.#visibleLineCount()
      this.#scrollOffset = Math.max(0, source.currentLine - 1 - Math.floor(visible / 2))
    }
    this.requestRender()
  }

  setRuntimeState(state: XrSourceRuntimeState): void {
    if (this.#runtimeState === state) return
    this.#runtimeState = state
    if (state === "running" || state === "loading") this.#startScan(true)
    else this.#stopScan()
    this.requestRender()
  }

  onWheel(event: WheelEvent): void {
    if (this.#current === null) return
    const linesDelta = event.deltaMode === 1
      ? event.deltaY
      : event.deltaMode === 2
        ? event.deltaY * this.#visibleLineCount()
        : (this.#scrollAccum + event.deltaY) / LINE_PX
    const stepLines = Math.trunc(linesDelta)
    if (event.deltaMode === 0) {
      this.#scrollAccum = (this.#scrollAccum + event.deltaY) - stepLines * LINE_PX
    } else {
      this.#scrollAccum = 0
    }
    if (stepLines === 0) return
    this.#setScroll(this.#scrollOffset + stepLines)
  }

  onKey(event: KeyboardEvent): void {
    if (this.#current === null) return
    const visible = this.#visibleLineCount()
    let handled = true
    switch (event.key) {
      case "ArrowDown": this.#setScroll(this.#scrollOffset + 1); break
      case "ArrowUp": this.#setScroll(this.#scrollOffset - 1); break
      case "PageDown": this.#setScroll(this.#scrollOffset + visible); break
      case "PageUp": this.#setScroll(this.#scrollOffset - visible); break
      case "Home": this.#setScroll(0); break
      case "End": this.#setScroll(this.#current.lines.length); break
      case "g":
        if (this.#current.currentLine > 0) {
          this.#setScroll(this.#current.currentLine - 1 - Math.floor(visible / 2))
        }
        break
      default: handled = false
    }
    if (handled) event.preventDefault()
  }

  override dispose(): void {
    this.#stopScan()
    super.dispose()
  }

  protected render(): void {
    // Header.
    const titleStr = `Source · ${this.#runtimeState}`
    this.drawText(titleStr, 20, 8, {
      fontPx: 13,
      material: this.#titleMaterial,
      maxWidthPx: this.rectW - 40,
    })

    // Location справа от title.
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

    // Header rule.
    this.drawRect(8, HEADER_H_PX, Math.max(1, this.rectW - 16), 1, COLOR_HEADER_RULE, Z.SEPARATOR)

    // Sync scan/activity geometry под текущий size.
    this.#syncScanGeometry()

    // Empty / placeholder.
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
    this.#scrollOffset = Math.max(0, Math.min(this.#scrollOffset, Math.max(0, total - visible)))

    const gutterPx = this.#gutterWidthPx(total)
    const contentW = Math.max(1, this.rectW - PAD_LEFT_PX - PAD_RIGHT_PX - SCROLLBAR_W - 4)
    const contentH = Math.max(1, this.rectH - PAD_TOP_PX - PAD_BOTTOM_PX)
    const codeMaxPx = Math.max(1, contentW - gutterPx - CODE_LEFT_PAD_PX - 8)

    // Gutter rule (вертикальная линия между gutter и code).
    this.drawRect(
      PAD_LEFT_PX + gutterPx,
      PAD_TOP_PX,
      1,
      contentH,
      COLOR_GUTTER_RULE,
      Z.SEPARATOR,
    )

    // Highlight под текущей строкой (если она в visible-окне).
    const currentRowIdx = currentLine - 1 - this.#scrollOffset
    if (currentLine > 0 && currentRowIdx >= 0 && currentRowIdx < visible) {
      const highlightY = PAD_TOP_PX + currentRowIdx * LINE_PX
      const highlightH = Math.min(LINE_PX, CODE_FONT_PX + 4)
      this.drawRect(
        PAD_LEFT_PX,
        highlightY + (LINE_PX - highlightH) / 2,
        PAD_LEFT_PX + contentW,
        highlightH,
        COLOR_HIGHLIGHT,
        Z.ELEMENT,
      )
      // Exec arrow в gutter.
      this.drawText("▶", PAD_LEFT_PX + GUTTER_LEFT_PAD_PX * 0.4, highlightY + 1, {
        fontPx: CODE_FONT_PX,
        material: this.#execArrowMaterial,
        maxWidthPx: 12,
      })
    }

    // Видимые строки.
    for (let i = 0; i < visible; i++) {
      const lineIndex = this.#scrollOffset + i
      if (lineIndex >= total) break
      const lineNo = lineIndex + 1
      const isCurrent = lineNo === currentLine
      const rowY = PAD_TOP_PX + i * LINE_PX

      // Gutter номер строки (right-aligned в gutter-зоне).
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

      // Сама строка кода.
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

    // Scrollbar.
    if (total > visible) {
      scrollbar(this, this.rectW - PAD_RIGHT_PX - SCROLLBAR_W, PAD_TOP_PX, contentH, {
        offset: this.#scrollOffset,
        visible,
        total,
        trackWidth: SCROLLBAR_W,
      })
    }
  }

  #renderTokenizedLine(text: string, tokens: XrToken[], startX: number, y: number, maxPx: number): void {
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

  #setScroll(next: number): void {
    if (this.#current === null) return
    const visible = this.#visibleLineCount()
    const max = Math.max(0, this.#current.lines.length - visible)
    const clamped = Math.max(0, Math.min(max, Math.trunc(next)))
    if (clamped === this.#scrollOffset) return
    this.#scrollOffset = clamped
    this.requestRender()
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

  // ────────────────────────── Scan animation ──────────────────────────

  #syncScanGeometry(): void {
    const ps = this.pixelScale
    const w = Math.max(1, this.rectW - PAD_LEFT_PX - PAD_RIGHT_PX) * ps
    this.#scanLine.geometry = new PlaneGeometry({width: w, height: 2 * ps})
    this.#scanLine.position.x = (PAD_LEFT_PX + Math.max(1, this.rectW - PAD_LEFT_PX - PAD_RIGHT_PX) / 2) * ps
    this.#scanLine.updateMatrix()
    const segW = 2 * ps
    const segH = 8 * ps
    const segX = Math.max(PAD_LEFT_PX + 4, this.rectW - PAD_RIGHT_PX - 16) * ps
    for (const seg of this.#activitySegments) {
      seg.geometry = new PlaneGeometry({width: segW, height: segH})
      seg.position.x = segX
      seg.updateMatrix()
    }
  }

  #startScan(loop: boolean): void {
    this.#scanLoop = loop
    this.#scanStartedAt = performance.now()
    this.#scanLine.visible = true
    for (const seg of this.#activitySegments) seg.visible = true
    if (this.#scanRaf !== null) cancelAnimationFrame(this.#scanRaf)
    this.#scanRaf = requestAnimationFrame((now) => this.#animateScan(now))
  }

  #stopScan(): void {
    if (this.#scanRaf !== null) cancelAnimationFrame(this.#scanRaf)
    this.#scanRaf = null
    this.#scanLoop = false
    this.#scanLine.visible = false
    for (const seg of this.#activitySegments) seg.visible = false
    this.canvas?.requestRender()
  }

  #animateScan(now: number): void {
    const duration = this.#scanLoop ? 1200 : 520
    const elapsed = Math.max(0, now - this.#scanStartedAt)
    if (!this.#scanLoop && elapsed >= duration) {
      this.#stopScan()
      return
    }
    const progress = this.#scanLoop ? (elapsed % duration) / duration : elapsed / duration
    const ps = this.pixelScale
    const contentH = Math.max(1, this.rectH - PAD_TOP_PX - PAD_BOTTOM_PX)
    this.#scanLine.position.y = -(PAD_TOP_PX + progress * contentH) * ps
    this.#scanLine.updateMatrix()
    for (let i = 0; i < this.#activitySegments.length; i++) {
      const seg = this.#activitySegments[i]!
      const phase = (progress + i / this.#activitySegments.length) % 1
      seg.position.y = -(PAD_TOP_PX + phase * contentH) * ps
      seg.updateMatrix()
    }
    this.canvas?.requestRender()
    this.#scanRaf = requestAnimationFrame((next) => this.#animateScan(next))
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
