import {Color} from "@metafor/engine"
import {Checkbox, type CheckboxProps, type CheckboxSize} from "./Checkbox.ts"
import {palette, Z, type StyleProps, type Tone, type UiSurface} from "@ui/elements"

export type ProgressCheckboxProps = Omit<CheckboxProps, "checked" | "value"> & {
  checked?: boolean
  value?: boolean
  progress?: number
  paused?: boolean
}

export function ProgressCheckbox(host: UiSurface, x: number, y: number, width: number, height: number, props: ProgressCheckboxProps = {}): void {
  const {progress: inputProgress, paused, ...checkboxProps} = props
  const hasProgress = typeof inputProgress === "number" && Number.isFinite(inputProgress)
  const progress = checkboxProgress(inputProgress)
  const checked = (checkboxProps.checked ?? checkboxProps.value ?? false) || progress >= 100
  const tone = hasProgress ? paused === true ? "paused" : "live" : checkboxProps.tone
  Checkbox(host, x, y, width, height, {...checkboxProps, ...(tone === undefined ? {} : {tone}), checked})
  if (checkboxProps.disabled === true || checked || !hasProgress) return

  const size = checkboxSize(width, height, props.size)
  const color = progressColor(paused === true ? "paused" : "live")
  drawProgressBase(
    host,
    x + Math.max(0, (width - size) / 2),
    y + Math.max(0, (height - size) / 2),
    size,
    color,
    numericStyleValue(checkboxProps.sx?.zIndex) ?? Z.ELEMENT,
  )
  if (progress <= 0) return
  drawProgressBorder(
    host,
    x + Math.max(0, (width - size) / 2),
    y + Math.max(0, (height - size) / 2),
    size,
    progress,
    color,
    numericStyleValue(checkboxProps.sx?.zIndex) ?? Z.ELEMENT,
  )
}

function drawProgressBase(host: UiSurface, x: number, y: number, size: number, color: Color, z: number): void {
  host.drawRoundedRect(x, y, size, size, {
    radius: Math.max(3, Math.min(6, size * 0.24)),
    fill: withAlpha(color, 0.08),
    border: withAlpha(color, 0.46),
    borderWidth: 1,
    z: z + 0.03,
  })
}

function drawProgressBorder(host: UiSurface, x: number, y: number, size: number, progress: number, color: Color, z: number): void {
  const p = Math.min(1, Math.max(0, progress / 100))
  const inset = 1
  const left = x + inset
  const top = y + inset
  const right = x + size - inset
  const bottom = y + size - inset
  const perimeter = Math.max(1, (right - left + bottom - top) * 2)
  let remaining = perimeter * p
  remaining = drawProgressEdge(host, left, top, right, top, remaining, color, z)
  remaining = drawProgressEdge(host, right, top, right, bottom, remaining, color, z)
  remaining = drawProgressEdge(host, right, bottom, left, bottom, remaining, color, z)
  drawProgressEdge(host, left, bottom, left, top, remaining, color, z)
}

function drawProgressEdge(host: UiSurface, x0: number, y0: number, x1: number, y1: number, remaining: number, color: Color, z: number): number {
  if (remaining <= 0) return 0
  const length = Math.hypot(x1 - x0, y1 - y0)
  if (length <= 0) return remaining
  const drawn = Math.min(length, remaining)
  const t = drawn / length
  host.drawRoundedLine(x0, y0, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, color, 2, z + 0.04)
  return remaining - drawn
}

function progressColor(tone: Tone): Color {
  if (tone === "live") return palette.green
  if (tone === "paused") return palette.orange
  if (tone === "warn") return palette.red
  return palette.cyan
}

function checkboxProgress(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, value))
}

function checkboxSize(width: number, height: number, size: CheckboxSize | undefined): number {
  const max = Math.max(1, Math.min(width, height))
  if (size === "small") return Math.min(max, 14)
  if (size === "large") return Math.min(max, 22)
  return Math.min(max, 18)
}

function numericStyleValue(value: StyleProps[keyof StyleProps] | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function withAlpha(color: Color, alpha: number): Color {
  return new Color(color.r, color.g, color.b, alpha)
}
