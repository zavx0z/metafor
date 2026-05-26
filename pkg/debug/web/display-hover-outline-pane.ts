import {Color} from "@metafor/engine"
import {UiSurface, Z} from "@metafor/elements"

type Point = {x: number; y: number}

const CYAN = new Color(0.38, 0.92, 1, 0.92)
const CYAN_SOFT = new Color(0.24, 0.74, 1, 0.54)
const BLUE_GLOW = new Color(0.06, 0.36, 1, 0.18)
const MAGENTA = new Color(1, 0.26, 0.9, 0.9)
const MAGENTA_SOFT = new Color(0.82, 0.16, 1, 0.52)
const MAGENTA_GLOW = new Color(0.74, 0.07, 0.94, 0.2)
const HOT_CORE = new Color(0.86, 1, 1, 0.96)
const GLASS_BLUE = new Color(0.16, 0.56, 1, 0.26)
const GLASS_MAGENTA = new Color(1, 0.16, 0.78, 0.24)

const OUTLINE_Z = Z.TEXT + 0.22
const SCAN_SPEED = 0.00018
const MIN_OUTSET_PX = 20
const MAX_OUTSET_PX = 42

function lerpPoint(a: Point, b: Point, t: number): Point {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  }
}

function insetPoint(p: Point, center: Point, amountPx: number): Point {
  const dx = center.x - p.x
  const dy = center.y - p.y
  const length = Math.hypot(dx, dy)
  if (length <= 0) return p
  return {
    x: p.x + dx / length * amountPx,
    y: p.y + dy / length * amountPx,
  }
}

function edgeLength(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

function wrap01(value: number): number {
  return value - Math.floor(value)
}

export class DisplayHoverOutlinePane extends UiSurface {
  constructor() {
    super({bgColor: null, borderColor: null})
  }

  acceptsPointerEvents(): boolean {
    return false
  }

  protected render(): void {
    const outline = this.canvas?.displayHoverOutline()
    if (outline === undefined || outline === null) return
    const time = performance.now()
    const points = [outline.topLeft, outline.topRight, outline.bottomRight, outline.bottomLeft]
    const center = {
      x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
      y: points.reduce((sum, p) => sum + p.y, 0) / points.length,
    }
    const displaySizePx = Math.max(
      edgeLength(outline.topLeft, outline.topRight),
      edgeLength(outline.topRight, outline.bottomRight),
    )
    if (displaySizePx < 36) return
    const outsetPx = Math.max(MIN_OUTSET_PX, Math.min(MAX_OUTSET_PX, displaySizePx * 0.028))
    const frame = {
      topLeft: insetPoint(outline.topLeft, center, -outsetPx),
      topRight: insetPoint(outline.topRight, center, -outsetPx),
      bottomRight: insetPoint(outline.bottomRight, center, -outsetPx),
      bottomLeft: insetPoint(outline.bottomLeft, center, -outsetPx),
    }

    this.#drawCorner(frame.topLeft, frame.topRight, frame.bottomLeft, center, CYAN, BLUE_GLOW)
    this.#drawCorner(frame.topRight, frame.topLeft, frame.bottomRight, center, MAGENTA, MAGENTA_GLOW)
    this.#drawCorner(frame.bottomRight, frame.bottomLeft, frame.topRight, center, MAGENTA, MAGENTA_GLOW)
    this.#drawCorner(frame.bottomLeft, frame.bottomRight, frame.topLeft, center, CYAN, BLUE_GLOW)

    this.#drawEdgeDashes(frame.topLeft, frame.topRight, center, MAGENTA, MAGENTA_GLOW, [
      [0.34, 0.48],
      [0.62, 0.79],
      [0.86, 0.93],
    ])
    this.#drawEdgeDashes(frame.topRight, frame.bottomRight, center, MAGENTA, MAGENTA_GLOW, [
      [0.2, 0.34],
      [0.52, 0.68],
    ])
    this.#drawEdgeDashes(frame.bottomRight, frame.bottomLeft, center, CYAN, BLUE_GLOW, [
      [0.18, 0.36],
      [0.5, 0.65],
      [0.75, 0.86],
    ])
    this.#drawEdgeDashes(frame.bottomLeft, frame.topLeft, center, CYAN, BLUE_GLOW, [
      [0.24, 0.4],
      [0.58, 0.72],
    ])

    this.#drawInsetDash(frame.topLeft, frame.topRight, center, 0.42, 0.54, MAGENTA_SOFT, GLASS_MAGENTA)
    this.#drawInsetDash(frame.topRight, frame.bottomRight, center, 0.38, 0.48, MAGENTA_SOFT, GLASS_MAGENTA)
    this.#drawInsetDash(frame.bottomRight, frame.bottomLeft, center, 0.4, 0.54, CYAN_SOFT, GLASS_BLUE)
    this.#drawInsetDash(frame.bottomLeft, frame.topLeft, center, 0.44, 0.54, CYAN_SOFT, GLASS_BLUE)

    this.#drawTick(frame.topLeft, frame.topRight, center, 0.27, MAGENTA_SOFT)
    this.#drawTick(frame.topLeft, frame.topRight, center, 0.57, HOT_CORE)
    this.#drawTick(frame.topRight, frame.bottomRight, center, 0.46, MAGENTA_SOFT)
    this.#drawTick(frame.bottomRight, frame.bottomLeft, center, 0.28, CYAN_SOFT)
    this.#drawTick(frame.bottomRight, frame.bottomLeft, center, 0.7, HOT_CORE)
    this.#drawTick(frame.bottomLeft, frame.topLeft, center, 0.5, CYAN_SOFT)

    this.#drawScanPulse(frame.topLeft, frame.topRight, center, time, 0.08, MAGENTA, MAGENTA_GLOW)
    this.#drawScanPulse(frame.topRight, frame.bottomRight, center, time, 0.34, MAGENTA, MAGENTA_GLOW)
    this.#drawScanPulse(frame.bottomRight, frame.bottomLeft, center, time, 0.58, CYAN, BLUE_GLOW)
    this.#drawScanPulse(frame.bottomLeft, frame.topLeft, center, time, 0.82, CYAN, BLUE_GLOW)
    this.#drawCornerNode(frame.topLeft, center, CYAN)
    this.#drawCornerNode(frame.topRight, center, MAGENTA)
    this.#drawCornerNode(frame.bottomRight, center, MAGENTA)
    this.#drawCornerNode(frame.bottomLeft, center, CYAN)

    this.requestRender()
  }

  #drawCorner(corner: Point, edgeA: Point, edgeB: Point, center: Point, color: Color, glow: Color): void {
    const aEnd = lerpPoint(corner, edgeA, 0.17)
    const bEnd = lerpPoint(corner, edgeB, 0.17)
    this.#drawHoloLine(corner, aEnd, color, glow, 1.7, 6)
    this.#drawHoloLine(corner, bEnd, color, glow, 1.7, 6)

    const innerCorner = insetPoint(corner, center, 10)
    this.#drawHoloLine(
      insetPoint(lerpPoint(corner, edgeA, 0.04), center, 10),
      insetPoint(lerpPoint(corner, edgeA, 0.12), center, 10),
      HOT_CORE,
      glow,
      1.1,
      4,
      OUTLINE_Z + 0.04,
    )
    this.#drawHoloLine(
      insetPoint(lerpPoint(corner, edgeB, 0.04), center, 10),
      insetPoint(lerpPoint(corner, edgeB, 0.12), center, 10),
      HOT_CORE,
      glow,
      1.1,
      4,
      OUTLINE_Z + 0.04,
    )
    this.#drawHoloLine(corner, innerCorner, color, glow, 1, 3.5, OUTLINE_Z + 0.02)
  }

  #drawEdgeDashes(a: Point, b: Point, center: Point, color: Color, glow: Color, segments: Array<[number, number]>): void {
    for (const [from, to] of segments) {
      const start = lerpPoint(a, b, from)
      const end = lerpPoint(a, b, to)
      this.#drawHoloLine(start, end, color, glow, 1.35, 4.5)
      if (to - from > 0.12) {
        this.#drawHoloLine(insetPoint(start, center, 7), insetPoint(end, center, 7), HOT_CORE, glow, 0.8, 2.4, OUTLINE_Z + 0.05)
      }
    }
  }

  #drawInsetDash(a: Point, b: Point, center: Point, from: number, to: number, color: Color, glow: Color): void {
    const start = insetPoint(lerpPoint(a, b, from), center, 15)
    const end = insetPoint(lerpPoint(a, b, to), center, 15)
    this.#drawHoloLine(start, end, color, glow, 1, 3.4, OUTLINE_Z + 0.03)
  }

  #drawTick(a: Point, b: Point, center: Point, t: number, color: Color): void {
    const p = lerpPoint(a, b, t)
    this.#drawHoloLine(p, insetPoint(p, center, 17), color, BLUE_GLOW, 0.9, 3, OUTLINE_Z + 0.06)
  }

  #drawScanPulse(a: Point, b: Point, center: Point, time: number, phase: number, color: Color, glow: Color): void {
    const t = wrap01(time * SCAN_SPEED + phase)
    const tail = 0.038
    const head = Math.min(1, t + tail)
    const start = insetPoint(lerpPoint(a, b, t), center, 4)
    const end = insetPoint(lerpPoint(a, b, head), center, 4)
    this.#drawHoloLine(start, end, HOT_CORE, glow, 1.5, 8, OUTLINE_Z + 0.08)

    const wakeStart = insetPoint(lerpPoint(a, b, Math.max(0, t - tail * 1.6)), center, 10)
    const wakeEnd = insetPoint(lerpPoint(a, b, t), center, 10)
    this.#drawHoloLine(wakeStart, wakeEnd, color, glow, 0.85, 3.6, OUTLINE_Z + 0.07)
  }

  #drawCornerNode(corner: Point, center: Point, color: Color): void {
    const p = insetPoint(corner, center, 19)
    const a = {x: p.x - 4, y: p.y}
    const b = {x: p.x + 4, y: p.y}
    const c = {x: p.x, y: p.y - 4}
    const d = {x: p.x, y: p.y + 4}
    this.drawLine(a.x, a.y, b.x, b.y, color, 1.1, OUTLINE_Z + 0.09)
    this.drawLine(c.x, c.y, d.x, d.y, color, 1.1, OUTLINE_Z + 0.09)
  }

  #drawHoloLine(a: Point, b: Point, color: Color, glow: Color, corePx: number, glowPx: number, z = OUTLINE_Z): void {
    this.drawLine(a.x, a.y, b.x, b.y, glow, glowPx, z)
    this.drawLine(a.x, a.y, b.x, b.y, color, corePx, z + 0.02)
  }
}
