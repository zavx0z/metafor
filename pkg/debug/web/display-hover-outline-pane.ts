import {Color} from "@metafor/engine"
import {UiSurface, Z} from "@metafor/elements"

type Point = {x: number; y: number}
type Quad = {
  topLeft: Point
  topRight: Point
  bottomRight: Point
  bottomLeft: Point
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
    return false
  }

  protected render(): void {
    const outline = this.canvas?.displayHoverOutline()
    if (outline === undefined || outline === null) {
      this.#lockStartedAt = null
      this.#lastQuad = null
      this.#lastFrameAt = null
      this.#motionIntensity = 0
      this.#magnetPhase = 0
      return
    }

    const quad: Quad = {
      topLeft: outline.topLeft,
      topRight: outline.topRight,
      bottomRight: outline.bottomRight,
      bottomLeft: outline.bottomLeft,
    }
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
