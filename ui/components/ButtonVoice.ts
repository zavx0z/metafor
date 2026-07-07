import {Color} from "@metafor/engine"
import {button, drawIconCentered, palette, type ButtonElementProps, type UiSurface} from "@ui/elements"

export type ButtonVoiceStatus = "idle" | "connecting" | "waitingWake" | "listening" | "committing" | "processing" | "error"
export type ButtonVoiceServiceState = "unknown" | "ok" | "down"

export type ButtonVoiceSnapshot = {
  status: ButtonVoiceStatus
  serviceState: ButtonVoiceServiceState
  level: number
}

export type ButtonVoiceProps = {
  key?: string
  snapshot: ButtonVoiceSnapshot
  soundPulse?: number
  tooltip?: string
  disabled?: boolean
  onClick(): void
}

export function ButtonVoice(host: UiSurface, x: number, y: number, size: number, props: ButtonVoiceProps): void {
  const buttonSize = Math.max(20, size)
  const centerX = x + buttonSize / 2
  const centerY = y + buttonSize / 2
  const status = props.snapshot.status
  const error = status === "error" || props.snapshot.serviceState === "down"
  const active = status === "listening" || status === "committing"
  const processing = status === "processing"
  const waiting = status === "waitingWake"
  const metering = active || waiting
  const connecting = status === "connecting" || status === "committing"
  const soundPulse = Math.max(0, Math.min(1, props.soundPulse ?? 0))
  const iconColor = error
    ? palette.red
    : connecting
      ? palette.orange
      : active
        ? palette.cyan
        : processing
          ? fade(palette.cyan, 0.78)
        : soundPulse > 0
          ? mixColor(palette.cyan, palette.text, 0.28)
          : waiting
            ? fade(palette.cyan, 0.68)
            : palette.muted

  if (metering) {
    drawRadialMeter(
      host,
      centerX,
      centerY,
      waiting ? buttonSize / 2 - Math.max(6, buttonSize * 0.19) : buttonSize / 2 + Math.max(4, buttonSize * 0.12),
      active ? Math.max(8, buttonSize * 0.31) : Math.max(5, buttonSize * 0.22),
      props.snapshot.level,
    )
  }
  if (processing) drawProcessingLoader(host, centerX, centerY, buttonSize)
  if (soundPulse > 0) drawSoundPulse(host, centerX, centerY, buttonSize, soundPulse)

  const buttonProps: ButtonElementProps = {
    key: props.key ?? `button-voice:${x}:${y}:${buttonSize}`,
    tooltip: props.tooltip ?? "Голосовой ввод",
    onClick: props.onClick,
    style: (state) => {
      const borderColor = error ? "red" : connecting ? "orange" : active || processing || waiting ? "cyan" : null
      return {
        background: state === "hover" ? "rgba(18, 28, 42, 0.82)" : "rgba(10, 16, 24, 0.72)",
        borderColor,
        borderRadius: buttonSize / 2,
        borderWidth: borderColor === null ? 0 : active || processing || connecting || waiting || error ? 1.2 : 1,
        glassTint: active || waiting || soundPulse > 0 ? "cyan" : null,
        glassTintOpacity: active ? 0.08 : waiting ? 0.035 : processing ? 0.04 : soundPulse > 0 ? 0.06 * soundPulse : 0,
        zIndex: 0.3,
      }
    },
    children: (state) => drawIconCentered(host, micIcon(iconColor), centerX, centerY, Math.max(14, Math.min(22, Math.round(buttonSize * 0.42))), {
      opacity: state === "hover" || active || processing || soundPulse > 0 ? 0.96 : waiting || connecting ? 0.84 : 0.72,
      z: 0.55,
    }),
  }
  if (props.disabled !== undefined) buttonProps.disabled = props.disabled
  button(host, x, y, buttonSize, buttonSize, buttonProps)
}

function drawProcessingLoader(host: UiSurface, cx: number, cy: number, buttonSize: number): void {
  const count = 24
  const radius = buttonSize / 2 + Math.max(5, buttonSize * 0.1)
  const phaseOffset = (performance.now() / 620) % 1
  for (let index = 0; index < count; index += 1) {
    const unit = index / count
    const phase = unit * Math.PI * 2
    const trail = (unit - phaseOffset + 1) % 1
    const alpha = 0.16 + Math.pow(1 - trail, 2.6) * 0.72
    const inner = radius
    const outer = radius + 6
    const x0 = cx + Math.cos(phase) * inner
    const y0 = cy + Math.sin(phase) * inner
    const x1 = cx + Math.cos(phase) * outer
    const y1 = cy + Math.sin(phase) * outer
    host.drawRoundedLine(x0, y0, x1, y1, fade(palette.cyan, alpha), 3, 0.2)
  }
}

function drawSoundPulse(host: UiSurface, cx: number, cy: number, buttonSize: number, amount: number): void {
  const progress = 1 - amount
  const ringSize = buttonSize + 8 + progress * 20
  const alpha = amount * amount
  host.drawRoundedRect(cx - ringSize / 2, cy - ringSize / 2, ringSize, ringSize, {
    radius: ringSize / 2,
    fill: fade(palette.cyan, 0.045 * alpha),
    border: fade(palette.cyan, 0.58 * alpha),
    borderWidth: 1.4,
    opacity: 1,
    z: 0.24,
  })
  const innerSize = buttonSize - 6
  host.drawRoundedRect(cx - innerSize / 2, cy - innerSize / 2, innerSize, innerSize, {
    radius: innerSize / 2,
    fill: fade(palette.cyan, 0.065 * alpha),
    border: null,
    z: 0.26,
  })
}

function drawRadialMeter(host: UiSurface, cx: number, cy: number, radius: number, maxBar: number, rawLevel: number): void {
  const count = 24
  const level = Math.max(0, Math.min(1, rawLevel))
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
    host.drawRoundedLine(x0, y0, x1, y1, color, 3, 0.2)
  }
}

const micIconCache = new Map<string, string>()

function micIcon(color: Color): string {
  const key = svgHex(color)
  const cached = micIconCache.get(key)
  if (cached !== undefined) return cached
  const source = `<svg viewBox="0 0 24 24" fill="none" stroke="${key}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><path d="M12 19v3"/><path d="M8 22h8"/></svg>`
  const icon = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`
  micIconCache.set(key, icon)
  return icon
}

function svgHex(color: Color): string {
  const r = Math.round(color.r * 255).toString(16).padStart(2, "0")
  const g = Math.round(color.g * 255).toString(16).padStart(2, "0")
  const b = Math.round(color.b * 255).toString(16).padStart(2, "0")
  return `#${r}${g}${b}`
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
