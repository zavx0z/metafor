import {Color} from "@metafor/engine"
import {Z, flexColumn, flexRow, palette, uiIcons, type UiSurface} from "@ui/elements"
import {IconButton, type IconButtonProps} from "./Button.ts"

export type SliderControlLayout = "header" | "track" | "inline"

export type SliderControlTone = "text" | "muted" | "cyan"
export type SliderControlTrackTone = "cyan" | "warm"

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
  trackTone?: SliderControlTrackTone
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
  if (layout === "inline") return drawInlineLayout(host, x, y, w, props)
  if (layout === "track") return drawTrackLayout(host, x, y, w, props)
  return drawHeaderLayout(host, x, y, w, props)
}

function drawInlineLayout(host: UiSurface, x: number, y: number, w: number, props: SliderControlProps): number {
  const bounds = sliderBounds(props)
  const value = normalizedSliderValue(props.value, bounds.min, bounds.max)
  const ratio = sliderRatio(value, bounds.min, bounds.max)
  const height = props.buttonHeight ?? 22
  const zBase = props.zBase ?? Z.ELEMENT
  const textZ = props.textZ ?? Z.TEXT
  host.drawRoundedRect(x, y, w, height, {
    radius: Math.max(2, height * 0.16),
    fill: new Color(0.235, 0.235, 0.235, 1),
    border: new Color(0.11, 0.11, 0.11, 1),
    borderWidth: 1,
    z: zBase,
  })
  host.drawRoundedRect(x + 1, y + 1, Math.max(0, (w - 2) * ratio), Math.max(1, height - 2), {
    radius: Math.max(1, height * 0.12),
    fill: new Color(0.25, 0.47, 0.76, 0.92),
    border: null,
    z: zBase + 0.01,
  })
  flexRow({
    x,
    y,
    w,
    h: height,
    paddingX: Math.max(5, height * 0.28),
    gap: 6,
    alignItems: "center",
    items: [
      {width: "grow", height, draw: (slotX, slotY, slotW) => host.drawText(props.label, slotX, slotY + (height - (props.labelFontPx ?? 11)) / 2, {
        fontPx: props.labelFontPx ?? 11,
        material: materialForTone(host, props.labelTone ?? "text"),
        maxWidthPx: slotW,
        z: textZ,
      })},
      {width: Math.max(40, height * 2.4), height, draw: (slotX, slotY, slotW) => host.drawText(formatSliderValue(props, value), slotX, slotY + (height - (props.valueFontPx ?? 11)) / 2, {
        fontPx: props.valueFontPx ?? 11,
        material: materialForTone(host, props.valueTone ?? "text"),
        maxWidthPx: slotW,
        z: textZ,
      })},
    ],
  })
  const setFromPointer = (localX: number): void => setSliderValue(host, props, bounds.min + ((localX - x) / Math.max(1, w)) * bounds.range, bounds.min, bounds.max)
  host.hit(x, y, w, height, () => undefined, {
    key: `${props.key}:inline`,
    cursor: "pointer",
    onPointerDown: (localX) => setFromPointer(localX),
    onPointerMove: (localX) => setFromPointer(localX),
  })
  return y + height
}

function drawHeaderLayout(host: UiSurface, x: number, y: number, w: number, props: SliderControlProps): number {
  const bounds = sliderBounds(props)
  const value = normalizedSliderValue(props.value, bounds.min, bounds.max)
  const ratio = sliderRatio(value, bounds.min, bounds.max)
  const zBase = props.zBase ?? Z.ELEMENT
  const textZ = props.textZ ?? Z.TEXT
  const buttonW = props.buttonWidth ?? 24
  const buttonH = props.buttonHeight ?? 22
  flexColumn({
    x,
    y,
    w,
    h: 46,
    gap: 6,
    items: [
      {height: 22, draw: (rowX, rowY, rowW, rowH) => flexRow({
        x: rowX,
        y: rowY,
        w: rowW,
        h: rowH,
        gap: 4,
        alignItems: "center",
        items: [
          {width: "grow", height: rowH, draw: (slotX, slotY, slotW) => host.drawText(props.label, slotX, slotY + 3, {
            fontPx: props.labelFontPx ?? 10,
            material: materialForTone(host, props.labelTone ?? "text"),
            maxWidthPx: Math.max(1, slotW),
            z: textZ,
          })},
          {width: 52, height: rowH, draw: (slotX, slotY, slotW) => host.drawText(formatSliderValue(props, value), slotX, slotY + 3, {
            fontPx: props.valueFontPx ?? 10,
            material: materialForTone(host, props.valueTone ?? "muted"),
            maxWidthPx: slotW,
            z: textZ,
          })},
          {width: buttonW, height: buttonH, draw: (slotX, slotY, slotW, slotH) => drawSliderIconButton(host, slotX, slotY, slotW, slotH, props, props.downLabel ?? `${props.label}: меньше`, uiIcons.minus, value - props.step, bounds.min, bounds.max, zBase + 0.04)},
          {width: buttonW, height: buttonH, draw: (slotX, slotY, slotW, slotH) => drawSliderIconButton(host, slotX, slotY, slotW, slotH, props, props.upLabel ?? `${props.label}: больше`, uiIcons.plus, value + props.step, bounds.min, bounds.max, zBase + 0.04)},
        ],
      })},
      {height: 18, draw: (trackX, trackY, trackW, trackH) => drawInteractiveTrack(host, trackX, trackY, trackW, trackH, ratio, props, bounds, zBase)},
    ],
  })
  return y + 46
}

function drawTrackLayout(host: UiSurface, x: number, y: number, w: number, props: SliderControlProps): number {
  const bounds = sliderBounds(props)
  const value = normalizedSliderValue(props.value, bounds.min, bounds.max)
  const ratio = sliderRatio(value, bounds.min, bounds.max)
  const zBase = props.zBase ?? 0.16
  const textZ = props.textZ ?? 0.46
  const buttonW = props.buttonWidth ?? 28
  const buttonH = props.buttonHeight ?? 22
  const hasHint = props.hintLabel !== undefined
  const hasRange = props.rangeStartLabel !== undefined || props.rangeEndLabel !== undefined
  const totalHeight = 14 + (hasHint ? 14 : 0) + 4 + 22 + (hasRange ? 17 : 0)
  flexColumn({
    x,
    y,
    w,
    h: totalHeight,
    gap: 0,
    items: [
      {height: 14, draw: (rowX, rowY, rowW, rowH) => flexRow({
        x: rowX,
        y: rowY,
        w: rowW,
        h: rowH,
        gap: 6,
        items: [
          {width: "grow", height: rowH, draw: (slotX, slotY, slotW) => host.drawText(props.label, slotX, slotY, {
            fontPx: props.labelFontPx ?? 9,
            material: materialForTone(host, props.labelTone ?? "muted"),
            maxWidthPx: Math.max(1, slotW),
            z: textZ,
          })},
          {width: 45, height: rowH, draw: (slotX, slotY, slotW) => host.drawText(formatSliderValue(props, value), slotX, slotY, {
            fontPx: props.valueFontPx ?? 9,
            material: materialForTone(host, props.valueTone ?? "text"),
            maxWidthPx: slotW,
            z: textZ,
          })},
        ],
      })},
      hasHint && {height: 14, draw: (slotX, slotY, slotW) => host.drawText(props.hintLabel!, slotX, slotY, {
        fontPx: 8,
        material: host.materials.muted,
        maxWidthPx: slotW,
        z: textZ,
      })},
      {height: 4, draw: () => {}},
      {height: 22, draw: (rowX, rowY, rowW, rowH) => flexRow({
        x: rowX,
        y: rowY,
        w: rowW,
        h: rowH,
        gap: 10,
        alignItems: "center",
        items: [
          {width: buttonW, height: buttonH, draw: (slotX, slotY, slotW, slotH) => drawSliderIconButton(host, slotX, slotY, slotW, slotH, props, props.downLabel ?? `${props.label}: меньше`, uiIcons.minus, value - props.step, bounds.min, bounds.max, zBase + 0.04)},
          {width: "grow", height: rowH, draw: (trackX, trackY, trackW, trackH) => drawInteractiveTrack(host, trackX, trackY, trackW, trackH, ratio, props, bounds, zBase, true)},
          {width: buttonW, height: buttonH, draw: (slotX, slotY, slotW, slotH) => drawSliderIconButton(host, slotX, slotY, slotW, slotH, props, props.upLabel ?? `${props.label}: больше`, uiIcons.plus, value + props.step, bounds.min, bounds.max, zBase + 0.04)},
        ],
      })},
      hasRange && {height: 17, draw: (rowX, rowY, rowW, rowH) => flexRow({
        x: rowX,
        y: rowY,
        w: rowW,
        h: rowH,
        gap: 8,
        items: [
          {width: "grow", height: rowH, draw: (slotX, slotY, slotW) => props.rangeStartLabel === undefined ? undefined : host.drawText(props.rangeStartLabel, slotX, slotY, {fontPx: 8, material: host.materials.muted, maxWidthPx: slotW, z: textZ})},
          {width: "grow", height: rowH, draw: (slotX, slotY, slotW) => props.rangeEndLabel === undefined ? undefined : host.drawText(props.rangeEndLabel, slotX, slotY, {fontPx: 8, material: host.materials.muted, maxWidthPx: slotW, z: textZ})},
        ],
      })},
    ],
  })
  return y + totalHeight
}

function drawInteractiveTrack(
  host: UiSurface,
  x: number,
  y: number,
  w: number,
  h: number,
  ratio: number,
  props: SliderControlProps,
  bounds: {min: number; max: number; range: number},
  zBase: number,
  ticks = false,
): void {
  const trackY = y + (h - 5) / 2
  drawTrack(host, x, trackY, w, ratio, zBase, props.trackTone ?? "cyan")
  if (ticks) for (const tick of [0, 0.25, 0.5, 0.75, 1]) {
    host.drawRect(x + w * tick, trackY + 8, 1, 3, fade(palette.borderDim, 0.68), zBase + 0.02)
  }
  const setFromPointer = (localX: number): void => setSliderValue(host, props, bounds.min + ((localX - x) / Math.max(1, w)) * bounds.range, bounds.min, bounds.max)
  host.hit(x - 4, y, w + 8, h, () => undefined, {
    key: `${props.key}:track`,
    cursor: "pointer",
    onPointerDown: (localX) => setFromPointer(localX),
    onPointerMove: (localX) => setFromPointer(localX),
  })
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

function drawTrack(host: UiSurface, x: number, y: number, w: number, ratio: number, zBase: number, tone: SliderControlTrackTone): void {
  const active = tone === "warm" ? palette.orange : palette.cyan
  const knob = tone === "warm" ? new Color(1, 0.36, 0.68, 1) : palette.cyan
  host.drawRoundedRect(x, y, w, 5, {radius: 3, fill: fade(palette.borderDim, 0.44), border: null, z: zBase})
  host.drawRoundedRect(x, y, Math.max(3, w * ratio), 5, {radius: 3, fill: fade(active, 0.64), border: null, z: zBase + 0.02})
  const knobX = x + w * ratio
  host.drawRoundedRect(knobX - 5, y - 4, 10, 13, {
    radius: 5,
    fill: fade(knob, 0.86),
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
