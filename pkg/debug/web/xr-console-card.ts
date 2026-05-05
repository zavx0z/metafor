/**
 * XrConsoleCard — append-only лог как XrCard на общем XrCanvas.
 *
 * Перенесено из xr-console.ts: ring-buffer 1000 строк, ts/level/text;
 * autoscroll если был у дна; wheel-scroll; scrollbar; Cmd+C copy через
 * toText() (caller сам слушает keydown). Отличия:
 *  - не держит свой Renderer/Scene/ViewPoint — node добавлен в общую сцену
 *  - render через canvas.requestRender()
 *  - rect получает извне через setRect
 */

import {
  Color,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  Text,
  TextMaterial,
  TrueTypeFont,
} from "@metafor/engine"
import type {CardRect, XrCanvas, XrCard} from "./xr-canvas.ts"

export type XrConsoleEntry = {
  ts: string
  level?: string | undefined
  text: string
}

const LINE_PX = 16
const FONT_PX = 12
const TS_FONT_PX = 10
const PAD_TOP_PX = 8
const PAD_LEFT_PX = 8
const PAD_RIGHT_PX = 8
const PAD_BOTTOM_PX = 6
const TS_GUTTER_PX = 70

const COLOR_BG = new Color(28 / 255, 34 / 255, 42 / 255, 1.0)
const COLOR_BORDER = new Color(99 / 255, 110 / 255, 130 / 255, 1.0)
const COLOR_TS = new Color(110 / 255, 118 / 255, 129 / 255, 0.85)
const COLOR_TEXT = new Color(225 / 255, 228 / 255, 233 / 255, 1)
const COLOR_WARN = new Color(210 / 255, 153 / 255, 34 / 255, 1)
const COLOR_ERROR = new Color(247 / 255, 129 / 255, 102 / 255, 1)
const COLOR_DEBUG = new Color(139 / 255, 148 / 255, 158 / 255, 1)

const MAX_ENTRIES = 1000
const AUTOSCROLL_TOLERANCE_PX = 20

type RenderedEntry = {
  ts: Text
  body: Text
  data: XrConsoleEntry
}

export class XrConsoleCard implements XrCard {
  readonly node = new Object3D()
  readonly #background: Mesh
  readonly #borderTop: Mesh
  readonly #borderBottom: Mesh
  readonly #borderLeft: Mesh
  readonly #borderRight: Mesh
  readonly #logContainer: Object3D

  #canvas: XrCanvas | null = null
  #font: TrueTypeFont | null = null
  #pixelScale = 0.001
  #rectW = 100
  #rectH = 100
  #scrollOffset = 0
  #scrollAccum = 0
  #entries: RenderedEntry[] = []
  #pendingEntries: XrConsoleEntry[] = []
  #scrollbarTrack: Mesh | null = null
  #scrollbarThumb: Mesh | null = null

  #tsMaterial = new TextMaterial({color: COLOR_TS})
  #infoMaterial = new TextMaterial({color: COLOR_TEXT})
  #warnMaterial = new TextMaterial({color: COLOR_WARN})
  #errorMaterial = new TextMaterial({color: COLOR_ERROR})
  #debugMaterial = new TextMaterial({color: COLOR_DEBUG})

  constructor() {
    this.#background = new Mesh(
      new PlaneGeometry({width: 1, height: 1}),
      new MeshBasicMaterial({color: COLOR_BG}),
    )
    this.#background.position.z = -0.005
    this.node.add(this.#background)

    const borderMat = new MeshBasicMaterial({color: COLOR_BORDER})
    this.#borderTop = new Mesh(new PlaneGeometry({width: 1, height: 1}), borderMat)
    this.#borderBottom = new Mesh(new PlaneGeometry({width: 1, height: 1}), borderMat)
    this.#borderLeft = new Mesh(new PlaneGeometry({width: 1, height: 1}), borderMat)
    this.#borderRight = new Mesh(new PlaneGeometry({width: 1, height: 1}), borderMat)
    for (const m of [this.#borderTop, this.#borderBottom, this.#borderLeft, this.#borderRight]) {
      m.position.z = -0.001
      this.node.add(m)
    }

    this.#logContainer = new Object3D()
    this.#logContainer.position.z = 0.001
    this.node.add(this.#logContainer)
  }

  attachCanvas(canvas: XrCanvas): void {
    this.#canvas = canvas
  }

  setRect(rect: CardRect, pixelScale: number, font: TrueTypeFont): void {
    this.#font = font
    this.#pixelScale = pixelScale
    this.#rectW = rect.w
    this.#rectH = rect.h
    this.#background.geometry = new PlaneGeometry({
      width: rect.w * pixelScale,
      height: rect.h * pixelScale,
    })
    this.#background.position.x = (rect.w / 2) * pixelScale
    this.#background.position.y = -(rect.h / 2) * pixelScale
    this.#background.updateMatrix()

    // Borders 1px.
    const bw = 2 * pixelScale
    const cw = rect.w * pixelScale
    const ch = rect.h * pixelScale
    this.#borderTop.geometry = new PlaneGeometry({width: cw, height: bw})
    this.#borderTop.position.x = cw / 2
    this.#borderTop.position.y = -bw / 2
    this.#borderTop.updateMatrix()
    this.#borderBottom.geometry = new PlaneGeometry({width: cw, height: bw})
    this.#borderBottom.position.x = cw / 2
    this.#borderBottom.position.y = -ch + bw / 2
    this.#borderBottom.updateMatrix()
    this.#borderLeft.geometry = new PlaneGeometry({width: bw, height: ch})
    this.#borderLeft.position.x = bw / 2
    this.#borderLeft.position.y = -ch / 2
    this.#borderLeft.updateMatrix()
    this.#borderRight.geometry = new PlaneGeometry({width: bw, height: ch})
    this.#borderRight.position.x = cw - bw / 2
    this.#borderRight.position.y = -ch / 2
    this.#borderRight.updateMatrix()

    if (this.#pendingEntries.length > 0) {
      const items = this.#pendingEntries
      this.#pendingEntries = []
      this.pushEntries(items)
    }
    this.#applyScroll()
  }

  pushEntries(entries: XrConsoleEntry[]): void {
    if (entries.length === 0) return
    if (this.#font === null) {
      this.#pendingEntries.push(...entries)
      return
    }
    const wasAtBottom = this.#isAtBottom()
    for (const e of entries) this.#appendEntry(e)
    while (this.#entries.length > MAX_ENTRIES) {
      const oldest = this.#entries.shift()
      if (oldest === undefined) break
      this.#disposeEntry(oldest)
    }
    if (wasAtBottom) this.#scrollToBottom()
    this.#applyScroll()
    this.#canvas?.requestRender()
  }

  clear(): void {
    for (const entry of this.#entries) this.#disposeEntry(entry)
    this.#entries = []
    this.#scrollOffset = 0
    this.#applyScroll()
    this.#canvas?.requestRender()
  }

  toText(): string {
    return this.#entries.map((e) => `${formatTimestamp(e.data.ts)}\t${e.data.text}`).join("\n")
  }

  onWheel(event: WheelEvent): void {
    const pixelDelta = event.deltaMode === 1
      ? event.deltaY * LINE_PX
      : event.deltaMode === 2
        ? event.deltaY * this.#contentH()
        : event.deltaY
    this.#scrollAccum += pixelDelta
    const step = Math.trunc(this.#scrollAccum)
    this.#scrollAccum -= step
    if (step !== 0) this.#setScroll(this.#scrollOffset + step)
  }

  onKey(event: KeyboardEvent): void {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "c") {
      event.preventDefault()
      const text = this.toText()
      if (text.length > 0) void navigator.clipboard.writeText(text)
    }
  }

  dispose(): void {
    for (const entry of this.#entries) this.#disposeEntry(entry)
    this.#entries = []
  }

  #contentH(): number {
    return Math.max(1, this.#rectH - PAD_TOP_PX - PAD_BOTTOM_PX)
  }

  #appendEntry(entry: XrConsoleEntry): void {
    if (this.#font === null) return
    const tsFontWorld = TS_FONT_PX * this.#pixelScale
    const fontWorld = FONT_PX * this.#pixelScale
    const ts = new Text(formatTimestamp(entry.ts), this.#font, tsFontWorld, this.#tsMaterial)
    ts.name = "ts"
    const text = entry.text.length > 4096 ? `${entry.text.slice(0, 4096)}…` : entry.text
    const material = this.#materialForLevel(entry.level)
    const body = new Text(text, this.#font, fontWorld, material)
    body.name = "body"
    this.#logContainer.add(ts)
    this.#logContainer.add(body)
    this.#entries.push({ts, body, data: entry})
  }

  #disposeEntry(entry: RenderedEntry): void {
    const renderer = this.#canvas?.renderer
    if (renderer !== undefined) {
      renderer.invalidateGeometry(entry.ts.stencilGeometry)
      renderer.invalidateGeometry(entry.ts.coverGeometry)
      renderer.invalidateGeometry(entry.body.stencilGeometry)
      renderer.invalidateGeometry(entry.body.coverGeometry)
    }
    const idx1 = this.#logContainer.children.indexOf(entry.ts)
    if (idx1 >= 0) this.#logContainer.children.splice(idx1, 1)
    const idx2 = this.#logContainer.children.indexOf(entry.body)
    if (idx2 >= 0) this.#logContainer.children.splice(idx2, 1)
  }

  #materialForLevel(level: string | undefined): TextMaterial {
    switch (level) {
      case "warning":
      case "warn": return this.#warnMaterial
      case "error": return this.#errorMaterial
      case "debug":
      case "verbose": return this.#debugMaterial
      default: return this.#infoMaterial
    }
  }

  #applyScroll(): void {
    const tsXWorld = PAD_LEFT_PX * this.#pixelScale
    const bodyXWorld = (PAD_LEFT_PX + TS_GUTTER_PX) * this.#pixelScale
    const tsFontWorld = TS_FONT_PX * this.#pixelScale
    const fontWorld = FONT_PX * this.#pixelScale
    const lineHeightWorld = LINE_PX * this.#pixelScale
    const padTopWorld = PAD_TOP_PX * this.#pixelScale
    const scrollWorld = this.#scrollOffset * this.#pixelScale

    for (let i = 0; i < this.#entries.length; i++) {
      const e = this.#entries[i]!
      const rowTopWorld = -(padTopWorld + i * lineHeightWorld) + scrollWorld
      e.ts.position.x = tsXWorld
      e.ts.position.y = rowTopWorld - tsFontWorld
      e.ts.updateMatrix()
      e.body.position.x = bodyXWorld
      e.body.position.y = rowTopWorld - fontWorld
      e.body.updateMatrix()
    }
    this.#updateScrollbar()
  }

  #updateScrollbar(): void {
    const totalHeight = this.#entries.length * LINE_PX
    const visibleHeight = this.#contentH()
    if (totalHeight <= visibleHeight) {
      if (this.#scrollbarTrack !== null) this.#scrollbarTrack.visible = false
      if (this.#scrollbarThumb !== null) this.#scrollbarThumb.visible = false
      return
    }
    const trackWidthPx = 4
    const trackWidthWorld = trackWidthPx * this.#pixelScale
    const trackHeightWorld = visibleHeight * this.#pixelScale
    const trackXWorld = (this.#rectW - PAD_RIGHT_PX - trackWidthPx / 2) * this.#pixelScale
    const trackTopWorld = -PAD_TOP_PX * this.#pixelScale

    if (this.#scrollbarTrack === null) {
      this.#scrollbarTrack = new Mesh(
        new PlaneGeometry({width: trackWidthWorld, height: trackHeightWorld}),
        new MeshBasicMaterial({color: new Color(48 / 255, 54 / 255, 61 / 255, 0.6)}),
      )
      this.#scrollbarTrack.position.z = 0.0015
      this.node.add(this.#scrollbarTrack)
    } else {
      this.#scrollbarTrack.geometry = new PlaneGeometry({width: trackWidthWorld, height: trackHeightWorld})
    }
    this.#scrollbarTrack.visible = true
    this.#scrollbarTrack.position.x = trackXWorld
    this.#scrollbarTrack.position.y = trackTopWorld - trackHeightWorld / 2
    this.#scrollbarTrack.updateMatrix()

    const thumbRatio = visibleHeight / totalHeight
    const thumbHeightWorld = Math.max(trackWidthWorld * 4, trackHeightWorld * thumbRatio)
    const maxScroll = totalHeight - visibleHeight
    const scrollProgress = maxScroll === 0 ? 0 : this.#scrollOffset / maxScroll
    const thumbCenterY = trackTopWorld - thumbHeightWorld / 2 -
      (trackHeightWorld - thumbHeightWorld) * scrollProgress

    if (this.#scrollbarThumb === null) {
      this.#scrollbarThumb = new Mesh(
        new PlaneGeometry({width: trackWidthWorld, height: thumbHeightWorld}),
        new MeshBasicMaterial({color: new Color(110 / 255, 118 / 255, 129 / 255, 0.85)}),
      )
      this.#scrollbarThumb.position.z = 0.0016
      this.node.add(this.#scrollbarThumb)
    } else {
      this.#scrollbarThumb.geometry = new PlaneGeometry({width: trackWidthWorld, height: thumbHeightWorld})
    }
    this.#scrollbarThumb.visible = true
    this.#scrollbarThumb.position.x = trackXWorld
    this.#scrollbarThumb.position.y = thumbCenterY
    this.#scrollbarThumb.updateMatrix()
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
    const totalHeight = this.#entries.length * LINE_PX
    const maxScroll = Math.max(0, totalHeight - this.#contentH())
    const clamped = Math.max(0, Math.min(maxScroll, next))
    if (clamped === this.#scrollOffset) return
    this.#scrollOffset = clamped
    this.#applyScroll()
    this.#canvas?.requestRender()
  }
}

function formatTimestamp(ts: string): string {
  const t = ts.indexOf("T")
  if (t < 0) return ts
  const dot = ts.indexOf(".", t)
  return ts.slice(t + 1, dot < 0 ? undefined : dot)
}
