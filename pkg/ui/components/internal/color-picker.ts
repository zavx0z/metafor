import {Color} from "@metafor/engine"
import {
  blenderRgba8ToColor,
  blenderTheme,
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
  const state = surface.hitState(x, y, width, height, key)
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
  drawPickerMarker(surface, x, y, width, height, props.mode, value, disabled, state.pressed)
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
  pressed: boolean,
): void {
  const opacity = disabled ? 0.38 : 1
  if (mode === "wheel") {
    const markerSize = (pressed ? 20 : 12) + 1
    const radius = Math.min(width, height) / 2
    const angle = value.h * Math.PI * 2
    const cx = x + width / 2 + Math.cos(angle) * value.s * radius
    const cy = y + height / 2 + Math.sin(angle) * value.s * radius
    const fill = colorPickerRgb(value)
    const darkOutline = new Color(0, 0, 0, value.v / 2)
    const lightOutline = new Color(1, 1, 1, Math.min(1 - value.v + 0.2, 0.8))
    surface.drawRoundedRect(cx - markerSize / 2, cy - markerSize / 2, markerSize, markerSize, {
      radius: markerSize / 2,
      fill,
      border: darkOutline,
      borderWidth: 1,
      opacity,
      z: Z.TEXT + 0.22,
    })
    const innerSize = Math.max(0, markerSize - 1)
    surface.drawRoundedRect(cx - innerSize / 2, cy - innerSize / 2, innerSize, innerSize, {
      radius: innerSize / 2,
      fill,
      border: lightOutline,
      borderWidth: 1,
      opacity,
      z: Z.TEXT + 0.23,
    })
    return
  }
  const level = mode === "value" ? value.v : value.a
  const markerY = clamp(y + (1 - level) * height, y + 2, y + height - 2)
  const activeInset = pressed ? 1 : 0
  const markerHeight = Math.max(width * 0.7, 2) + activeInset * 2
  const markerX = x - activeInset
  const markerWidth = width + activeInset * 2
  const markerTop = markerY - markerHeight / 2
  surface.drawRoundedRect(markerX, markerTop, markerWidth, markerHeight, {
    radius: 0,
    fill: new Color(0, 0, 0, 1),
    border: null,
    borderWidth: 0,
    opacity,
    z: Z.TEXT + 0.22,
  })
  surface.drawRoundedRect(markerX, markerTop + 1, markerWidth, Math.max(0, markerHeight - 2), {
    radius: 0,
    fill: new Color(level, level, level, 1),
    border: new Color(1, 1, 1, 1),
    borderWidth: 1,
    opacity,
    z: Z.TEXT + 0.23,
  })
}

function colorPickerRgb(value: ColorPickerValue): Color {
  const hue = wrapUnit(value.h) * 6
  const chroma = value.v * value.s
  const x = chroma * (1 - Math.abs(hue % 2 - 1))
  const offset = value.v - chroma
  const [r, g, b] = hue < 1
    ? [chroma, x, 0]
    : hue < 2
      ? [x, chroma, 0]
      : hue < 3
        ? [0, chroma, x]
        : hue < 4
          ? [0, x, chroma]
          : hue < 5
            ? [x, 0, chroma]
            : [chroma, 0, x]
  return new Color(r + offset, g + offset, b + offset, 1)
}

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback
}

function clampUnit(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function wrapUnit(value: number): number {
  if (!Number.isFinite(value)) return 0
  return ((value % 1) + 1) % 1
}
