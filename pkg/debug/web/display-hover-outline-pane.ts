import {Color} from "@metafor/engine"
import {UiSurface, Z} from "@metafor/elements"

type Point = {x: number; y: number}

const CYAN = new Color(0.38, 0.92, 1, 0.92)
const CYAN_SOFT = new Color(0.24, 0.74, 1, 0.54)
const BLUE_GLOW = new Color(0.05, 0.46, 1, 0.46)
const MAGENTA = new Color(1, 0.26, 0.9, 0.9)
const MAGENTA_SOFT = new Color(0.82, 0.16, 1, 0.52)
const MAGENTA_GLOW = new Color(0.84, 0.08, 1, 0.48)
const HOT_CORE = new Color(0.86, 1, 1, 0.96)
const GLASS_BLUE = new Color(0.16, 0.56, 1, 0.26)
const GLASS_MAGENTA = new Color(1, 0.16, 0.78, 0.24)
const ICE_GHOST = new Color(0.52, 0.9, 1, 0.16)
const ROSE_GHOST = new Color(1, 0.38, 0.88, 0.16)

const OUTLINE_Z = Z.TEXT + 0.22
const CLOCKWISE_SCAN_SPEED = 0.00028
const COUNTER_SCAN_SPEED = 0.0002
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

function outsetPoint(p: Point, center: Point, amountPx: number): Point {
  return insetPoint(p, center, -amountPx)
}

function fadeColor(color: Color, opacity: number): Color {
  return new Color(color.r, color.g, color.b, Math.max(0, Math.min(1, color.a * opacity)))
}

function shiftPoint(p: Point, normal: Point, distancePx: number): Point {
  return {
    x: p.x + normal.x * distancePx,
    y: p.y + normal.y * distancePx,
  }
}

function extendSegment(a: Point, b: Point, amountPx: number): [Point, Point] {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const length = Math.hypot(dx, dy)
  if (length <= 0) return [a, b]
  const ux = dx / length
  const uy = dy / length
  return [
    {x: a.x - ux * amountPx, y: a.y - uy * amountPx},
    {x: b.x + ux * amountPx, y: b.y + uy * amountPx},
  ]
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

    this.#drawGhostRails(frame, center)
    this.#drawCorner(frame.topLeft, frame.topRight, frame.bottomLeft, center, CYAN, BLUE_GLOW)
    this.#drawCorner(frame.topRight, frame.topLeft, frame.bottomRight, center, MAGENTA, MAGENTA_GLOW)
    this.#drawCorner(frame.bottomRight, frame.bottomLeft, frame.topRight, center, MAGENTA, MAGENTA_GLOW)
    this.#drawCorner(frame.bottomLeft, frame.bottomRight, frame.topLeft, center, CYAN, BLUE_GLOW)
    this.#drawCornerFacet(frame.topLeft, frame.topRight, frame.bottomLeft, center, CYAN, BLUE_GLOW)
    this.#drawCornerFacet(frame.topRight, frame.topLeft, frame.bottomRight, center, MAGENTA, MAGENTA_GLOW)
    this.#drawCornerFacet(frame.bottomRight, frame.bottomLeft, frame.topRight, center, MAGENTA, MAGENTA_GLOW)
    this.#drawCornerFacet(frame.bottomLeft, frame.bottomRight, frame.topLeft, center, CYAN, BLUE_GLOW)

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

    this.#drawOutsetDash(frame.topLeft, frame.topRight, center, 0.42, 0.54, MAGENTA_SOFT, GLASS_MAGENTA)
    this.#drawOutsetDash(frame.topRight, frame.bottomRight, center, 0.38, 0.48, MAGENTA_SOFT, GLASS_MAGENTA)
    this.#drawOutsetDash(frame.bottomRight, frame.bottomLeft, center, 0.4, 0.54, CYAN_SOFT, GLASS_BLUE)
    this.#drawOutsetDash(frame.bottomLeft, frame.topLeft, center, 0.44, 0.54, CYAN_SOFT, GLASS_BLUE)

    this.#drawTick(frame.topLeft, frame.topRight, center, 0.27, MAGENTA_SOFT)
    this.#drawTick(frame.topLeft, frame.topRight, center, 0.57, HOT_CORE)
    this.#drawTick(frame.topRight, frame.bottomRight, center, 0.46, MAGENTA_SOFT)
    this.#drawTick(frame.bottomRight, frame.bottomLeft, center, 0.28, CYAN_SOFT)
    this.#drawTick(frame.bottomRight, frame.bottomLeft, center, 0.7, HOT_CORE)
    this.#drawTick(frame.bottomLeft, frame.topLeft, center, 0.5, CYAN_SOFT)

    this.#drawOrbitPulses(frame, center, time, "clockwise")
    this.#drawOrbitPulses(frame, center, time, "counter")
    this.#drawCornerNode(frame.topLeft, center, CYAN)
    this.#drawCornerNode(frame.topRight, center, MAGENTA)
    this.#drawCornerNode(frame.bottomRight, center, MAGENTA)
    this.#drawCornerNode(frame.bottomLeft, center, CYAN)

    this.requestRender()
  }

  #drawGhostRails(
    frame: {topLeft: Point; topRight: Point; bottomRight: Point; bottomLeft: Point},
    center: Point,
  ): void {
    this.#drawRail(frame.topLeft, frame.topRight, center, 15, ROSE_GHOST, MAGENTA_GLOW, [
      [0.06, 0.22],
      [0.42, 0.58],
      [0.72, 0.92],
    ])
    this.#drawRail(frame.topRight, frame.bottomRight, center, 15, ROSE_GHOST, MAGENTA_GLOW, [
      [0.06, 0.19],
      [0.37, 0.48],
      [0.7, 0.94],
    ])
    this.#drawRail(frame.bottomRight, frame.bottomLeft, center, 15, ICE_GHOST, BLUE_GLOW, [
      [0.07, 0.25],
      [0.41, 0.57],
      [0.76, 0.94],
    ])
    this.#drawRail(frame.bottomLeft, frame.topLeft, center, 15, ICE_GHOST, BLUE_GLOW, [
      [0.08, 0.28],
      [0.44, 0.56],
      [0.74, 0.92],
    ])
  }

  #drawRail(a: Point, b: Point, center: Point, offsetPx: number, color: Color, glow: Color, segments: Array<[number, number]>): void {
    for (const [from, to] of segments) {
      const start = outsetPoint(lerpPoint(a, b, from), center, offsetPx)
      const end = outsetPoint(lerpPoint(a, b, to), center, offsetPx)
      this.#drawHoloLine(start, end, color, glow, 0.75, 3.2, OUTLINE_Z - 0.04)
    }
  }

  #drawCorner(corner: Point, edgeA: Point, edgeB: Point, center: Point, color: Color, glow: Color): void {
    const aEnd = lerpPoint(corner, edgeA, 0.17)
    const bEnd = lerpPoint(corner, edgeB, 0.17)
    this.#drawHoloLine(corner, aEnd, color, glow, 1.7, 6)
    this.#drawHoloLine(corner, bEnd, color, glow, 1.7, 6)

    const innerCorner = outsetPoint(corner, center, 12)
    this.#drawHoloLine(
      outsetPoint(lerpPoint(corner, edgeA, 0.04), center, 8),
      outsetPoint(lerpPoint(corner, edgeA, 0.12), center, 8),
      HOT_CORE,
      glow,
      1.1,
      4,
      OUTLINE_Z + 0.04,
    )
    this.#drawHoloLine(
      outsetPoint(lerpPoint(corner, edgeB, 0.04), center, 8),
      outsetPoint(lerpPoint(corner, edgeB, 0.12), center, 8),
      HOT_CORE,
      glow,
      1.1,
      4,
      OUTLINE_Z + 0.04,
    )
    this.#drawHoloLine(corner, innerCorner, color, glow, 1, 3.5, OUTLINE_Z + 0.02)
  }

  #drawCornerFacet(corner: Point, edgeA: Point, edgeB: Point, center: Point, color: Color, glow: Color): void {
    const armA = outsetPoint(lerpPoint(corner, edgeA, 0.1), center, 18)
    const armB = outsetPoint(lerpPoint(corner, edgeB, 0.1), center, 18)
    const outerCorner = outsetPoint(corner, center, 30)
    this.#drawHoloLine(armA, outerCorner, color, glow, 0.95, 4, OUTLINE_Z + 0.03)
    this.#drawHoloLine(outerCorner, armB, color, glow, 0.95, 4, OUTLINE_Z + 0.03)

    const core = outsetPoint(corner, center, 20)
    this.#drawCrosshair(core, color, glow)
  }

  #drawEdgeDashes(a: Point, b: Point, center: Point, color: Color, glow: Color, segments: Array<[number, number]>): void {
    for (const [from, to] of segments) {
      const start = lerpPoint(a, b, from)
      const end = lerpPoint(a, b, to)
      this.#drawHoloLine(start, end, color, glow, 1.35, 4.5)
      if (to - from > 0.12) {
        this.#drawHoloLine(outsetPoint(start, center, 7), outsetPoint(end, center, 7), HOT_CORE, glow, 0.8, 2.4, OUTLINE_Z + 0.05)
      }
    }
  }

  #drawOutsetDash(a: Point, b: Point, center: Point, from: number, to: number, color: Color, glow: Color): void {
    const start = outsetPoint(lerpPoint(a, b, from), center, 15)
    const end = outsetPoint(lerpPoint(a, b, to), center, 15)
    this.#drawHoloLine(start, end, color, glow, 1, 3.4, OUTLINE_Z + 0.03)
  }

  #drawTick(a: Point, b: Point, center: Point, t: number, color: Color): void {
    const p = lerpPoint(a, b, t)
    this.#drawHoloLine(p, outsetPoint(p, center, 20), color, BLUE_GLOW, 0.9, 3, OUTLINE_Z + 0.06)
  }

  #drawOrbitPulses(
    frame: {topLeft: Point; topRight: Point; bottomRight: Point; bottomLeft: Point},
    center: Point,
    time: number,
    direction: "clockwise" | "counter",
  ): void {
    const clockwise = direction === "clockwise"
    const speed = clockwise ? CLOCKWISE_SCAN_SPEED : COUNTER_SCAN_SPEED
    const phases = clockwise ? [0.03, 0.38, 0.67] : [0.18, 0.52, 0.84]
    for (const phase of phases) {
      const progress = wrap01(time * speed + phase)
      const color = clockwise ? MAGENTA : CYAN
      const glow = clockwise ? MAGENTA_GLOW : BLUE_GLOW
      this.#drawOrbitPulse(frame, center, progress, clockwise, color, glow)
    }
  }

  #drawOrbitPulse(
    frame: {topLeft: Point; topRight: Point; bottomRight: Point; bottomLeft: Point},
    center: Point,
    progress: number,
    clockwise: boolean,
    color: Color,
    glow: Color,
  ): void {
    const edges: Array<[Point, Point]> = clockwise
      ? [
        [frame.topLeft, frame.topRight],
        [frame.topRight, frame.bottomRight],
        [frame.bottomRight, frame.bottomLeft],
        [frame.bottomLeft, frame.topLeft],
      ]
      : [
        [frame.topLeft, frame.bottomLeft],
        [frame.bottomLeft, frame.bottomRight],
        [frame.bottomRight, frame.topRight],
        [frame.topRight, frame.topLeft],
      ]
    const scaled = progress * edges.length
    const index = Math.min(edges.length - 1, Math.floor(scaled))
    const t = scaled - index
    const [a, b] = edges[index]!
    const tail = 0.052
    const start = outsetPoint(lerpPoint(a, b, Math.max(0, t - tail)), center, 6)
    const end = outsetPoint(lerpPoint(a, b, t), center, 6)
    const wakeStart = outsetPoint(lerpPoint(a, b, Math.max(0, t - tail * 2.4)), center, 14)
    const wakeEnd = outsetPoint(lerpPoint(a, b, Math.max(0, t - tail * 0.4)), center, 14)
    this.#drawHoloLine(wakeStart, wakeEnd, color, glow, 0.8, 4, OUTLINE_Z + 0.07)
    this.#drawHoloLine(start, end, HOT_CORE, glow, 1.65, 8, OUTLINE_Z + 0.1)
  }

  #drawCornerNode(corner: Point, center: Point, color: Color): void {
    const p = outsetPoint(corner, center, 23)
    this.#drawCrosshair(p, color, BLUE_GLOW)
  }

  #drawCrosshair(p: Point, color: Color, glow: Color): void {
    const a = {x: p.x - 4.5, y: p.y}
    const b = {x: p.x + 4.5, y: p.y}
    const c = {x: p.x, y: p.y - 4.5}
    const d = {x: p.x, y: p.y + 4.5}
    this.#drawHoloLine(a, b, color, glow, 0.8, 5, OUTLINE_Z + 0.08)
    this.#drawHoloLine(c, d, color, glow, 0.8, 5, OUTLINE_Z + 0.08)
  }

  #drawHoloLine(a: Point, b: Point, color: Color, glow: Color, corePx: number, glowPx: number, z = OUTLINE_Z): void {
    const dx = b.x - a.x
    const dy = b.y - a.y
    const length = Math.hypot(dx, dy)
    if (length <= 0) return

    const normal = {x: -dy / length, y: dx / length}
    const spread = Math.max(7, glowPx * 1.8)
    const breath = 0.78 + 0.22 * Math.sin(performance.now() * 0.004 + (a.x + b.y) * 0.008)
    const [haloA, haloB] = extendSegment(a, b, spread * 0.35)
    const [midA, midB] = extendSegment(a, b, spread * 0.18)

    this.drawRoundedLine(haloA.x, haloA.y, haloB.x, haloB.y, fadeColor(glow, 0.22 * breath), spread * 1.05, z - 0.055)
    this.drawRoundedLine(midA.x, midA.y, midB.x, midB.y, fadeColor(glow, 0.34 * breath), spread * 0.48, z - 0.035)

    const fan = [-1.18, -0.92, -0.68, -0.44, -0.22, 0.22, 0.44, 0.68, 0.92, 1.18]
    for (const k of fan) {
      const distance = k * spread
      const falloff = Math.max(0, 1 - Math.abs(k) / 1.18)
      const shiftedA = shiftPoint(a, normal, distance)
      const shiftedB = shiftPoint(b, normal, distance)
      this.drawRoundedLine(
        shiftedA.x,
        shiftedA.y,
        shiftedB.x,
        shiftedB.y,
        fadeColor(glow, (0.13 + falloff * 0.24) * breath),
        1.1 + falloff * 1.35,
        z - 0.015,
      )
    }

    this.drawRoundedLine(a.x, a.y, b.x, b.y, fadeColor(color, 0.28), Math.max(0.45, corePx * 0.44), z + 0.02)
  }
}
