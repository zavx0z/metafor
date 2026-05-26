import {Color} from "@metafor/engine"
import {UiSurface, Z} from "@metafor/elements"

type Point = {x: number; y: number}
type Quad = {
  topLeft: Point
  topRight: Point
  bottomRight: Point
  bottomLeft: Point
}
type Rect = {x: number; y: number; w: number; h: number}
type FlightControl = {
  button: Rect
  hit: Rect
  center: Point
  anchor: Point
  lineEnd: Point
  size: number
}

const LOCK = new Color(0.36, 0.94, 1, 0.9)
const LOCK_DIM = new Color(0.22, 0.68, 0.95, 0.42)
const LOCK_GLOW = new Color(0.08, 0.52, 1, 0.22)
const LOCK_HOT = new Color(0.88, 1, 1, 0.86)

const LOCK_Z = Z.TEXT + 0.24
const LOCK_DURATION_MS = 620
const MIN_TARGET_OUTSET_PX = 12
const MAX_TARGET_OUTSET_PX = 26
const MIN_START_OUTSET_PX = 82
const MAX_START_OUTSET_PX = 180
const MIN_MAGNET_SWAY_PX = 7
const MAX_MAGNET_SWAY_PX = 22
const FULL_INTENSITY_SPEED_PX_PER_SEC = 520
const MIN_MAGNET_SPEED_RAD_PER_SEC = 2.2
const MAX_MAGNET_SPEED_RAD_PER_SEC = 14
const MOTION_ATTACK = 0.56
const MOTION_DECAY = 0.034
const MOTION_STOP_INTENSITY = 0.01
const FLIGHT_BUTTON_KEY = "display-flight-button"
const FLIGHT_BUTTON_MIN_SIZE_PX = 34
const FLIGHT_BUTTON_MAX_SIZE_PX = 48
const FLIGHT_BUTTON_HIT_PAD_PX = 12

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function easeOutCubic(t: number): number {
  const inv = 1 - t
  return 1 - inv * inv * inv
}

function lerpPoint(a: Point, b: Point, t: number): Point {
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
  }
}

function edgeLength(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

function centerOf(points: Point[]): Point {
  return {
    x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
    y: points.reduce((sum, p) => sum + p.y, 0) / points.length,
  }
}

function outsetPoint(p: Point, center: Point, amountPx: number): Point {
  const dx = p.x - center.x
  const dy = p.y - center.y
  const length = Math.hypot(dx, dy)
  if (length <= 0) return p
  return {
    x: p.x + dx / length * amountPx,
    y: p.y + dy / length * amountPx,
  }
}

function outsetQuad(quad: Quad, center: Point, amountPx: number): Quad {
  return {
    topLeft: outsetPoint(quad.topLeft, center, amountPx),
    topRight: outsetPoint(quad.topRight, center, amountPx),
    bottomRight: outsetPoint(quad.bottomRight, center, amountPx),
    bottomLeft: outsetPoint(quad.bottomLeft, center, amountPx),
  }
}

function lerpQuad(a: Quad, b: Quad, t: number): Quad {
  return {
    topLeft: lerpPoint(a.topLeft, b.topLeft, t),
    topRight: lerpPoint(a.topRight, b.topRight, t),
    bottomRight: lerpPoint(a.bottomRight, b.bottomRight, t),
    bottomLeft: lerpPoint(a.bottomLeft, b.bottomLeft, t),
  }
}

function pointAlong(a: Point, b: Point, distancePx: number): Point {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const length = Math.hypot(dx, dy)
  if (length <= 0) return a
  const t = clamp(distancePx / length, 0, 1)
  return lerpPoint(a, b, t)
}

function fade(color: Color, opacity: number): Color {
  return new Color(color.r, color.g, color.b, clamp(color.a * opacity, 0, 1))
}

function averageQuadDelta(a: Quad, b: Quad): number {
  return (
    edgeLength(a.topLeft, b.topLeft) +
    edgeLength(a.topRight, b.topRight) +
    edgeLength(a.bottomRight, b.bottomRight) +
    edgeLength(a.bottomLeft, b.bottomLeft)
  ) / 4
}

function pointInRect(point: Point, rect: Rect): boolean {
  return point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h
}

export class DisplayHoverOutlinePane extends UiSurface {
  #lockStartedAt: number | null = null
  #lastQuad: Quad | null = null
  #lastFrameAt: number | null = null
  #motionIntensity = 0
  #magnetPhase = 0

  constructor() {
    super({bgColor: null, borderColor: null})
  }

  acceptsPointerEvents(): boolean {
    return true
  }

  containsPointer(localX: number, localY: number): boolean {
    const control = this.#flightControl()
    return control !== null && pointInRect({x: localX, y: localY}, control.hit)
  }

  protected render(): void {
    const displayOutline = this.canvas?.displayOutline()
    if (displayOutline !== undefined && displayOutline !== null) this.#drawFlightControl(this.#outlineQuad(displayOutline))

    const outline = this.canvas?.displayHoverOutline()
    if (outline === undefined || outline === null) {
      this.#lockStartedAt = null
      this.#lastQuad = null
      this.#lastFrameAt = null
      this.#motionIntensity = 0
      this.#magnetPhase = 0
      return
    }

    const quad = this.#outlineQuad(outline)
    const points = [quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft]
    const displaySizePx = Math.max(edgeLength(quad.topLeft, quad.topRight), edgeLength(quad.topRight, quad.bottomRight))
    if (displaySizePx < 36) return

    const now = performance.now()
    if (this.#lockStartedAt === null) {
      this.#lockStartedAt = now
      this.#lastQuad = null
      this.#lastFrameAt = null
      this.#motionIntensity = 0
      this.#magnetPhase = 0
    }
    const motionIntensity = this.#updateMotion(quad, now)
    const ageMs = now - this.#lockStartedAt
    const progress = clamp(ageMs / LOCK_DURATION_MS, 0, 1)
    const eased = easeOutCubic(progress)
    const center = centerOf(points)
    const baseOutset = clamp(displaySizePx * 0.018, MIN_TARGET_OUTSET_PX, MAX_TARGET_OUTSET_PX)
    const swayPx = clamp(displaySizePx * 0.02, MIN_MAGNET_SWAY_PX, MAX_MAGNET_SWAY_PX)
    const magneticWave = Math.sin(this.#magnetPhase)
    const magneticPull = (0.58 + magneticWave * 0.42) * swayPx * motionIntensity
    const targetOutset = baseOutset + (progress >= 1 ? magneticPull : 0)
    const startOutset = baseOutset + clamp(displaySizePx * 0.16, MIN_START_OUTSET_PX, MAX_START_OUTSET_PX)
    const target = outsetQuad(quad, center, targetOutset)
    const start = outsetQuad(quad, center, startOutset)
    const current = lerpQuad(start, target, eased)
    const settle = progress >= 1 ? 0.82 + 0.18 * motionIntensity : 0.78 + 0.22 * progress

    if (progress < 0.98) this.#drawApproachGuides(start, current)
    this.#drawCornerLock(current.topLeft, current.topRight, current.bottomLeft, displaySizePx, settle)
    this.#drawCornerLock(current.topRight, current.topLeft, current.bottomRight, displaySizePx, settle)
    this.#drawCornerLock(current.bottomRight, current.bottomLeft, current.topRight, displaySizePx, settle)
    this.#drawCornerLock(current.bottomLeft, current.bottomRight, current.topLeft, displaySizePx, settle)
    this.#drawSideMarks(current, displaySizePx, settle)

    if (progress < 1 || motionIntensity > MOTION_STOP_INTENSITY) this.requestRender()
  }

  #outlineQuad(outline: Quad): Quad {
    return {
      topLeft: outline.topLeft,
      topRight: outline.topRight,
      bottomRight: outline.bottomRight,
      bottomLeft: outline.bottomLeft,
    }
  }

  #flightControl(): FlightControl | null {
    const outline = this.canvas?.displayOutline()
    if (outline === undefined || outline === null) return null
    return this.#flightControlForQuad(this.#outlineQuad(outline))
  }

  #flightControlForQuad(quad: Quad): FlightControl | null {
    const points = [quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft]
    const center = centerOf(points)
    const displaySizePx = Math.max(edgeLength(quad.topLeft, quad.topRight), edgeLength(quad.topRight, quad.bottomRight))
    if (displaySizePx < 12) return null
    const size = clamp(displaySizePx * 0.055, FLIGHT_BUTTON_MIN_SIZE_PX, FLIGHT_BUTTON_MAX_SIZE_PX)
    const gap = clamp(displaySizePx * 0.025, 14, 34)
    const dx = quad.topRight.x - center.x
    const dy = quad.topRight.y - center.y
    const diagonal = Math.max(0.001, Math.hypot(dx, dy))
    const nx = dx / diagonal
    const ny = dy / diagonal
    const rawCx = quad.topRight.x + nx * (gap + size * 0.62)
    const rawCy = quad.topRight.y + ny * (gap + size * 0.62)
    const margin = 8
    const cx = clamp(rawCx, margin + size / 2, this.rectW - margin - size / 2)
    const cy = clamp(rawCy, margin + size / 2, this.rectH - margin - size / 2)
    const button = {x: cx - size / 2, y: cy - size / 2, w: size, h: size}
    const hit = {
      x: button.x - FLIGHT_BUTTON_HIT_PAD_PX,
      y: button.y - FLIGHT_BUTTON_HIT_PAD_PX,
      w: button.w + FLIGHT_BUTTON_HIT_PAD_PX * 2,
      h: button.h + FLIGHT_BUTTON_HIT_PAD_PX * 2,
    }
    const anchor = {
      x: quad.topRight.x + nx * 8,
      y: quad.topRight.y + ny * 8,
    }
    return {
      button,
      hit,
      center: {x: cx, y: cy},
      anchor,
      lineEnd: pointAlong({x: cx, y: cy}, anchor, size * 0.63),
      size,
    }
  }

  #drawFlightControl(quad: Quad): void {
    const control = this.#flightControlForQuad(quad)
    if (control === null) return
    const hit = this.hitState(control.hit.x, control.hit.y, control.hit.w, control.hit.h, FLIGHT_BUTTON_KEY)
    const strength = hit.pressed ? 1.18 : hit.hovered ? 1 : 0.72
    this.hit(control.hit.x, control.hit.y, control.hit.w, control.hit.h, () => {
      this.canvas?.toggleDisplayFlight()
    }, {
      key: FLIGHT_BUTTON_KEY,
      cursor: "pointer",
      activeCursor: "pointer",
    })

    this.#drawFlightConnector(control, strength)
    this.#drawFlightCorners(control.button, control.size, strength)
    const distance = Math.max(1, Math.round((this.canvas?.displayDistanceMm() ?? 0) / 100))
    this.drawTextCentered(String(distance), control.center.x, control.center.y + 1, {
      fontPx: clamp(control.size * 0.43, 14, 19),
      material: this.materials.cyan,
      maxWidthPx: control.size - 8,
      z: LOCK_Z + 0.1,
      clip: false,
    })
  }

  #drawFlightConnector(control: FlightControl, strength: number): void {
    this.#drawLockLine(control.anchor, control.lineEnd, fade(LOCK_DIM, 0.74 * strength), 1.25, LOCK_Z + 0.02)
    const s = clamp(control.size * 0.18, 6, 9)
    this.#drawLockLine({x: control.anchor.x - s, y: control.anchor.y}, {x: control.anchor.x + s, y: control.anchor.y}, fade(LOCK, 0.74 * strength), 1.35, LOCK_Z + 0.04)
    this.#drawLockLine({x: control.anchor.x, y: control.anchor.y - s}, {x: control.anchor.x, y: control.anchor.y + s}, fade(LOCK, 0.74 * strength), 1.35, LOCK_Z + 0.04)
    this.drawRoundedRect(control.anchor.x - 2.1, control.anchor.y - 2.1, 4.2, 4.2, {
      radius: 2.1,
      fill: fade(LOCK_HOT, 0.72 * strength),
      border: null,
      z: LOCK_Z + 0.08,
    })
  }

  #drawFlightCorners(rect: Rect, size: number, strength: number): void {
    const x0 = rect.x
    const y0 = rect.y
    const x1 = rect.x + rect.w
    const y1 = rect.y + rect.h
    const segment = clamp(size * 0.26, 9, 13)
    const color = fade(LOCK_HOT, 0.92 * strength)
    const dim = fade(LOCK_DIM, 0.8 * strength)
    this.#drawLockLine({x: x0, y: y0 + segment}, {x: x0, y: y0}, dim, 2.4, LOCK_Z + 0.04)
    this.#drawLockLine({x: x0, y: y0}, {x: x0 + segment, y: y0}, color, 1.55, LOCK_Z + 0.08)
    this.#drawLockLine({x: x1 - segment, y: y0}, {x: x1, y: y0}, dim, 2.4, LOCK_Z + 0.04)
    this.#drawLockLine({x: x1, y: y0}, {x: x1, y: y0 + segment}, color, 1.55, LOCK_Z + 0.08)
    this.#drawLockLine({x: x1, y: y1 - segment}, {x: x1, y: y1}, dim, 2.4, LOCK_Z + 0.04)
    this.#drawLockLine({x: x1, y: y1}, {x: x1 - segment, y: y1}, color, 1.55, LOCK_Z + 0.08)
    this.#drawLockLine({x: x0 + segment, y: y1}, {x: x0, y: y1}, dim, 2.4, LOCK_Z + 0.04)
    this.#drawLockLine({x: x0, y: y1}, {x: x0, y: y1 - segment}, color, 1.55, LOCK_Z + 0.08)
  }

  #updateMotion(quad: Quad, now: number): number {
    const previousFrameAt = this.#lastFrameAt
    const previousQuad = this.#lastQuad
    if (previousFrameAt === null || previousQuad === null) {
      this.#lastFrameAt = now
      this.#lastQuad = quad
      return this.#motionIntensity
    }

    const dtMs = Math.max(1, now - previousFrameAt)
    const speedPxPerSec = averageQuadDelta(previousQuad, quad) / dtMs * 1000
    const targetIntensity = clamp(speedPxPerSec / FULL_INTENSITY_SPEED_PX_PER_SEC, 0, 1)
    const response = targetIntensity > this.#motionIntensity ? MOTION_ATTACK : MOTION_DECAY
    this.#motionIntensity = lerp(this.#motionIntensity, targetIntensity, response)
    const magnetSpeed = lerp(MIN_MAGNET_SPEED_RAD_PER_SEC, MAX_MAGNET_SPEED_RAD_PER_SEC, this.#motionIntensity)
    this.#magnetPhase += magnetSpeed * (dtMs / 1000)
    this.#lastFrameAt = now
    this.#lastQuad = quad
    return this.#motionIntensity
  }

  #drawApproachGuides(start: Quad, current: Quad): void {
    this.#drawGuide(start.topLeft, current.topLeft)
    this.#drawGuide(start.topRight, current.topRight)
    this.#drawGuide(start.bottomRight, current.bottomRight)
    this.#drawGuide(start.bottomLeft, current.bottomLeft)
  }

  #drawGuide(a: Point, b: Point): void {
    this.drawRoundedLine(a.x, a.y, b.x, b.y, fade(LOCK_DIM, 0.34), 1.1, LOCK_Z - 0.04)
  }

  #drawCornerLock(corner: Point, edgeA: Point, edgeB: Point, displaySizePx: number, strength: number): void {
    const length = clamp(displaySizePx * 0.105, 30, 92)
    const hotLength = length * 0.46
    const aLong = pointAlong(corner, edgeA, length)
    const bLong = pointAlong(corner, edgeB, length)
    const aHot = pointAlong(corner, edgeA, hotLength)
    const bHot = pointAlong(corner, edgeB, hotLength)

    this.#drawLockLine(corner, aLong, fade(LOCK_DIM, strength), 3.4, LOCK_Z)
    this.#drawLockLine(corner, bLong, fade(LOCK_DIM, strength), 3.4, LOCK_Z)
    this.#drawLockLine(corner, aHot, fade(LOCK_HOT, strength), 1.25, LOCK_Z + 0.03)
    this.#drawLockLine(corner, bHot, fade(LOCK_HOT, strength), 1.25, LOCK_Z + 0.03)
  }

  #drawSideMarks(frame: Quad, displaySizePx: number, strength: number): void {
    const markLength = clamp(displaySizePx * 0.04, 16, 38)
    this.#drawSideMark(frame.topLeft, frame.topRight, 0.5, markLength, strength)
    this.#drawSideMark(frame.topRight, frame.bottomRight, 0.5, markLength, strength)
    this.#drawSideMark(frame.bottomRight, frame.bottomLeft, 0.5, markLength, strength)
    this.#drawSideMark(frame.bottomLeft, frame.topLeft, 0.5, markLength, strength)
  }

  #drawSideMark(a: Point, b: Point, t: number, lengthPx: number, strength: number): void {
    const center = lerpPoint(a, b, t)
    const half = lengthPx / 2
    const start = pointAlong(center, a, half)
    const end = pointAlong(center, b, half)
    this.#drawLockLine(start, end, fade(LOCK, 0.54 * strength), 1.4, LOCK_Z + 0.01)
  }

  #drawLockLine(a: Point, b: Point, color: Color, thicknessPx: number, z: number): void {
    this.drawRoundedLine(a.x, a.y, b.x, b.y, fade(LOCK_GLOW, 0.55), thicknessPx + 3.2, z - 0.02)
    this.drawRoundedLine(a.x, a.y, b.x, b.y, color, thicknessPx, z)
  }
}
