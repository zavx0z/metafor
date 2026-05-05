/**
 * XrSourceCard — source-editor как XrCard на общем XrCanvas.
 *
 * Перенесено из xr-overlay.ts: рендерит исходник текущего паузнутого фрейма,
 * подсветка строки, gutter с номерами, scrollbar. Отличия:
 *  - не держит свой Renderer/Scene/ViewPoint — node добавлен в общую сцену
 *  - rect получает извне через setRect(rect, pixelScale, font)
 *  - render через canvas.requestRender()
 *  - input wheel/key через onWheel/onKey методы XrCard
 *
 * Координаты внутри node — TL-anchored: child.position.x = px*pixelScale,
 * child.position.y = -px*pixelScale.
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

export type XrToken = {s: number; e: number; c: string}
export type XrSourceTokens = XrToken[][]

export type XrSource = {
  lines: string[]
  currentLine: number
  location: string
  tokens?: XrSourceTokens
}

const PAD_TOP_PX = 8
const PAD_LEFT_PX = 8
const PAD_RIGHT_PX = 8
const PAD_BOTTOM_PX = 6
const GUTTER_MIN_PX = 44
const GUTTER_LEFT_PAD_PX = 6
const GUTTER_RIGHT_PAD_PX = 8
const CODE_LEFT_PAD_PX = 8
const LINE_PX = 16
const CODE_FONT_PX = 12
const OVERSCAN_LINES = 40
const MAX_RENDERED_LINES = 350

const COLOR_BG = new Color(28 / 255, 34 / 255, 42 / 255, 1.0)
const COLOR_BORDER = new Color(99 / 255, 110 / 255, 130 / 255, 1.0)
const COLOR_HIGHLIGHT = new Color(36 / 255, 64 / 255, 164 / 255, 1)
const COLOR_EXEC_ARROW = new Color(255 / 255, 199 / 255, 95 / 255, 1)
const COLOR_TEXT = new Color(225 / 255, 228 / 255, 233 / 255, 1)
const COLOR_GUTTER = new Color(110 / 255, 118 / 255, 129 / 255, 0.8)
const COLOR_GUTTER_HOT = new Color(255 / 255, 199 / 255, 95 / 255, 1)
const COLOR_GUTTER_RULE = new Color(48 / 255, 54 / 255, 61 / 255, 1)

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

export class XrSourceCard implements XrCard {
  readonly node = new Object3D()
  readonly #background: Mesh
  readonly #borderTop: Mesh
  readonly #borderBottom: Mesh
  readonly #borderLeft: Mesh
  readonly #borderRight: Mesh
  readonly #gutterRule: Mesh
  readonly #codeContainer: Object3D
  #placeholder: Text | null = null
  readonly #lineMaterial: TextMaterial
  readonly #gutterMaterial: TextMaterial
  readonly #gutterHotMaterial: TextMaterial
  readonly #execArrowMaterial: TextMaterial
  readonly #tokenMaterials: Map<string, TextMaterial> = new Map()
  readonly #execHighlight: Mesh
  #execArrow: Text | null = null

  #canvas: XrCanvas | null = null
  #font: TrueTypeFont | null = null
  #pixelScale = 0.001
  #rectW = 600
  #rectH = 400
  #current: XrSource | null = null
  #scrollOffset = 0
  #scrollAccum = 0
  #totalLines = 0
  #windowStart = 0
  #windowSize = 0
  #pendingWindowRebuild = false
  #scrollbarTrack: Mesh | null = null
  #scrollbarThumb: Mesh | null = null

  constructor() {
    this.#background = new Mesh(
      new PlaneGeometry({width: 1, height: 1}),
      new MeshBasicMaterial({color: COLOR_BG}),
    )
    this.#background.position.z = -0.02
    this.node.add(this.#background)

    // 4 тонких mesh — top/bottom/left/right границы card.
    const borderMat = new MeshBasicMaterial({color: COLOR_BORDER})
    this.#borderTop = new Mesh(new PlaneGeometry({width: 1, height: 1}), borderMat)
    this.#borderBottom = new Mesh(new PlaneGeometry({width: 1, height: 1}), borderMat)
    this.#borderLeft = new Mesh(new PlaneGeometry({width: 1, height: 1}), borderMat)
    this.#borderRight = new Mesh(new PlaneGeometry({width: 1, height: 1}), borderMat)
    for (const m of [this.#borderTop, this.#borderBottom, this.#borderLeft, this.#borderRight]) {
      m.position.z = -0.01
      this.node.add(m)
    }

    this.#gutterRule = new Mesh(
      new PlaneGeometry({width: 1, height: 1}),
      new MeshBasicMaterial({color: COLOR_GUTTER_RULE}),
    )
    this.#gutterRule.position.z = 0.001
    this.node.add(this.#gutterRule)

    this.#lineMaterial = new TextMaterial({color: COLOR_TEXT})
    this.#gutterMaterial = new TextMaterial({color: COLOR_GUTTER})
    this.#gutterHotMaterial = new TextMaterial({color: COLOR_GUTTER_HOT})
    this.#execArrowMaterial = new TextMaterial({color: COLOR_EXEC_ARROW})
    for (const [category, color] of Object.entries(TOKEN_COLORS)) {
      this.#tokenMaterials.set(category, new TextMaterial({color}))
    }

    this.#execHighlight = new Mesh(
      new PlaneGeometry({width: 1, height: 1}),
      new MeshBasicMaterial({color: COLOR_HIGHLIGHT}),
    )
    this.#execHighlight.visible = false
    this.#execHighlight.position.z = -0.005
    this.node.add(this.#execHighlight)

    this.#codeContainer = new Object3D()
    this.#codeContainer.position.z = 0.002
    this.node.add(this.#codeContainer)
    // execArrow создаётся лениво в setRect когда font получен.
  }

  attachCanvas(canvas: XrCanvas): void {
    this.#canvas = canvas
  }

  setRect(rect: CardRect, pixelScale: number, font: TrueTypeFont): void {
    this.#font = font
    this.#pixelScale = pixelScale
    this.#rectW = rect.w
    this.#rectH = rect.h

    // Background — весь rect.
    this.#background.geometry = new PlaneGeometry({
      width: rect.w * pixelScale,
      height: rect.h * pixelScale,
    })
    this.#background.position.x = (rect.w / 2) * pixelScale
    this.#background.position.y = -(rect.h / 2) * pixelScale
    this.#background.updateMatrix()

    // Borders 1px — вокруг card.
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

    // Plaхолдер "waiting for source…" пока source не получен.
    if (this.#current === null) {
      if (this.#placeholder === null) {
        this.#placeholder = new Text(
          "waiting for target…",
          font,
          14 * pixelScale,
          new TextMaterial({color: new Color(110/255, 118/255, 129/255, 1)}),
        )
        this.node.add(this.#placeholder)
      }
      this.#placeholder.position.x = (rect.w / 2 - 80) * pixelScale
      this.#placeholder.position.y = -(rect.h / 2) * pixelScale
      this.#placeholder.visible = true
      this.#placeholder.updateMatrix()
    } else if (this.#placeholder !== null) {
      this.#placeholder.visible = false
    }

    // Lazy-init execArrow когда font получен.
    if (this.#execArrow === null) {
      this.#execArrow = new Text("▶", font, CODE_FONT_PX * pixelScale * 0.9, this.#execArrowMaterial)
      this.#execArrow.visible = false
      this.node.add(this.#execArrow)
    } else {
      // Resize: обновляем fontSize.
      const arrowFontWorld = CODE_FONT_PX * pixelScale * 0.9
      if (this.#execArrow.fontSize !== arrowFontWorld) {
        this.#execArrow.fontSize = arrowFontWorld
        this.#execArrow.updateGeometry()
        if (this.#canvas !== null) {
          this.#canvas.renderer.invalidateGeometry(this.#execArrow.stencilGeometry)
          this.#canvas.renderer.invalidateGeometry(this.#execArrow.coverGeometry)
        }
      }
    }

    if (this.#current !== null) this.#renderLines()
    this.#applyScroll()
    this.#canvas?.requestRender()
  }

  setSource(source: XrSource): void {
    const prev = this.#current
    const lineChanged = prev?.currentLine !== source.currentLine
    const fileChanged = stripLine(prev?.location) !== stripLine(source.location)
    this.#current = source

    if (source.currentLine > 0 && (lineChanged || fileChanged || prev === null)) {
      const visible = this.#visibleLineCount()
      this.#scrollOffset = Math.max(0, source.currentLine - 1 - Math.floor(visible / 2))
    }

    this.#renderLines()
    this.#applyScroll()
    this.#canvas?.requestRender()
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
      case "End": this.#setScroll(this.#totalLines); break
      case "g":
        if (this.#current.currentLine > 0) {
          this.#setScroll(this.#current.currentLine - 1 - Math.floor(visible / 2))
        }
        break
      default: handled = false
    }
    if (handled) event.preventDefault()
  }

  dispose(): void {
    this.#disposeCodeChildren()
  }

  #applyScroll(): void {
    const offsetWithinWindow = this.#scrollOffset - this.#windowStart
    this.#codeContainer.position.x = (PAD_LEFT_PX) * this.#pixelScale
    this.#codeContainer.position.y = -(PAD_TOP_PX) * this.#pixelScale + offsetWithinWindow * LINE_PX * this.#pixelScale
    this.#codeContainer.updateMatrix()
    this.#updateScrollbar()
  }

  #setScroll(next: number): void {
    const visible = this.#visibleLineCount()
    const max = Math.max(0, this.#totalLines - visible)
    const clamped = Math.max(0, Math.min(max, Math.trunc(next)))
    if (clamped === this.#scrollOffset) return
    this.#scrollOffset = clamped
    const windowEnd = this.#windowStart + this.#windowSize
    const visibleEnd = this.#scrollOffset + visible
    const needsRebuild =
      this.#scrollOffset < this.#windowStart + Math.min(OVERSCAN_LINES, this.#windowStart) ||
      visibleEnd > windowEnd - Math.min(OVERSCAN_LINES, this.#totalLines - windowEnd)
    if (needsRebuild) {
      this.#scheduleWindowRebuild()
    } else {
      this.#applyScroll()
      this.#canvas?.requestRender()
    }
  }

  #scheduleWindowRebuild(): void {
    if (this.#pendingWindowRebuild) return
    this.#pendingWindowRebuild = true
    requestAnimationFrame(() => {
      this.#pendingWindowRebuild = false
      this.#renderLines()
      this.#applyScroll()
      this.#canvas?.requestRender()
    })
  }

  #visibleLineCount(): number {
    const contentH = Math.max(1, this.#rectH - PAD_TOP_PX - PAD_BOTTOM_PX)
    return Math.max(1, Math.floor(contentH / LINE_PX))
  }

  #renderLines(): void {
    if (this.#font === null) return
    this.#disposeCodeChildren()
    this.#hideGutterRule()
    this.#execHighlight.visible = false
    if (this.#execArrow !== null) this.#execArrow.visible = false

    if (this.#current === null) {
      this.#totalLines = 0
      return
    }
    const lines = this.#current.lines
    const currentLine = this.#current.currentLine
    if (lines.length === 0) {
      this.#totalLines = 0
      return
    }

    this.#totalLines = lines.length
    const visible = this.#visibleLineCount()
    this.#scrollOffset = Math.max(0, Math.min(this.#scrollOffset, Math.max(0, lines.length - visible)))
    this.#windowSize = Math.min(lines.length, MAX_RENDERED_LINES, visible + 2 * OVERSCAN_LINES)
    this.#windowStart = Math.max(0, Math.min(lines.length - this.#windowSize, this.#scrollOffset - OVERSCAN_LINES))
    const windowEnd = this.#windowStart + this.#windowSize
    const arrow = this.#execArrow

    const lineFontWorld = CODE_FONT_PX * this.#pixelScale
    const gutterPx = this.#gutterWidthPx(lines.length)
    const contentPixelWidth = Math.max(1, this.#rectW - PAD_LEFT_PX - PAD_RIGHT_PX)
    const contentPixelHeight = Math.max(1, this.#rectH - PAD_TOP_PX - PAD_BOTTOM_PX)
    this.#syncGutterRule(gutterPx, contentPixelWidth, contentPixelHeight)
    const contentWorldW = contentPixelWidth * this.#pixelScale
    const highlightWorldH = LINE_PX * this.#pixelScale

    let highlightPlaced = false
    for (let i = 0; i < windowEnd - this.#windowStart; i++) {
      const lineIndex = this.#windowStart + i
      const lineNo = lineIndex + 1
      const isCurrent = lineNo === currentLine
      const text = lines[lineIndex] ?? ""
      const rowTopWorld = -(i * LINE_PX) * this.#pixelScale
      const baselineY = rowTopWorld - lineFontWorld

      if (isCurrent) {
        this.#execHighlight.geometry = new PlaneGeometry({width: contentWorldW, height: highlightWorldH})
        this.#execHighlight.position.x = (PAD_LEFT_PX + contentPixelWidth / 2) * this.#pixelScale
        this.#execHighlight.position.y = -PAD_TOP_PX * this.#pixelScale +
          (this.#scrollOffset - this.#windowStart) * LINE_PX * this.#pixelScale +
          rowTopWorld - highlightWorldH / 2
        this.#execHighlight.position.z = -0.005
        this.#execHighlight.visible = true
        this.#execHighlight.updateMatrix()

        if (arrow !== null) {
          arrow.position.x = (PAD_LEFT_PX + GUTTER_LEFT_PAD_PX * 0.4) * this.#pixelScale
          arrow.position.y = -PAD_TOP_PX * this.#pixelScale +
            (this.#scrollOffset - this.#windowStart) * LINE_PX * this.#pixelScale +
            baselineY
          arrow.visible = true
          arrow.updateMatrix()
        }
        highlightPlaced = true
      }

      const numStr = String(lineNo)
      const numMaterial = isCurrent ? this.#gutterHotMaterial : this.#gutterMaterial
      const numText = new Text(numStr, this.#font, lineFontWorld, numMaterial)
      numText.name = "gutter"
      numText.position.x = this.#lineNumberX(numStr, gutterPx, lineFontWorld)
      numText.position.y = baselineY
      numText.updateMatrix()
      this.#codeContainer.add(numText)

      if (text.trim().length > 0) {
        const trimmed = text.length > 200 ? `${text.slice(0, 199)}…` : text
        const codeStartX = (gutterPx + CODE_LEFT_PAD_PX) * this.#pixelScale
        const lineTokens = this.#current.tokens?.[lineIndex]
        if (lineTokens !== undefined && lineTokens.length > 0) {
          this.#renderTokenizedLine(trimmed, lineTokens, codeStartX, baselineY, lineFontWorld)
        } else {
          const lineText = new Text(trimmed, this.#font, lineFontWorld, this.#lineMaterial)
          lineText.name = "code"
          lineText.position.x = codeStartX
          lineText.position.y = baselineY
          lineText.updateMatrix()
          this.#codeContainer.add(lineText)
        }
      }
    }
    void highlightPlaced
  }

  #renderTokenizedLine(text: string, tokens: XrToken[], startX: number, baselineY: number, fontSize: number): void {
    if (this.#font === null) return
    let cursor = 0
    let cursorX = startX
    const placeChunk = (chunkText: string, category: string): void => {
      if (chunkText.length === 0 || this.#font === null) return
      const width = measureTextWorld(chunkText, this.#font, fontSize)
      if (chunkText.trim().length === 0) {
        cursorX += width
        return
      }
      const material = this.#tokenMaterials.get(category) ?? this.#lineMaterial
      const t = new Text(chunkText, this.#font, fontSize, material)
      t.name = "code"
      t.position.x = cursorX
      t.position.y = baselineY
      t.updateMatrix()
      this.#codeContainer.add(t)
      cursorX += width
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

  #gutterWidthPx(lineCount: number): number {
    if (this.#font === null) return GUTTER_MIN_PX
    const digits = Math.max(2, String(Math.max(1, lineCount)).length)
    const fontWorld = CODE_FONT_PX * this.#pixelScale
    const digitWidthPx = measureTextWorld("8", this.#font, fontWorld) / this.#pixelScale
    return Math.ceil(Math.max(GUTTER_MIN_PX, GUTTER_LEFT_PAD_PX + digitWidthPx * digits + GUTTER_RIGHT_PAD_PX))
  }

  #lineNumberX(text: string, gutterPx: number, fontSizeWorld: number): number {
    if (this.#font === null) return 0
    const widthWorld = measureTextWorld(text, this.#font, fontSizeWorld)
    const rightEdgeWorld = (gutterPx - GUTTER_RIGHT_PAD_PX) * this.#pixelScale
    const leftInsetWorld = GUTTER_LEFT_PAD_PX * this.#pixelScale
    return Math.max(leftInsetWorld, rightEdgeWorld - widthWorld)
  }

  #syncGutterRule(gutterPx: number, contentW: number, contentH: number): void {
    void contentW
    const width = 1 * this.#pixelScale
    const height = contentH * this.#pixelScale
    this.#gutterRule.geometry = new PlaneGeometry({width, height})
    this.#gutterRule.visible = true
    this.#gutterRule.position.x = (PAD_LEFT_PX + gutterPx) * this.#pixelScale + width / 2
    this.#gutterRule.position.y = -PAD_TOP_PX * this.#pixelScale - height / 2
    this.#gutterRule.updateMatrix()
  }

  #hideGutterRule(): void {
    this.#gutterRule.visible = false
  }

  #updateScrollbar(): void {
    if (this.#current === null) return
    const visible = this.#visibleLineCount()
    if (this.#totalLines <= visible) {
      if (this.#scrollbarTrack !== null) this.#scrollbarTrack.visible = false
      if (this.#scrollbarThumb !== null) this.#scrollbarThumb.visible = false
      return
    }
    const trackWidthPx = 4
    const trackWidthWorld = trackWidthPx * this.#pixelScale
    const contentH = Math.max(1, this.#rectH - PAD_TOP_PX - PAD_BOTTOM_PX)
    const trackHeightWorld = contentH * this.#pixelScale
    const trackXWorld = (this.#rectW - PAD_RIGHT_PX - trackWidthPx / 2) * this.#pixelScale

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
    this.#scrollbarTrack.position.y = -PAD_TOP_PX * this.#pixelScale - trackHeightWorld / 2
    this.#scrollbarTrack.updateMatrix()

    const thumbRatio = visible / this.#totalLines
    const thumbHeightWorld = Math.max(trackWidthWorld * 4, trackHeightWorld * thumbRatio)
    const scrollProgress = this.#totalLines === visible ? 0 : this.#scrollOffset / (this.#totalLines - visible)
    const thumbCenterY = -PAD_TOP_PX * this.#pixelScale -
      thumbHeightWorld / 2 -
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

  #disposeCodeChildren(): void {
    const renderer = this.#canvas?.renderer
    for (const child of this.#codeContainer.children) {
      const text = child as Text
      if (text.isText === true) {
        if (renderer !== undefined) {
          if (text.stencilGeometry !== undefined) renderer.invalidateGeometry(text.stencilGeometry)
          if (text.coverGeometry !== undefined) renderer.invalidateGeometry(text.coverGeometry)
        }
        continue
      }
      const mesh = child as Mesh
      if (mesh.geometry !== undefined && renderer !== undefined) renderer.invalidateGeometry(mesh.geometry)
    }
    this.#codeContainer.children = []
  }
}

function stripLine(location: string | undefined): string {
  if (location === undefined) return ""
  const idx = location.lastIndexOf(":")
  if (idx < 0) return location
  return location.slice(0, idx)
}

function measureTextWorld(text: string, font: TrueTypeFont, fontSize: number): number {
  const scale = fontSize / font.unitsPerEm
  const letterSpacing = fontSize * 0.05
  let width = 0
  for (const char of text) {
    if (char === " ") {
      width += font.unitsPerEm * 0.3 * scale
      continue
    }
    const gid = font.mapCharToGlyph(char.codePointAt(0)!)
    width += font.getHMetric(gid).advanceWidth * scale + letterSpacing
  }
  return width
}
