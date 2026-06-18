import {Color} from "@metafor/engine"
import {Z, palette, uiIcons, type UiSurface} from "@ui/elements"
import {IconButton, type IconButtonProps} from "./Button.ts"

export type SliderControlLayout = "header" | "track"

export type SliderControlTone = "text" | "muted" | "cyan"

export type SliderControlProps = {
  key: string
  label: string
  value: number
  min?: number
  max: number
  step: number
  format?: (value: number) => string
  downLabel?: string
  upLabel?: string
  hintLabel?: string
  rangeStartLabel?: string
  rangeEndLabel?: string
  layout?: SliderControlLayout
  labelTone?: SliderControlTone
  valueTone?: SliderControlTone
  labelFontPx?: number
  valueFontPx?: number
  buttonWidth?: number
  buttonHeight?: number
  zBase?: number
  textZ?: number
  onChange(value: number): void
}

export function SliderControl(host: UiSurface, x: number, y: number, w: number, props: SliderControlProps): number {
  const layout = props.layout ?? "header"
  if (layout === "track") return drawTrackLayout(host, x, y, w, props)
  return drawHeaderLayout(host, x, y, w, props)
}

function drawHeaderLayout(host: UiSurface, x: number, y: number, w: number, props: SliderControlProps): number {
  const bounds = sliderBounds(props)
  const value = normalizedSliderValue(props.value, bounds.min, bounds.max)
  const ratio = sliderRatio(value, bounds.min, bounds.max)
  const zBase = props.zBase ?? Z.ELEMENT
  const textZ = props.textZ ?? Z.TEXT
  host.drawText(props.label, x, y + 3, {
    fontPx: props.labelFontPx ?? 10,
    material: materialForTone(host, props.labelTone ?? "text"),
    maxWidthPx: Math.max(1, w - 120),
    z: textZ,
  })
  host.drawText(formatSliderValue(props, value), x + w - 106, y + 3, {
    fontPx: props.valueFontPx ?? 10,
    material: materialForTone(host, props.valueTone ?? "muted"),
    maxWidthPx: 52,
    z: textZ,
  })

  const buttonW = props.buttonWidth ?? 24
  const buttonH = props.buttonHeight ?? 22
  drawSliderIconButton(host, x + w - 50, y, buttonW, buttonH, props, props.downLabel ?? `${props.label}: меньше`, uiIcons.minus, value - props.step, bounds.min, bounds.max, zBase + 0.04)
  drawSliderIconButton(host, x + w - 24, y, buttonW, buttonH, props, props.upLabel ?? `${props.label}: больше`, uiIcons.plus, value + props.step, bounds.min, bounds.max, zBase + 0.04)

  const trackY = y + 28
  drawTrack(host, x, trackY, w, ratio, zBase)
  const setFromPointer = (localX: number): void => setSliderValue(host, props, bounds.min + ((localX - x) / Math.max(1, w)) * bounds.range, bounds.min, bounds.max)
  host.hit(x - 4, y + 22, w + 8, 18, () => undefined, {
    key: `${props.key}:track`,
    cursor: "pointer",
    onPointerDown: (localX) => setFromPointer(localX),
    onPointerMove: (localX) => setFromPointer(localX),
  })
  return y + 46
}

function drawTrackLayout(host: UiSurface, x: number, y: number, w: number, props: SliderControlProps): number {
  const bounds = sliderBounds(props)
  const value = normalizedSliderValue(props.value, bounds.min, bounds.max)
  const ratio = sliderRatio(value, bounds.min, bounds.max)
  const zBase = props.zBase ?? 0.16
  const textZ = props.textZ ?? 0.46
  host.drawText(props.label, x, y, {
    fontPx: props.labelFontPx ?? 9,
    material: materialForTone(host, props.labelTone ?? "muted"),
    maxWidthPx: Math.max(1, w - 52),
    z: textZ,
  })
  host.drawText(formatSliderValue(props, value), x + w - 45, y, {
    fontPx: props.valueFontPx ?? 9,
    material: materialForTone(host, props.valueTone ?? "text"),
    maxWidthPx: 45,
    z: textZ,
  })

  const rowY = y + (props.hintLabel === undefined ? 16 : 30)
  if (props.hintLabel !== undefined) {
    host.drawText(props.hintLabel, x, y + 14, {
      fontPx: 8,
      material: host.materials.muted,
      maxWidthPx: Math.max(1, w),
      z: textZ,
    })
  }

  const buttonW = props.buttonWidth ?? 28
  const buttonH = props.buttonHeight ?? 22
  drawSliderIconButton(host, x, rowY, buttonW, buttonH, props, props.downLabel ?? `${props.label}: меньше`, uiIcons.minus, value - props.step, bounds.min, bounds.max, zBase + 0.04)
  drawSliderIconButton(host, x + w - buttonW, rowY, buttonW, buttonH, props, props.upLabel ?? `${props.label}: больше`, uiIcons.plus, value + props.step, bounds.min, bounds.max, zBase + 0.04)

  const trackX = x + buttonW + 10
  const trackW = Math.max(1, w - buttonW * 2 - 20)
  const trackY = rowY + 8
  drawTrack(host, trackX, trackY, trackW, ratio, zBase)
  for (const tick of [0, 0.25, 0.5, 0.75, 1]) {
    host.drawRect(trackX + trackW * tick, trackY + 10, 1, 3, fade(palette.borderDim, 0.68), zBase + 0.02)
  }
  if (props.rangeStartLabel !== undefined || props.rangeEndLabel !== undefined) {
    const labelY = rowY + 27
    if (props.rangeStartLabel !== undefined) {
      host.drawText(props.rangeStartLabel, trackX, labelY, {
        fontPx: 8,
        material: host.materials.muted,
        maxWidthPx: Math.max(1, trackW / 2 - 4),
        z: textZ,
      })
    }
    if (props.rangeEndLabel !== undefined) {
      const endW = Math.max(1, trackW / 2 - 4)
      host.drawText(props.rangeEndLabel, trackX + trackW - endW, labelY, {
        fontPx: 8,
        material: host.materials.muted,
        maxWidthPx: endW,
        z: textZ,
      })
    }
  }
  const setFromPointer = (localX: number): void => setSliderValue(host, props, bounds.min + ((localX - trackX) / trackW) * bounds.range, bounds.min, bounds.max)
  host.hit(trackX - 4, rowY, trackW + 8, 22, () => undefined, {
    key: `${props.key}:track`,
    cursor: "pointer",
    onPointerDown: (localX) => setFromPointer(localX),
    onPointerMove: (localX) => setFromPointer(localX),
  })
  return rowY + (props.rangeStartLabel === undefined && props.rangeEndLabel === undefined ? 22 : 39)
}

function drawSliderIconButton(
  host: UiSurface,
  x: number,
  y: number,
  w: number,
  h: number,
  props: SliderControlProps,
  label: string,
  iconSrc: string,
  value: number,
  min: number,
  max: number,
  zIndex: number,
): void {
  const buttonProps: IconButtonProps = {
    label,
    iconSrc,
    variant: "text",
    action: () => setSliderValue(host, props, value, min, max),
  }
  buttonProps.sx = {zIndex}
  IconButton(host, x, y, w, h, buttonProps)
}

function drawTrack(host: UiSurface, x: number, y: number, w: number, ratio: number, zBase: number): void {
  host.drawRoundedRect(x, y, w, 5, {radius: 3, fill: fade(palette.borderDim, 0.44), border: null, z: zBase})
  host.drawRoundedRect(x, y, Math.max(3, w * ratio), 5, {radius: 3, fill: fade(palette.cyan, 0.64), border: null, z: zBase + 0.02})
  const knobX = x + w * ratio
  host.drawRoundedRect(knobX - 5, y - 4, 10, 13, {
    radius: 5,
    fill: fade(palette.cyan, 0.86),
    border: fade(palette.borderBright, 0.9),
    borderWidth: 1,
    z: zBase + 0.04,
  })
}

function sliderBounds(props: SliderControlProps): {min: number; max: number; range: number} {
  const rawMin = props.min ?? 0
  const min = Math.min(rawMin, props.max)
  const max = Math.max(rawMin, props.max)
  return {min, max, range: sliderRange(min, max)}
}

function normalizedSliderValue(value: number, min: number, max: number): number {
  return clampNumber(Number.isFinite(value) ? value : min, min, max)
}

function sliderRatio(value: number, min: number, max: number): number {
  return clampNumber((value - min) / sliderRange(min, max), 0, 1)
}

function sliderRange(min: number, max: number): number {
  return Math.max(0.000001, max - min)
}

function setSliderValue(host: UiSurface, props: SliderControlProps, value: number, min: number, max: number): void {
  props.onChange(clampNumber(value, min, max))
  host.requestRender()
}

function formatSliderValue(props: SliderControlProps, value: number): string {
  if (props.format !== undefined) return props.format(value)
  return String(Math.round(value))
}

function materialForTone(host: UiSurface, tone: SliderControlTone) {
  if (tone === "cyan") return host.materials.cyan
  if (tone === "muted") return host.materials.muted
  return host.materials.text
}

function fade(color: Color, opacity: number): Color {
  return new Color(color.r, color.g, color.b, Math.max(0, Math.min(1, color.a * opacity)))
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
