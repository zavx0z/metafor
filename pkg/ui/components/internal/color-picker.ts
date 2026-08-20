import {
  blenderRgba8ToColor,
  blenderTheme,
  palette,
  type ColorPickerPlaneDrawOptions,
  type HitOptions,
  type UiSurface,
  Z,
} from "@ui/elements"

export type ColorPickerValue = Readonly<{
  h: number
  s: number
  v: number
  a: number
}>

export type ColorPickerPlaneProps = Readonly<{
  key?: string
  mode: ColorPickerPlaneDrawOptions["mode"]
  value: ColorPickerValue
  disabled?: boolean
  onChange?(value: ColorPickerValue): void
}>

/** Draws one Component-internal analytical picker plane with exact pointer conversion. */
export function colorPickerPlane(
  surface: UiSurface,
  x: number,
  y: number,
  width: number,
  height: number,
  props: ColorPickerPlaneProps,
): void {
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return
  const value = normalizeColorPickerValue(props.value)
  const disabled = props.disabled === true
  const key = props.key ?? `color-picker:${props.mode}:${x}:${y}:${width}:${height}`
  surface.registerRenderKey(key)
  surface.drawColorPickerPlane(x, y, width, height, {
    mode: props.mode,
    hue: value.h,
    saturation: value.s,
    value: value.v,
    alpha: value.a,
    opacity: disabled ? 0.42 : 1,
    checkerPrimary: blenderRgba8ToColor(blenderTheme.material.checkerPrimary),
    checkerSecondary: blenderRgba8ToColor(blenderTheme.material.checkerSecondary),
    checkerSize: blenderTheme.material.checkerSize,
    z: Z.ELEMENT + 0.22,
  })
  drawPickerMarker(surface, x, y, width, height, props.mode, value, disabled)
  if (disabled || props.onChange === undefined) return

  const publishAt = (localX: number, localY: number): void => {
    props.onChange?.(colorPickerValueAt(props.mode, x, y, width, height, value, localX, localY))
    surface.requestKeyedRender(key)
  }
  const options: HitOptions = {
    key,
    cursor: "crosshair",
    activeCursor: "crosshair",
    onPointerDown: (localX, localY) => publishAt(localX, localY),
    onPointerMove: (localX, localY) => publishAt(localX, localY),
  }
  surface.hit(x, y, width, height, () => {}, options)
}

/** Converts one pointer location into a new immutable HSVA value. */
export function colorPickerValueAt(
  mode: ColorPickerPlaneProps["mode"],
  x: number,
  y: number,
  width: number,
  height: number,
  current: ColorPickerValue,
  pointerX: number,
  pointerY: number,
): ColorPickerValue {
  const value = normalizeColorPickerValue(current)
  if (mode === "wheel") {
    const radius = Math.max(Number.EPSILON, Math.min(width, height) / 2)
    const dx = (finite(pointerX, x + width / 2) - (x + width / 2)) / radius
    const dy = (finite(pointerY, y + height / 2) - (y + height / 2)) / radius
    const saturation = Math.min(1, Math.hypot(dx, dy))
    const hue = saturation <= Number.EPSILON ? value.h : wrapUnit(Math.atan2(dy, dx) / (Math.PI * 2))
    return Object.freeze({h: hue, s: saturation, v: value.v, a: value.a})
  }
  const level = clampUnit(1 - (finite(pointerY, y + height) - y) / Math.max(Number.EPSILON, height))
  return mode === "value"
    ? Object.freeze({h: value.h, s: value.s, v: level, a: value.a})
    : Object.freeze({h: value.h, s: value.s, v: value.v, a: level})
}

export function normalizeColorPickerValue(value: Partial<ColorPickerValue>): ColorPickerValue {
  return Object.freeze({
    h: wrapUnit(value.h ?? 0),
    s: clampUnit(value.s ?? 0),
    v: clampUnit(value.v ?? 0),
    a: clampUnit(value.a ?? 1),
  })
}

/** Draws the current color over the exact Blender checker without pointer semantics. */
export function colorPickerSwatch(
  surface: UiSurface,
  x: number,
  y: number,
  width: number,
  height: number,
  value: ColorPickerValue,
): void {
  const normalized = normalizeColorPickerValue(value)
  surface.drawColorPickerPlane(x, y, width, height, {
    mode: "swatch",
    hue: normalized.h,
    saturation: normalized.s,
    value: normalized.v,
    alpha: normalized.a,
    checkerPrimary: blenderRgba8ToColor(blenderTheme.material.checkerPrimary),
    checkerSecondary: blenderRgba8ToColor(blenderTheme.material.checkerSecondary),
    checkerSize: blenderTheme.material.checkerSize,
    z: Z.ELEMENT + 0.22,
  })
}

function drawPickerMarker(
  surface: UiSurface,
  x: number,
  y: number,
  width: number,
  height: number,
  mode: ColorPickerPlaneProps["mode"],
  value: ColorPickerValue,
  disabled: boolean,
): void {
  const opacity = disabled ? 0.38 : 0.92
  if (mode === "wheel") {
    const markerSize = 7
    const radius = Math.min(width, height) / 2
    const angle = value.h * Math.PI * 2
    const cx = x + width / 2 + Math.cos(angle) * value.s * radius
    const cy = y + height / 2 + Math.sin(angle) * value.s * radius
    surface.drawRoundedRect(cx - markerSize / 2, cy - markerSize / 2, markerSize, markerSize, {
      radius: markerSize / 2,
      fill: palette.borderDim,
      border: palette.text,
      borderWidth: 1,
      opacity,
      z: Z.TEXT + 0.22,
    })
    return
  }
  const level = mode === "value" ? value.v : value.a
  const markerHeight = 2
  const markerY = y + (1 - level) * height
  surface.drawRoundedRect(x - 1, markerY - markerHeight / 2, width + 2, markerHeight, {
    radius: 1,
    fill: palette.text,
    border: palette.bgInput,
    borderWidth: 1,
    opacity,
    z: Z.TEXT + 0.22,
  })
}

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback
}

function clampUnit(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0
}

function wrapUnit(value: number): number {
  if (!Number.isFinite(value)) return 0
  return ((value % 1) + 1) % 1
}
