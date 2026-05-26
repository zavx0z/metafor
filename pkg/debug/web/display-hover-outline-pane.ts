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
type ReturnDockControl = {
  island: Rect
  button: Rect
  hit: Rect
  center: Point
  buttonCenter: Point
  size: number
}
type LeaveAnimation = {
  startedAt: number
  quad: Quad
  edgeQuad: Quad
  displaySizePx: number
  lineStart: number
  buttonStart: number
}

const LOCK = new Color(0.36, 0.94, 1, 0.9)
const LOCK_DIM = new Color(0.22, 0.68, 0.95, 0.42)
const LOCK_GLOW = new Color(0.08, 0.52, 1, 0.22)
const LOCK_HOT = new Color(0.88, 1, 1, 0.86)

const LOCK_Z = Z.TEXT + 0.24
const LOCK_DURATION_MS = 620
const MIN_TARGET_OUTSET_PX = 12
const MAX_TARGET_OUTSET_PX = 26
const EDGE_LAUNCH_MIN_MARGIN_PX = 32
const EDGE_LAUNCH_MAX_MARGIN_PX = 86
const MIN_MAGNET_SWAY_PX = 7
const MAX_MAGNET_SWAY_PX = 22
const FULL_INTENSITY_SPEED_PX_PER_SEC = 520
const MIN_MAGNET_SPEED_RAD_PER_SEC = 2.2
const MAX_MAGNET_SPEED_RAD_PER_SEC = 14
const MOTION_ATTACK = 0.56
const MOTION_DECAY = 0.034
const MOTION_STOP_INTENSITY = 0.01
const FLIGHT_LINE_DURATION_MS = 260
const FLIGHT_BUTTON_DURATION_MS = 260
const FLIGHT_BUTTON_HIT_PROGRESS = 0.92
const FLIGHT_CONTROL_TRANSFER_DEBOUNCE_MS = 650
const RETURN_DOCK_TRANSFER_DEBOUNCE_MS = 520
const FLIGHT_BUTTON_KEY = "display-flight-button"
const FLIGHT_BUTTON_MIN_SIZE_PX = 34
const FLIGHT_BUTTON_MAX_SIZE_PX = 48
const FLIGHT_BUTTON_HIT_PAD_PX = 12
const RETURN_DOCK_KEY = "display-return-dock"
const RETURN_DOCK_BRIDGE_KEY = "display-return-dock-bridge"
const RETURN_BUTTON_KEY = "display-return-button"

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
  #returnDockPinned = false
  #returnDockExpanded = false
  #returnDockGraceUntilMs = 0
  #cornerFlightVisible = false
  #lastVisualQuad: Quad | null = null
  #lastDisplaySizePx = 0
  #lastLineProgress = 0
  #lastButtonProgress = 0
  #controlTransferGraceUntilMs = 0
  #leaveAnimation: LeaveAnimation | null = null

  constructor() {
    super({bgColor: null, borderColor: null})
  }

  acceptsPointerEvents(): boolean {
    return true
  }

  containsPointer(localX: number, localY: number): boolean {
    if (this.canvas?.displayMode === "near") {
      const dock = this.#returnDockControl()
      if (dock === null) return false
      const point = {x: localX, y: localY}
      return pointInRect(point, dock.island) || (this.#returnDockExpanded && pointInRect(point, dock.hit))
    }
    if (!this.#cornerFlightVisible) return false
    const control = this.#flightControl()
    return control !== null && pointInRect({x: localX, y: localY}, control.hit)
  }

  override onPointerLeave(): void {
    super.onPointerLeave()
    if (this.#returnDockPinned || !this.#returnDockExpanded) return
    this.#returnDockGraceUntilMs = performance.now() + RETURN_DOCK_TRANSFER_DEBOUNCE_MS
    this.requestRender()
  }

  protected render(): void {
    const mode = this.canvas?.displayMode
    if (mode === "near") {
      this.#cornerFlightVisible = false
      this.#resetAnimationState()
      this.#drawReturnDock()
      return
    } else {
      this.#returnDockPinned = false
      this.#returnDockExpanded = false
      this.#returnDockGraceUntilMs = 0
    }
    this.#drawReturnDock()

    const outline = this.canvas?.displayHoverOutline()
    if (outline === undefined || outline === null) {
      const now = performance.now()
      if (this.#flightControlHeld() && this.#lastVisualQuad !== null) {
        this.#leaveAnimation = null
        this.#cornerFlightVisible = true
        this.#controlTransferGraceUntilMs = now + FLIGHT_CONTROL_TRANSFER_DEBOUNCE_MS
        this.#drawFlightControl(this.#lastVisualQuad, 1, 1)
        this.requestRender()
        return
      }
      if (
        this.#lastVisualQuad !== null &&
        this.#lastDisplaySizePx >= 36 &&
        this.#lastButtonProgress >= FLIGHT_BUTTON_HIT_PROGRESS &&
        now < this.#controlTransferGraceUntilMs
      ) {
        this.#leaveAnimation = null
        this.#cornerFlightVisible = true
        this.#drawFlightControl(this.#lastVisualQuad, 1, 1)
        this.requestRender()
        return
      }
      if (this.#lastVisualQuad !== null && this.#lastDisplaySizePx >= 36) {
        if (this.#leaveAnimation === null) {
          this.#leaveAnimation = {
            startedAt: now,
            quad: this.#lastVisualQuad,
            edgeQuad: this.#edgeLaunchQuad(this.#lastVisualQuad),
            displaySizePx: this.#lastDisplaySizePx,
            lineStart: this.#lastLineProgress,
            buttonStart: this.#lastButtonProgress,
          }
        }
        this.#drawLeaveAnimation(now)
        return
      }
      this.#resetAnimationState()
      return
    }

    const quad = this.#outlineQuad(outline)
    const points = [quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft]
    const displaySizePx = Math.max(edgeLength(quad.topLeft, quad.topRight), edgeLength(quad.topRight, quad.bottomRight))
    if (displaySizePx < 36) {
      this.#resetAnimationState()
      return
    }

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
    const lineProgress = clamp((ageMs - LOCK_DURATION_MS) / FLIGHT_LINE_DURATION_MS, 0, 1)
    const buttonProgress = clamp((ageMs - LOCK_DURATION_MS - FLIGHT_LINE_DURATION_MS) / FLIGHT_BUTTON_DURATION_MS, 0, 1)
    const lineVisualProgress = easeOutCubic(lineProgress)
    const buttonVisualProgress = easeOutCubic(buttonProgress)
    const center = centerOf(points)
    const baseOutset = clamp(displaySizePx * 0.018, MIN_TARGET_OUTSET_PX, MAX_TARGET_OUTSET_PX)
    const swayPx = clamp(displaySizePx * 0.02, MIN_MAGNET_SWAY_PX, MAX_MAGNET_SWAY_PX)
    const magneticWave = Math.sin(this.#magnetPhase)
    const magneticPull = (0.58 + magneticWave * 0.42) * swayPx * motionIntensity
    const targetOutset = baseOutset + (progress >= 1 ? magneticPull : 0)
    const target = outsetQuad(quad, center, targetOutset)
    const start = this.#edgeLaunchQuad(target)
    const current = lerpQuad(start, target, eased)
    const settle = progress >= 1 ? 0.82 + 0.18 * motionIntensity : 0.78 + 0.22 * progress

    this.#leaveAnimation = null
    this.#lastVisualQuad = current
    this.#lastDisplaySizePx = displaySizePx
    this.#lastLineProgress = lineVisualProgress
    this.#lastButtonProgress = buttonVisualProgress
    if (buttonVisualProgress >= FLIGHT_BUTTON_HIT_PROGRESS) {
      this.#controlTransferGraceUntilMs = now + FLIGHT_CONTROL_TRANSFER_DEBOUNCE_MS
    }

    if (progress < 0.98) this.#drawApproachGuides(start, current)
    this.#drawLockedReticle(current, displaySizePx, settle)
    this.#cornerFlightVisible = buttonVisualProgress >= FLIGHT_BUTTON_HIT_PROGRESS
    if (lineProgress > 0 || buttonProgress > 0) {
      this.#drawFlightControl(current, lineVisualProgress, buttonVisualProgress)
    }

    if (
      progress < 1 ||
      lineProgress < 1 ||
      buttonProgress < 1 ||
      motionIntensity > MOTION_STOP_INTENSITY
    ) {
      this.requestRender()
    }
  }

  #drawLeaveAnimation(now: number): void {
    const leave = this.#leaveAnimation
    if (leave === null) return

    const buttonDuration = FLIGHT_BUTTON_DURATION_MS * leave.buttonStart
    const lineDuration = FLIGHT_LINE_DURATION_MS * leave.lineStart
    const elapsed = now - leave.startedAt
    let time = elapsed
    let buttonProgress = 0
    let lineProgress = 0
    let reticleProgress = 1

    if (buttonDuration > 0 && time < buttonDuration) {
      buttonProgress = leave.buttonStart * (1 - easeOutCubic(time / buttonDuration))
      lineProgress = leave.lineStart
    } else {
      time -= buttonDuration
      if (lineDuration > 0 && time < lineDuration) {
        lineProgress = leave.lineStart * (1 - easeOutCubic(time / lineDuration))
      } else {
        time -= lineDuration
        reticleProgress = 1 - easeOutCubic(clamp(time / LOCK_DURATION_MS, 0, 1))
      }
    }

    if (time >= LOCK_DURATION_MS && buttonProgress <= 0 && lineProgress <= 0) {
      this.#resetAnimationState()
      return
    }

    const current = lerpQuad(leave.edgeQuad, leave.quad, reticleProgress)
    const strength = clamp(0.28 + reticleProgress * 0.72, 0, 1)
    this.#cornerFlightVisible = buttonProgress >= FLIGHT_BUTTON_HIT_PROGRESS
    this.#drawLockedReticle(current, leave.displaySizePx, strength)
    if (lineProgress > 0 || buttonProgress > 0) {
      this.#drawFlightControl(current, lineProgress, buttonProgress, false)
    }
    this.requestRender()
  }

  #flightControlHeld(): boolean {
    if (!this.#cornerFlightVisible) return false
    const control = this.#flightControl()
    if (control === null) return false
    const hit = this.hitState(control.hit.x, control.hit.y, control.hit.w, control.hit.h, FLIGHT_BUTTON_KEY)
    return hit.hovered || hit.pressed
  }

  #resetAnimationState(): void {
    this.#lockStartedAt = null
    this.#lastQuad = null
    this.#lastFrameAt = null
    this.#motionIntensity = 0
    this.#magnetPhase = 0
    this.#cornerFlightVisible = false
    this.#lastVisualQuad = null
    this.#lastDisplaySizePx = 0
    this.#lastLineProgress = 0
    this.#lastButtonProgress = 0
    this.#controlTransferGraceUntilMs = 0
    this.#leaveAnimation = null
  }

  #edgeLaunchQuad(target: Quad): Quad {
    return {
      topLeft: this.#edgeLaunchPoint(target.topLeft),
      topRight: this.#edgeLaunchPoint(target.topRight),
      bottomRight: this.#edgeLaunchPoint(target.bottomRight),
      bottomLeft: this.#edgeLaunchPoint(target.bottomLeft),
    }
  }

  #edgeLaunchPoint(target: Point): Point {
    const center = {x: this.rectW / 2, y: this.rectH / 2}
    let dx = target.x - center.x
    let dy = target.y - center.y
    if (Math.hypot(dx, dy) < 0.001) {
      dx = target.x < this.rectW / 2 ? -1 : 1
      dy = target.y < this.rectH / 2 ? -1 : 1
    }
    let t = Infinity
    if (dx < 0) t = Math.min(t, -center.x / dx)
    else if (dx > 0) t = Math.min(t, (this.rectW - center.x) / dx)
    if (dy < 0) t = Math.min(t, -center.y / dy)
    else if (dy > 0) t = Math.min(t, (this.rectH - center.y) / dy)
    if (!Number.isFinite(t)) t = 1
    const length = Math.max(0.001, Math.hypot(dx, dy))
    const margin = clamp(Math.min(this.rectW, this.rectH) * 0.055, EDGE_LAUNCH_MIN_MARGIN_PX, EDGE_LAUNCH_MAX_MARGIN_PX)
    return {
      x: center.x + dx * t + dx / length * margin,
      y: center.y + dy * t + dy / length * margin,
    }
  }

  #drawFlightControl(quad: Quad, lineProgress = 1, buttonProgress = 1, hitEnabled = true): void {
    const control = this.#flightControlForQuad(quad)
    if (control === null) return
    const hit = this.hitState(control.hit.x, control.hit.y, control.hit.w, control.hit.h, FLIGHT_BUTTON_KEY)
    const strength = hit.pressed ? 1.18 : hit.hovered ? 1 : 0.72
    if (hitEnabled && buttonProgress >= FLIGHT_BUTTON_HIT_PROGRESS) {
      this.hit(control.hit.x, control.hit.y, control.hit.w, control.hit.h, () => {
        this.canvas?.toggleDisplayFlight()
      }, {
        key: FLIGHT_BUTTON_KEY,
        cursor: "pointer",
        activeCursor: "pointer",
      })
    }

    this.#drawFlightConnector(control, strength, lineProgress)
    if (buttonProgress <= 0.02) return
    const buttonScale = clamp(buttonProgress, 0, 1)
    const visualCenter = lerpPoint(control.lineEnd, control.center, buttonScale)
    const visualSize = control.size * buttonScale
    const visualButton = {
      x: visualCenter.x - visualSize / 2,
      y: visualCenter.y - visualSize / 2,
      w: visualSize,
      h: visualSize,
    }
    if (visualSize >= 8) this.#drawFlightCorners(visualButton, visualSize, strength * (0.62 + buttonScale * 0.38))
    if (buttonProgress < 0.74) return
    const distance = Math.max(1, Math.round((this.canvas?.displayDistanceMm() ?? 0) / 100))
    this.drawTextCentered(String(distance), visualCenter.x, visualCenter.y + 1, {
      fontPx: clamp(control.size * 0.43 * buttonScale, 10, 19),
      material: this.materials.cyan,
      maxWidthPx: Math.max(8, visualSize - 8),
      z: LOCK_Z + 0.1,
      clip: false,
    })
  }

  #drawFlightConnector(control: FlightControl, strength: number, progress = 1): void {
    const lineProgress = clamp(progress, 0, 1)
    if (lineProgress <= 0.001) return
    const lineEnd = lerpPoint(control.anchor, control.lineEnd, lineProgress)
    this.#drawLockLine(control.anchor, lineEnd, fade(LOCK_DIM, 0.74 * strength * lineProgress), 1.25, LOCK_Z + 0.02)
    const s = clamp(control.size * 0.18, 6, 9) * lineProgress
    this.#drawLockLine({x: control.anchor.x - s, y: control.anchor.y}, {x: control.anchor.x + s, y: control.anchor.y}, fade(LOCK, 0.74 * strength * lineProgress), 1.35, LOCK_Z + 0.04)
    this.#drawLockLine({x: control.anchor.x, y: control.anchor.y - s}, {x: control.anchor.x, y: control.anchor.y + s}, fade(LOCK, 0.74 * strength * lineProgress), 1.35, LOCK_Z + 0.04)
    this.drawRoundedRect(control.anchor.x - 2.1, control.anchor.y - 2.1, 4.2, 4.2, {
      radius: 2.1,
      fill: fade(LOCK_HOT, 0.72 * strength * lineProgress),
      border: null,
      z: LOCK_Z + 0.08,
    })
  }

  #outlineQuad(outline: Quad): Quad {
    return {
      topLeft: outline.topLeft,
      topRight: outline.topRight,
      bottomRight: outline.bottomRight,
      bottomLeft: outline.bottomLeft,
    }
  }

  #drawLockedReticle(quad: Quad, displaySizePx: number, strength: number): void {
    this.#drawCornerLock(quad.topLeft, quad.topRight, quad.bottomLeft, displaySizePx, strength)
    this.#drawCornerLock(quad.topRight, quad.topLeft, quad.bottomRight, displaySizePx, strength)
    this.#drawCornerLock(quad.bottomRight, quad.bottomLeft, quad.topRight, displaySizePx, strength)
    this.#drawCornerLock(quad.bottomLeft, quad.bottomRight, quad.topLeft, displaySizePx, strength)
    this.#drawSideMarks(quad, displaySizePx, strength)
  }

  #flightControl(): FlightControl | null {
    if (this.canvas?.displayMode === "near") return null
    const outline = this.canvas?.displayOutline()
    if (outline === undefined || outline === null) return null
    return this.#flightControlForQuad(this.#outlineQuad(outline))
  }

  #returnDockControl(): ReturnDockControl | null {
    const islandW = clamp(this.rectW * 0.075, 58, 88)
    const islandH = 17
    const islandX = (this.rectW - islandW) / 2
    const islandY = this.rectH - 30
    if (islandY < 64) return null
    const size = 38
    const buttonX = this.rectW / 2 - size / 2
    const buttonY = islandY - size - 11
    const hitPad = 28
    return {
      island: {x: islandX, y: islandY, w: islandW, h: islandH},
      button: {x: buttonX, y: buttonY, w: size, h: size},
      hit: {
        x: Math.min(islandX, buttonX) - hitPad,
        y: buttonY - hitPad,
        w: Math.max(islandX + islandW, buttonX + size) - Math.min(islandX, buttonX) + hitPad * 2,
        h: islandY + islandH - buttonY + hitPad * 2,
      },
      center: {x: this.rectW / 2, y: islandY + islandH / 2},
      buttonCenter: {x: this.rectW / 2, y: buttonY + size / 2},
      size,
    }
  }

  #flightControlForQuad(quad: Quad): FlightControl | null {
    const points = [quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft]
    const center = centerOf(points)
    const displaySizePx = Math.max(edgeLength(quad.topLeft, quad.topRight), edgeLength(quad.topRight, quad.bottomRight))
    if (displaySizePx < 12) return null
    const size = clamp(displaySizePx * 0.055, FLIGHT_BUTTON_MIN_SIZE_PX, FLIGHT_BUTTON_MAX_SIZE_PX)
    const gap = clamp(displaySizePx * 0.04, 24, 56)
    const dx = quad.topRight.x - center.x
    const dy = quad.topRight.y - center.y
    const diagonal = Math.max(0.001, Math.hypot(dx, dy))
    const nx = dx / diagonal
    const ny = dy / diagonal
    const rawCx = quad.topRight.x + nx * (gap + size * 0.9)
    const rawCy = quad.topRight.y + ny * (gap + size * 0.9)
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
      lineEnd: pointAlong({x: cx, y: cy}, anchor, size * 0.74),
      size,
    }
  }

  #drawReturnDock(): void {
    const dock = this.#returnDockControl()
    if (dock === null) return
    const canReturn = this.canvas?.displayMode === "near"
    const islandHit = canReturn ? this.hitState(dock.island.x, dock.island.y, dock.island.w, dock.island.h, RETURN_DOCK_KEY) : {hovered: false, pressed: false}
    const bridgeHit = canReturn ? this.hitState(dock.hit.x, dock.hit.y, dock.hit.w, dock.hit.h, RETURN_DOCK_BRIDGE_KEY) : {hovered: false, pressed: false}
    const buttonHit = canReturn ? this.hitState(dock.button.x, dock.button.y, dock.button.w, dock.button.h, RETURN_BUTTON_KEY) : {hovered: false, pressed: false}
    const now = performance.now()
    const dockActive = islandHit.hovered || islandHit.pressed || bridgeHit.hovered || bridgeHit.pressed || buttonHit.hovered || buttonHit.pressed
    if (dockActive || this.#returnDockPinned) this.#returnDockGraceUntilMs = now + RETURN_DOCK_TRANSFER_DEBOUNCE_MS
    const expanded = canReturn && (this.#returnDockPinned || dockActive || now < this.#returnDockGraceUntilMs)
    this.#returnDockExpanded = expanded
    if (expanded && !this.#returnDockPinned && !dockActive) this.requestRender()

    if (canReturn) {
      if (expanded) {
        this.hit(dock.hit.x, dock.hit.y, dock.hit.w, dock.hit.h, () => {}, {
          key: RETURN_DOCK_BRIDGE_KEY,
          cursor: "pointer",
          activeCursor: "pointer",
        })
      }
      this.hit(dock.island.x, dock.island.y, dock.island.w, dock.island.h, () => {
        this.#returnDockPinned = !this.#returnDockPinned
        this.requestRender()
      }, {
        key: RETURN_DOCK_KEY,
        cursor: "pointer",
        activeCursor: "pointer",
      })
    }

    const islandStrength = expanded ? 1 : 0.62
    this.drawRoundedRect(dock.island.x, dock.island.y, dock.island.w, dock.island.h, {
      radius: dock.island.h / 2,
      fill: fade(LOCK_GLOW, 0.4 * islandStrength),
      border: fade(LOCK_DIM, 0.95 * islandStrength),
      borderWidth: 1.2,
      z: LOCK_Z,
    })
    this.#drawLockLine(
      {x: dock.center.x - dock.island.w * 0.18, y: dock.center.y},
      {x: dock.center.x + dock.island.w * 0.18, y: dock.center.y},
      fade(LOCK_HOT, 0.62 * islandStrength),
      1.6,
      LOCK_Z + 0.04,
    )

    if (!expanded) return

    this.hit(dock.button.x, dock.button.y, dock.button.w, dock.button.h, () => {
      this.#returnDockPinned = false
      this.#returnDockExpanded = false
      this.canvas?.toggleDisplayFlight()
    }, {
      key: RETURN_BUTTON_KEY,
      cursor: "pointer",
      activeCursor: "pointer",
    })

    const strength = buttonHit.pressed ? 1.18 : buttonHit.hovered ? 1 : 0.82
    this.#drawLockLine(
      {x: dock.buttonCenter.x, y: dock.button.y + dock.button.h},
      {x: dock.center.x, y: dock.island.y},
      fade(LOCK_DIM, 0.58 * strength),
      1.1,
      LOCK_Z + 0.02,
    )
    this.#drawFlightCorners(dock.button, dock.size, strength)
    this.#drawReturnArrow(dock.buttonCenter, dock.size, strength)
  }

  #drawReturnArrow(center: Point, size: number, strength: number): void {
    const left = center.x - size * 0.14
    const right = center.x + size * 0.16
    const top = center.y - size * 0.14
    const midY = center.y + size * 0.03
    const bottom = center.y + size * 0.18
    const color = fade(LOCK_HOT, 0.9 * strength)
    this.#drawLockLine({x: right, y: top}, {x: left, y: midY}, color, 1.8, LOCK_Z + 0.1)
    this.#drawLockLine({x: left, y: midY}, {x: right, y: bottom}, color, 1.8, LOCK_Z + 0.1)
    this.#drawLockLine({x: left, y: midY}, {x: center.x + size * 0.24, y: midY}, fade(LOCK, 0.7 * strength), 1.25, LOCK_Z + 0.08)
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
