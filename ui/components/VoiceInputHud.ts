import {UiSurface, button, drawIconCentered, palette, type UiSurfaceRect} from "@ui/elements"
import {Color} from "@metafor/engine"

export type VoiceInputHudStatus = "idle" | "connecting" | "waitingWake" | "listening" | "committing" | "error"
export type VoiceInputHudServiceState = "unknown" | "ok" | "down"

export type VoiceInputHudSnapshot = {
  status: VoiceInputHudStatus
  statusLine: string
  targetLine: string
  autoEnterLine: string
  detailLine: string
  serviceLine: string
  serviceState: VoiceInputHudServiceState
  level: number
}

export type VoiceInputHudOptions = {
  onToggle(): void
  onMove?(rect: UiSurfaceRect): void
  startTooltip(): string
  stopTooltip(): string
}

const VOICE_HUD_LONG_PRESS_MS = 450
const SOUND_PULSE_MS = 680

export class VoiceInputHud extends UiSurface {
  #press: {
    lastX: number
    lastY: number
    offsetX: number
    offsetY: number
    dragging: boolean
    timer: ReturnType<typeof setTimeout> | null
  } | null = null
  #suppressToggleClick = false
  #soundPulseStartedAt = 0
  #soundPulseRaf: number | null = null
  #snapshot: VoiceInputHudSnapshot = {
    status: "idle",
    statusLine: "",
    targetLine: "",
    autoEnterLine: "",
    detailLine: "",
    serviceLine: "",
    serviceState: "unknown",
    level: 0,
  }

  constructor(private readonly options: VoiceInputHudOptions) {
    super({bgColor: null, borderColor: null})
  }

  setSnapshot(snapshot: VoiceInputHudSnapshot): void {
    this.#snapshot = snapshot
    this.requestRender()
  }

  flashSoundIndicator(): void {
    this.#soundPulseStartedAt = performance.now()
    this.#scheduleSoundPulseFrame()
    this.requestRender()
  }

  protected render(): void {
    const status = this.#snapshot.status
    const error = status === "error" || this.#snapshot.serviceState === "down"
    const buttonSize = 58
    const buttonX = Math.max(0, (this.rectW - buttonSize) / 2)
    const buttonY = Math.max(0, (this.rectH - buttonSize) / 2)
    const centerX = buttonX + buttonSize / 2
    const centerY = buttonY + buttonSize / 2
    const active = status === "listening" || status === "committing"
    const waiting = status === "waitingWake"
    const connecting = status === "connecting" || status === "committing"
    const soundPulse = this.#soundPulseAmount()
    const iconColor = error
      ? palette.red
      : connecting
        ? palette.orange
        : active
          ? palette.cyan
          : soundPulse > 0
            ? mixColor(palette.cyan, palette.text, 0.28)
            : waiting
              ? fade(palette.cyan, 0.68)
              : palette.muted
    const tooltip = status === "listening" || status === "committing" || status === "connecting"
      ? this.options.stopTooltip()
      : this.options.startTooltip()

    if (active || waiting) {
      this.#drawRadialMeter(
        centerX,
        centerY,
        waiting ? buttonSize / 2 - 11 : buttonSize / 2 + 7,
        active ? 18 : 0,
      )
    }
    if (soundPulse > 0) this.#drawSoundPulse(centerX, centerY, buttonSize, soundPulse)

    button(this, buttonX, buttonY, buttonSize, buttonSize, {
      key: "voice-input-hud-toggle",
      tooltip,
      onClick: () => this.#toggleFromClick(),
      style: (state) => ({
        background: state === "hover" ? "rgba(18, 28, 42, 0.82)" : "rgba(10, 16, 24, 0.72)",
        borderColor: error ? "red" : connecting ? "orange" : active ? "cyan" : waiting ? "border" : "borderDim",
        borderRadius: buttonSize / 2,
        borderWidth: active || connecting || error ? 1.2 : 1,
        glassTint: active || soundPulse > 0 ? "cyan" : null,
        glassTintOpacity: active ? 0.08 : soundPulse > 0 ? 0.06 * soundPulse : 0,
        zIndex: 0.3,
      }),
      children: (state) => drawIconCentered(this, micIcon(iconColor), centerX, centerY, 22, {
        opacity: state === "hover" || active || soundPulse > 0 ? 0.96 : waiting || connecting ? 0.84 : 0.72,
        z: 0.55,
      }),
    })
  }

  override onPointerDown(event: MouseEvent, localX: number, localY: number): void {
    super.onPointerDown(event, localX, localY)
    if (event.button !== 0 || this.pressedHit === null) return
    const point = this.#canvasPoint(event)
    const frame = this.canvas?.surfaceFrame(this)
    if (point === null || frame === undefined || frame === null) return
    const press = {
      lastX: point.x,
      lastY: point.y,
      offsetX: point.x - frame.rect.x,
      offsetY: point.y - frame.rect.y,
      dragging: false,
      timer: null as ReturnType<typeof setTimeout> | null,
    }
    press.timer = setTimeout(() => {
      if (this.#press !== press) return
      press.dragging = true
      this.#moveToCanvasPoint(press)
    }, VOICE_HUD_LONG_PRESS_MS)
    this.#press = press
  }

  override onPointerMove(event: MouseEvent, localX: number, localY: number): void {
    const press = this.#press
    if (press === null) {
      super.onPointerMove(event, localX, localY)
      return
    }

    const point = this.#canvasPoint(event)
    if (point !== null) {
      press.lastX = point.x
      press.lastY = point.y
    }

    if (!press.dragging) {
      super.onPointerMove(event, localX, localY)
      return
    }

    event.preventDefault()
    this.#moveToCanvasPoint(press)
    if (this.canvas?.canvas !== undefined) this.canvas.canvas.style.cursor = "grabbing"
  }

  override onPointerUp(event: MouseEvent, localX: number, localY: number): void {
    const press = this.#press
    this.#press = null
    if (press?.timer !== null && press?.timer !== undefined) clearTimeout(press.timer)
    const wasDragging = press?.dragging === true
    if (wasDragging) this.#suppressToggleClick = true
    super.onPointerUp(event, localX, localY)
    if (wasDragging) this.#suppressToggleClick = false
  }

  override onPointerLeave(): void {
    super.onPointerLeave()
    this.#cancelPress()
  }

  override onDeactivate(): void {
    super.onDeactivate()
    this.#cancelPress()
  }

  override dispose(): void {
    this.#cancelPress()
    if (this.#soundPulseRaf !== null) cancelAnimationFrame(this.#soundPulseRaf)
    this.#soundPulseRaf = null
    super.dispose()
  }

  #toggleFromClick(): void {
    if (this.#suppressToggleClick) return
    this.options.onToggle()
  }

  #cancelPress(): void {
    const press = this.#press
    this.#press = null
    if (press?.timer !== null && press?.timer !== undefined) clearTimeout(press.timer)
  }

  #moveToCanvasPoint(press: {lastX: number; lastY: number; offsetX: number; offsetY: number}): void {
    const frame = this.canvas?.surfaceFrame(this)
    if (frame === undefined || frame === null) return
    const applied = this.canvas?.setSurfaceRect(this, {
      x: press.lastX - press.offsetX,
      y: press.lastY - press.offsetY,
      w: frame.rect.w,
      h: frame.rect.h,
    })
    if (applied !== undefined && applied !== null) this.options.onMove?.(applied)
  }

  #soundPulseAmount(): number {
    if (this.#soundPulseStartedAt <= 0) return 0
    const elapsed = performance.now() - this.#soundPulseStartedAt
    if (elapsed >= SOUND_PULSE_MS) return 0
    const progress = elapsed / SOUND_PULSE_MS
    return 1 - progress
  }

  #scheduleSoundPulseFrame(): void {
    if (this.#soundPulseRaf !== null) return
    this.#soundPulseRaf = requestAnimationFrame(() => {
      this.#soundPulseRaf = null
      if (this.#soundPulseAmount() <= 0) {
        this.#soundPulseStartedAt = 0
        this.requestRender()
        return
      }
      this.requestRender()
      this.#scheduleSoundPulseFrame()
    })
  }

  #drawSoundPulse(cx: number, cy: number, buttonSize: number, amount: number): void {
    const progress = 1 - amount
    const ringSize = buttonSize + 8 + progress * 20
    const alpha = amount * amount
    this.drawRoundedRect(cx - ringSize / 2, cy - ringSize / 2, ringSize, ringSize, {
      radius: ringSize / 2,
      fill: fade(palette.cyan, 0.045 * alpha),
      border: fade(palette.cyan, 0.58 * alpha),
      borderWidth: 1.4,
      opacity: 1,
      z: 0.24,
    })
    const innerSize = buttonSize - 6
    this.drawRoundedRect(cx - innerSize / 2, cy - innerSize / 2, innerSize, innerSize, {
      radius: innerSize / 2,
      fill: fade(palette.cyan, 0.065 * alpha),
      border: null,
      z: 0.26,
    })
  }

  #canvasPoint(event: MouseEvent): {x: number; y: number} | null {
    const canvas = this.canvas?.canvas
    if (canvas === undefined) return null
    const rect = canvas.getBoundingClientRect()
    return {x: event.clientX - rect.left, y: event.clientY - rect.top}
  }

  #drawRadialMeter(cx: number, cy: number, radius: number, maxBar: number): void {
    const count = 24
    const level = Math.max(0, Math.min(1, this.#snapshot.level))
    for (let index = 0; index < count; index += 1) {
      const threshold = (index + 1) / count
      const phase = (index / count) * Math.PI * 2
      const peak = 0.55 + 0.45 * Math.sin(phase * 3 + level * Math.PI)
      const amount = Math.max(0.16, Math.min(1, level * (0.55 + peak * 0.65)))
      const inner = radius
      const outer = radius + 5 + amount * maxBar
      const x0 = cx + Math.cos(phase) * inner
      const y0 = cy + Math.sin(phase) * inner
      const x1 = cx + Math.cos(phase) * outer
      const y1 = cy + Math.sin(phase) * outer
      const color = level >= threshold * 0.78 ? fade(palette.cyan, 0.82) : fade(palette.borderDim, 0.72)
      this.drawRoundedLine(x0, y0, x1, y1, color, 3, 0.2)
    }
  }
}

const micIconCache = new Map<string, string>()

function micIcon(color: Color): string {
  const key = `${color.r}:${color.g}:${color.b}:${color.a}`
  const cached = micIconCache.get(key)
  if (cached !== undefined) return cached
  const source = `<svg width="1200" height="1200" viewBox="0 0 1200 1200" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke="${svgHex(color)}" stroke-opacity="${roundAlpha(color.a)}" stroke-width="84" stroke-linecap="round" stroke-linejoin="round"><rect x="430" y="135" width="340" height="560" rx="170"/><path d="M260 520c0 188 152 340 340 340s340-152 340-340"/><path d="M600 860v205"/><path d="M430 1065h340"/></g></svg>`
  const icon = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`
  micIconCache.set(key, icon)
  return icon
}

function svgHex(color: Color): string {
  const channel = (value: number): string => Math.round(Math.max(0, Math.min(1, value)) * 255).toString(16).padStart(2, "0")
  return `#${channel(color.r)}${channel(color.g)}${channel(color.b)}`
}

function roundAlpha(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 1000) / 1000
}

function fade(color: Color, opacity: number): Color {
  return new Color(color.r, color.g, color.b, Math.max(0, Math.min(1, color.a * opacity)))
}

function mixColor(a: Color, b: Color, t: number): Color {
  const k = Math.max(0, Math.min(1, t))
  return new Color(
    a.r + (b.r - a.r) * k,
    a.g + (b.g - a.g) * k,
    a.b + (b.b - a.b) * k,
    a.a + (b.a - a.a) * k,
  )
}
