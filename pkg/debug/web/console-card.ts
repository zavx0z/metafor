/**
 * ConsoleCard — append-only лог как UiCard на общем UiCanvas.
 *
 * Ring-buffer 1000 строк, ts/level/text;
 * autoscroll если был у дна; wheel-scroll; scrollbar; Cmd+C copy через
 * toText() (caller сам слушает keydown). Отличия:
 *  - не держит свой Renderer/Scene/ViewPoint — node добавлен в общую сцену
 *  - render через canvas.requestRender()
 *  - rect получает извне через setRect
 */

import {
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  Text,
  TextMaterial,
  TrueTypeFont,
} from "@metafor/engine"
import type {CardRect, UiCanvas, UiCard} from "@metafor/ui"
import {palette} from "@metafor/ui"

export type ConsoleEntry = {
  ts: string
  level?: string | undefined
  text: string
}

const LINE_PX = 16
const FONT_PX = 12
const TS_FONT_PX = 10
const PAD_TOP_PX = 34
const PAD_LEFT_PX = 8
const PAD_RIGHT_PX = 8
const PAD_BOTTOM_PX = 6
const HEADER_H_PX = 28
const TS_GUTTER_PX = 70

const COLOR_BG = palette.bgCode
const COLOR_BORDER = palette.borderBright
const COLOR_HEADER_RULE = palette.borderDim
const COLOR_TS = palette.muted
const COLOR_TEXT = palette.text
const COLOR_TITLE = palette.cyan
const COLOR_WARN = palette.warnText
const COLOR_ERROR = palette.errorText
const COLOR_DEBUG = palette.muted

const MAX_ENTRIES = 1000
const AUTOSCROLL_TOLERANCE_PX = 20

type RenderedEntry = {
  ts: Text
  body: Text
  data: ConsoleEntry
}

export class ConsoleCard implements UiCard {
  readonly node = new Object3D()
  readonly #background: Mesh
  readonly #borderTop: Mesh
  readonly #borderBottom: Mesh
  readonly #borderLeft: Mesh
  readonly #borderRight: Mesh
  readonly #headerRule: Mesh
  readonly #logContainer: Object3D
  #titleText: Text | null = null
  #counterText: Text | null = null
  #emptyText: Text | null = null

  #canvas: UiCanvas | null = null
  #font: TrueTypeFont | null = null
  #pixelScale = 0.001
  #rectW = 100
  #rectH = 100
  #scrollOffset = 0
  #entries: RenderedEntry[] = []
  #pendingEntries: ConsoleEntry[] = []
  #scrollbarTrack: Mesh | null = null
  #scrollbarThumb: Mesh | null = null
  #fadeOverlays: Mesh[] = []

  #tsMaterial = new TextMaterial({color: COLOR_TS})
  #titleMaterial = new TextMaterial({color: COLOR_TITLE})
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

    this.#headerRule = new Mesh(
      new PlaneGeometry({width: 1, height: 1}),
      new MeshBasicMaterial({color: COLOR_HEADER_RULE}),
    )
    this.#headerRule.position.z = 0.001
    this.node.add(this.#headerRule)

    this.#logContainer = new Object3D()
    this.#logContainer.position.z = 0.001
    this.node.add(this.#logContainer)
  }

  attachCanvas(canvas: UiCanvas): void {
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
    const bw = 1 * pixelScale
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

    this.#syncHeader()
    if (this.#pendingEntries.length > 0) {
      const items = this.#pendingEntries
      this.#pendingEntries = []
      this.pushEntries(items)
    }
    this.#applyScroll()
  }

  pushEntries(entries: ConsoleEntry[]): void {
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
    this.#syncHeader()
    this.#canvas?.requestRender()
  }

  clear(): void {
    for (const entry of this.#entries) this.#disposeEntry(entry)
    this.#entries = []
    this.#scrollOffset = 0
    this.#applyScroll()
    this.#syncHeader()
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
    if (pixelDelta !== 0) this.#setScroll(this.#scrollOffset + pixelDelta)
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
    this.#disposeHeaderText()
    this.#disposeFadeOverlays()
  }

  #syncHeader(): void {
    if (this.#font === null) return
    this.#disposeHeaderText()

    const ruleH = 1 * this.#pixelScale
    this.#headerRule.geometry = new PlaneGeometry({width: Math.max(1, this.#rectW - 16) * this.#pixelScale, height: ruleH})
    this.#headerRule.position.x = (this.#rectW / 2) * this.#pixelScale
    this.#headerRule.position.y = -HEADER_H_PX * this.#pixelScale
    this.#headerRule.visible = true
    this.#headerRule.updateMatrix()

    this.#titleText = new Text("Console / Target", this.#font, 13 * this.#pixelScale, this.#titleMaterial)
    this.#titleText.position.x = 20 * this.#pixelScale
    this.#titleText.position.y = -20 * this.#pixelScale
    this.#titleText.updateMatrix()
    this.node.add(this.#titleText)

    this.#counterText = new Text(`${this.#entries.length} lines`, this.#font, 11 * this.#pixelScale, this.#tsMaterial)
    this.#counterText.position.x = Math.max(150, this.#rectW - 100) * this.#pixelScale
    this.#counterText.position.y = -20 * this.#pixelScale
    this.#counterText.updateMatrix()
    this.node.add(this.#counterText)

    if (this.#entries.length === 0) {
      this.#emptyText = new Text("waiting for target stdout/stderr...", this.#font, 12 * this.#pixelScale, this.#tsMaterial)
      this.#emptyText.position.x = 20 * this.#pixelScale
      this.#emptyText.position.y = -(PAD_TOP_PX + 24) * this.#pixelScale
      this.#emptyText.updateMatrix()
      this.node.add(this.#emptyText)
    }
  }

  #contentH(): number {
    return Math.max(1, this.#rectH - PAD_TOP_PX - PAD_BOTTOM_PX)
  }

  #appendEntry(entry: ConsoleEntry): void {
    if (this.#font === null) return
    const tsFontWorld = TS_FONT_PX * this.#pixelScale
    const fontWorld = FONT_PX * this.#pixelScale
    const ts = new Text(formatTimestamp(entry.ts), this.#font, tsFontWorld, this.#tsMaterial)
    ts.name = "ts"
    const bodyMaxPx = Math.max(20, this.#rectW - PAD_LEFT_PX - PAD_RIGHT_PX - TS_GUTTER_PX - 16)
    const text = clipConsoleLine(entry.text.length > 4096 ? `${entry.text.slice(0, 4096)}...` : entry.text, bodyMaxPx, FONT_PX)
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
    const contentBottomPx = Math.max(PAD_TOP_PX, this.#rectH - PAD_BOTTOM_PX)

    for (let i = 0; i < this.#entries.length; i++) {
      const e = this.#entries[i]!
      const rowTopPx = PAD_TOP_PX + i * LINE_PX - this.#scrollOffset
      const visible = rowTopPx >= PAD_TOP_PX - LINE_PX && rowTopPx <= contentBottomPx
      e.ts.visible = visible
      e.body.visible = visible
      if (!visible) continue
      e.ts.material = this.#tsMaterial
      e.body.material = this.#materialForLevel(e.data.level)
      const rowTopWorld = -rowTopPx * this.#pixelScale
      e.ts.position.x = tsXWorld
      e.ts.position.y = rowTopWorld - tsFontWorld
      e.ts.updateMatrix()
      e.body.position.x = bodyXWorld
      e.body.position.y = rowTopWorld - fontWorld
      e.body.updateMatrix()
    }
    this.#updateScrollbar()
    this.#updateEdgeFade()
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
        new MeshBasicMaterial({color: palette.borderRule}),
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
        new MeshBasicMaterial({color: palette.muted}),
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

  #updateEdgeFade(): void {
    const visibleHeight = this.#contentH()
    if (visibleHeight <= 0 || this.#rectW <= 0) return

    const size = Math.max(0, Math.min(22, visibleHeight / 2))
    if (size <= 0) return

    const contentW = Math.max(1, this.#rectW - PAD_LEFT_PX - PAD_RIGHT_PX - 8)
    const x = PAD_LEFT_PX
    const top = PAD_TOP_PX
    const steps = 8
    const stepH = size / steps
    const maxAlpha = 0.86
    const overlays: Array<{y: number; h: number; alpha: number}> = []

    for (let i = 0; i < steps; i++) {
      const t = 1 - i / steps
      overlays.push({y: top + i * stepH, h: stepH + 0.75, alpha: maxAlpha * t * t})
    }
    for (let i = 0; i < steps; i++) {
      const t = (i + 1) / steps
      overlays.push({y: top + visibleHeight - size + i * stepH, h: stepH + 0.75, alpha: maxAlpha * t * t})
    }

    for (let i = 0; i < overlays.length; i++) {
      const overlay = overlays[i]!
      const color = COLOR_BG.clone()
      color.a = overlay.alpha
      let mesh = this.#fadeOverlays[i]
      if (mesh === undefined) {
        mesh = new Mesh(
          new PlaneGeometry({width: contentW * this.#pixelScale, height: overlay.h * this.#pixelScale}),
          new MeshBasicMaterial({color}),
        )
        mesh.position.z = 0.004
        this.#fadeOverlays[i] = mesh
        this.node.add(mesh)
      } else {
        this.#canvas?.renderer.invalidateGeometry(mesh.geometry)
        mesh.geometry = new PlaneGeometry({width: contentW * this.#pixelScale, height: overlay.h * this.#pixelScale})
        const mat = mesh.material as MeshBasicMaterial
        mat.color = color
      }
      mesh.visible = overlay.h > 0
      mesh.position.x = (x + contentW / 2) * this.#pixelScale
      mesh.position.y = -(overlay.y + overlay.h / 2) * this.#pixelScale
      mesh.updateMatrix()
    }
    for (let i = overlays.length; i < this.#fadeOverlays.length; i++) this.#fadeOverlays[i]!.visible = false
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

  #disposeHeaderText(): void {
    const renderer = this.#canvas?.renderer
    for (const text of [this.#titleText, this.#counterText, this.#emptyText]) {
      if (text === null) continue
      if (renderer !== undefined) {
        renderer.invalidateGeometry(text.stencilGeometry)
        renderer.invalidateGeometry(text.coverGeometry)
      }
      const idx = this.node.children.indexOf(text)
      if (idx >= 0) this.node.children.splice(idx, 1)
    }
    this.#titleText = null
    this.#counterText = null
    this.#emptyText = null
  }

  #disposeFadeOverlays(): void {
    const renderer = this.#canvas?.renderer
    for (const mesh of this.#fadeOverlays) {
      if (renderer !== undefined) renderer.invalidateGeometry(mesh.geometry)
      const idx = this.node.children.indexOf(mesh)
      if (idx >= 0) this.node.children.splice(idx, 1)
    }
    this.#fadeOverlays = []
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
