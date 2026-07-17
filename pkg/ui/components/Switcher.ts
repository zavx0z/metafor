import {Z, palette, toneBorder, toneFill, type HitOptions, type StyleProps, type Tone, type UiSurface} from "@ui/elements"
import {Color} from "@metafor/engine"

export type SwitcherColor = "primary" | "neutral" | "success" | "warning" | "error"
export type SwitcherSize = "small" | "medium" | "large"

export type SwitcherProps = {
  checked?: boolean
  value?: boolean
  disabled?: boolean
  color?: SwitcherColor
  tone?: Tone
  size?: SwitcherSize
  key?: string
  tooltip?: string
  tooltipDelayMs?: number
  sx?: StyleProps
  onChange?: (checked: boolean) => void
  onClick?: (checked: boolean) => void
}

export function Switcher(host: UiSurface, x: number, y: number, width: number, height: number, props: SwitcherProps = {}): void {
  const checked = props.checked ?? props.value ?? false
  const disabled = props.disabled === true
  const key = props.key ?? `component-switcher:${x}:${y}:${width}:${height}`
  const hit = disabled ? {hovered: false, pressed: false} : host.hitState(x, y, width, height, key)
  const active = hit.pressed
  const hover = hit.hovered
  const accented = isAccented(props)
  const h = switcherHeight(height, props.size)
  const w = Math.max(width, h * 1.9)
  const radius = numericStyleValue(props.sx?.borderRadius) ?? h / 2
  const inset = Math.max(2, Math.min(4, h * 0.14))
  const knob = Math.max(4, h - inset * 2)
  const knobX = x + inset + (checked ? Math.max(0, w - inset * 2 - knob) : 0)
  const accent = accentColor(props)
  const tone = props.tone ?? toneFromColor(props.color ?? "neutral")
  const baseTrack = active ? palette.bgHot : hover ? palette.bgElevated : palette.bgInput
  const trackFill = checked ? withAlpha(mixColor(baseTrack, toneFill(tone), accented ? 0.30 : 0.16), 0.96) : baseTrack
  const trackBorder = disabled
    ? withAlpha(palette.borderDim, 0.58)
    : checked
      ? mixColor(toneBorder(tone), palette.border, accented ? 0.36 : 0.84)
      : active || hover
        ? palette.border
        : palette.borderDim
  const knobFill = disabled ? withAlpha(palette.muted, 0.58) : checked ? palette.text : palette.muted
  const opacity = numericStyleValue(props.sx?.opacity) ?? (disabled ? 0.48 : checked ? 0.92 : active ? 0.86 : hover ? 0.78 : 0.66)
  const borderWidth = numericStyleValue(props.sx?.borderWidth) ?? 1
  const z = numericStyleValue(props.sx?.zIndex) ?? Z.ELEMENT

  host.drawRoundedRect(x, y, w, h, {
    radius,
    fill: trackFill,
    border: trackBorder,
    borderWidth,
    opacity,
    z,
  })

  if (checked) {
    const dot = Math.max(4, Math.min(7, h * 0.28))
    host.drawRoundedRect(x + w - h + (h - dot) / 2, y + (h - dot) / 2, dot, dot, {
      radius: dot / 2,
      fill: accent,
      border: null,
      opacity: disabled ? 0.32 : accented ? 0.72 : 0.50,
      z: z + 0.01,
    })
  }

  host.drawRoundedRect(knobX, y + inset, knob, knob, {
    radius: knob / 2,
    fill: knobFill,
    border: checked ? palette.borderBright : palette.borderDim,
    borderWidth: 1,
    opacity: disabled ? 0.58 : checked ? 0.94 : 0.82,
    z: z + 0.02,
  })

  if (!disabled) {
    const hitOptions: HitOptions = {
      cursor: "pointer",
      key,
    }
    if (props.tooltip !== undefined) {
      hitOptions.tooltip = {label: props.tooltip, delayMs: props.tooltipDelayMs ?? 450}
    }
    host.hit(x, y, w, h, () => {
      const next = !checked
      props.onChange?.(next)
      props.onClick?.(next)
    }, hitOptions)
    if (props.tooltip !== undefined) {
      host.drawTooltipForHit(x, y, w, h, props.tooltip, {delayMs: props.tooltipDelayMs ?? 450})
    }
  }
}

function switcherHeight(height: number, size: SwitcherSize | undefined): number {
  if (height > 0) return height
  if (size === "small") return 18
  if (size === "large") return 28
  return 22
}

function toneFromColor(color: SwitcherColor): Tone {
  if (color === "success") return "live"
  if (color === "warning") return "paused"
  if (color === "error") return "warn"
  return "neutral"
}

function accentColor(props: SwitcherProps): Color {
  if (props.tone === "live" || props.color === "success") return palette.green
  if (props.tone === "paused" || props.color === "warning") return palette.orange
  if (props.tone === "warn" || props.color === "error") return palette.red
  if (props.color === "primary") return palette.cyan
  return palette.borderBright
}

function isAccented(props: SwitcherProps): boolean {
  if (props.color !== undefined && props.color !== "neutral") return true
  return props.tone !== undefined && props.tone !== "neutral"
}

function numericStyleValue(value: StyleProps[keyof StyleProps] | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function mixColor(a: Color, b: Color, t: number): Color {
  const k = Math.min(1, Math.max(0, t))
  return new Color(
    a.r + (b.r - a.r) * k,
    a.g + (b.g - a.g) * k,
    a.b + (b.b - a.b) * k,
    a.a + (b.a - a.a) * k,
  )
}

function withAlpha(color: Color, alpha: number): Color {
  return new Color(color.r, color.g, color.b, alpha)
}
