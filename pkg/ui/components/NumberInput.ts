import {
  blenderRgba8ToColor,
  boxPadding,
  flexRow,
  px,
  resolveWidgetColors,
  uiShapeMetrics,
  type InputAppearance,
  type InputNumericGesture,
  type StyleProps,
  type UiSurface,
} from "@ui/elements"
import {TextField} from "./TextField.ts"
import {Typography} from "./Typography.ts"
import {numberInputLabel, type NumberInputInternalProps} from "./number-input-internal.ts"

export type NumberInputKind = "float" | "integer"
export type NumberInputDensity = "regular" | "compact"

export type NumberInputValueOptions = {
  numberKind?: NumberInputKind
  min?: number
  max?: number
  softMin?: number
  softMax?: number
  step?: number
  unit?: string
}

export type NumberInputFormatOptions = NumberInputValueOptions & {
  precision?: number
}

export type NumberInputProps = NumberInputFormatOptions & {
  key?: string
  value: number
  disabled?: boolean
  readOnly?: boolean
  density?: NumberInputDensity
  fontPx?: number
  appearance?: InputAppearance
  sx?: StyleProps
  onChange?(value: number): void
}

export type NumberInputSoftRange = Readonly<{min: number; max: number}>

type NumberPointerState = {
  origin: number
  current: number
  rawCurrent: number
  changed: boolean
  dragRange: NumberInputSoftRange
}

const numberPointerStates = new WeakMap<UiSurface, Map<string, NumberPointerState>>()

// Blender 4.5.5 `interface_handlers.cc`: `ui_numedit_but_NUM` uses a 500px
// float map, adaptive 1000px soft-range cap, integer divisors and Shift / 10.

/** Draws one controlled scalar number editor without owning consumer state. */
export function NumberInput(
  host: UiSurface,
  x: number,
  y: number,
  width: number,
  height: number,
  props: NumberInputProps,
): void {
  const disabled = props.disabled === true || props.readOnly === true
  const key = props.key ?? `number-input:${x}:${y}:${width}:${height}`
  const internalLabel = (props as NumberInputProps & NumberInputInternalProps)[numberInputLabel]
  const labelPlan = internalLabel === undefined
    ? null
    : planNumberInputLabel(host, width, height, internalLabel.text, props.fontPx, props.sx)
  const textFieldProps: Parameters<typeof TextField>[5] = {
    key,
    value: formatNumberInputValue(props.value, props),
    disabled,
    submitOnEnter: true,
    type: "number",
  }
  if (props.fontPx !== undefined) textFieldProps.fontPx = props.fontPx
  if (props.appearance !== undefined) textFieldProps.appearance = props.appearance
  if (labelPlan !== null) textFieldProps.sx = labelPlan.inputStyle
  else if (props.sx !== undefined) textFieldProps.sx = props.sx
  if (!disabled && props.onChange !== undefined) {
    textFieldProps.onSubmit = (text) => {
      const value = parseNumberInputValue(text, props)
      if (value !== null) props.onChange!(value)
    }
  }
  if (!disabled) {
    textFieldProps.onNumericGesture = (gesture) => handleNumberPointerGesture(host, key, props, gesture)
  }
  TextField(host, x, y, width, height, textFieldProps)
  if (labelPlan !== null && labelPlan.width > 0) {
    const hit = host.hitState(x, y, width, height, key)
    const colors = resolveWidgetColors("number", {
      hovered: hit.hovered,
      pressed: hit.pressed,
      disabled,
    })
    flexRow({
      x: x + labelPlan.x,
      y,
      w: labelPlan.width,
      h: height,
      items: [{
        width: "grow",
        height,
        draw: (slotX, slotY, slotW, slotH) => Typography(host, slotX, slotY, slotW, slotH, {
          children: labelPlan.text,
          fontPx: labelPlan.fontPx,
          color: blenderRgba8ToColor(colors.text),
        }),
      }],
    })
  }
}

type NumberInputLabelPlan = Readonly<{
  text: string
  x: number
  width: number
  fontPx: number
  inputStyle: StyleProps
}>

function planNumberInputLabel(
  host: UiSurface,
  width: number,
  height: number,
  text: string,
  fontPx = uiShapeMetrics.compactFontPx,
  sx: StyleProps = {},
): NumberInputLabelPlan {
  const visibleHeight = Math.min(Math.max(0, height), Math.max(0, px(sx.height, uiShapeMetrics.controlHeight)))
  const handleWidth = Math.min(Math.max(0, width) / 3, visibleHeight * 0.7)
  const gap = uiShapeMetrics.tightGap
  const labelX = handleWidth + gap
  const rightInset = handleWidth + gap
  const availableLabelWidth = Math.max(
    0,
    width - labelX - rightInset - gap - uiShapeMetrics.iconActionSlot,
  )
  const labelWidth = Math.min(availableLabelWidth, host.measureText(text, fontPx))
  const padding = boxPadding(sx)
  return Object.freeze({
    text,
    x: labelX,
    width: labelWidth,
    fontPx,
    inputStyle: Object.freeze({
      ...sx,
      paddingLeft: Math.max(padding.left, labelX + labelWidth + gap),
      paddingRight: Math.max(padding.right, rightInset),
    }),
  })
}

/** Resolves finite ordered pointer-only bounds within the hard value range. */
export function resolveNumberInputSoftRange(
  value: number,
  options: NumberInputFormatOptions = {},
): NumberInputSoftRange {
  const hardMin = finiteBound(options.min, Number.NEGATIVE_INFINITY)
  const hardMax = Math.max(hardMin, finiteBound(options.max, Number.POSITIVE_INFINITY))
  const center = normalizeNumberInputValue(value, options)
  const step = numberPointerStep(options)
  const adaptiveSpan = numberPointerAdaptiveSpan(options)
  let minimum = Number.isFinite(options.softMin)
    ? options.softMin!
    : Number.isFinite(hardMin)
      ? hardMin
      : center - adaptiveSpan / 2
  let maximum = Number.isFinite(options.softMax)
    ? options.softMax!
    : Number.isFinite(hardMax)
      ? hardMax
      : center + adaptiveSpan / 2
  if (minimum > maximum) [minimum, maximum] = [maximum, minimum]
  minimum = Math.max(hardMin, minimum)
  maximum = Math.min(hardMax, maximum)
  if (minimum > maximum) minimum = maximum
  if (minimum === maximum) {
    if (maximum + step <= hardMax) maximum += step
    else if (minimum - step >= hardMin) minimum -= step
  }
  return Object.freeze({min: minimum, max: maximum})
}

/** Applies one source-ordered horizontal scrub increment and hard-normalizes the result. */
export function scrubNumberInputValue(
  value: number,
  deltaX: number,
  distanceX: number,
  options: NumberInputFormatOptions = {},
  shift = false,
  ctrl = false,
): number {
  const range = resolveNumberInputDragRange(value, options)
  const raw = scrubNumberInputRawValue(value, deltaX, distanceX, range, options, shift)
  const candidate = ctrl ? snapLinearNumberInputValue(raw, range, shift) : raw
  return normalizeNumberInputValue(candidate, {...options, step: numberPointerStep(options)})
}

function scrubNumberInputRawValue(
  value: number,
  deltaX: number,
  distanceX: number,
  range: NumberInputSoftRange,
  options: NumberInputFormatOptions,
  shift: boolean,
): number {
  const softSpan = range.max - range.min
  if (softSpan <= 0 || !Number.isFinite(deltaX) || !Number.isFinite(distanceX)) {
    return Math.min(range.max, Math.max(range.min, value))
  }
  let divisor = 500
  let scale = 1
  if (options.numberKind === "integer") {
    if (softSpan > 600) divisor = softSpan ** 0.75
    else if (softSpan < 25) divisor = 50
    else if (softSpan < 100) divisor = 100
    if (softSpan > 129) scale = Math.abs(distanceX) / 250
    scale = Math.max(scale, 0.5)
  }
  else if (softSpan > 11) {
    scale = Math.abs(distanceX) / 500
  }
  if (shift) scale /= 10
  return Math.min(range.max, Math.max(range.min, value + (deltaX / divisor) * scale * softSpan))
}

/** Applies Blender's linear float snap law for the active frozen soft range. */
export function snapLinearNumberInputValue(
  value: number,
  range: NumberInputSoftRange,
  small = false,
): number {
  if (!Number.isFinite(value) || value === range.min || value === range.max) return value
  const span = range.max - range.min
  if (!Number.isFinite(span) || span <= 0) return value
  const baseIncrement = span < 2.1 ? 0.1 : span < 21 ? 1 : 10
  const increment = baseIncrement * (small ? 0.1 : 1)
  const snapped = roundHalfAwayFromZero(value / increment) * increment
  return rounded(Math.min(range.max, Math.max(range.min, snapped)))
}

/** Applies one side-handle step using only the hard value contract. */
export function stepNumberInputValue(
  value: number,
  direction: -1 | 1,
  options: NumberInputFormatOptions = {},
): number {
  const range = resolveNumberInputSoftRange(value, options)
  const candidate = normalizeNumberInputValue(value + numberPointerStep(options) * direction, {
    ...options,
    step: numberPointerStep(options),
  })
  return direction < 0 ? Math.max(range.min, candidate) : Math.min(range.max, candidate)
}

/** Normalizes a scalar value against the public integer/float and hard-range contract. */
export function normalizeNumberInputValue(
  value: number,
  options: NumberInputValueOptions = {},
): number {
  const finite = Number.isFinite(value) ? value : finiteBound(options.min, 0)
  const minimum = finiteBound(options.min, Number.NEGATIVE_INFINITY)
  const maximum = Math.max(minimum, finiteBound(options.max, Number.POSITIVE_INFINITY))
  const clamped = Math.min(maximum, Math.max(minimum, finite))
  const step = Number.isFinite(options.step) && (options.step ?? 0) > 0 ? options.step! : undefined
  const stepBase = Number.isFinite(minimum) ? minimum : 0
  const stepped = step === undefined
    ? clamped
    : stepBase + Math.round((clamped - stepBase) / step) * step
  const normalized = Math.min(maximum, Math.max(minimum, stepped))
  return options.numberKind === "integer" ? Math.round(normalized) : rounded(normalized)
}

/** Parses optional trailing units and returns a normalized finite value. */
export function parseNumberInputValue(
  text: string,
  options: NumberInputValueOptions = {},
): number | null {
  const trimmed = text.trim()
  if (trimmed.length === 0) return null
  const unit = options.unit?.trim() ?? ""
  const numericText = unit.length > 0 && trimmed.endsWith(unit)
    ? trimmed.slice(0, -unit.length).trim()
    : trimmed
  if (numericText.length === 0) return null
  const value = Number(numericText)
  return Number.isFinite(value) ? normalizeNumberInputValue(value, options) : null
}

/** Formats the normalized controlled value with its optional unit suffix. */
export function formatNumberInputValue(
  value: number,
  options: NumberInputFormatOptions = {},
): string {
  const normalized = normalizeNumberInputValue(value, options)
  const precision = normalizedPrecision(options.precision)
  const formatted = precision === undefined ? String(normalized) : normalized.toFixed(precision)
  return `${formatted}${options.unit ?? ""}`
}

function handleNumberPointerGesture(
  host: UiSurface,
  key: string,
  props: NumberInputProps,
  gesture: InputNumericGesture,
): void {
  const states = numberPointerStateFor(host)
  if (gesture.kind === "start") {
    const value = normalizeNumberInputValue(props.value, props)
    states.set(key, {
      origin: value,
      current: value,
      rawCurrent: value,
      changed: false,
      dragRange: resolveNumberInputDragRange(value, props),
    })
    return
  }
  if (gesture.kind === "text") return
  const state = states.get(key)
  if (gesture.kind === "cancel") {
    if (state?.changed === true && state.current !== state.origin) props.onChange?.(state.origin)
    states.delete(key)
    return
  }
  if (gesture.kind === "end") {
    states.delete(key)
    return
  }
  const current = state ?? {
    origin: normalizeNumberInputValue(props.value, props),
    current: normalizeNumberInputValue(props.value, props),
    rawCurrent: normalizeNumberInputValue(props.value, props),
    changed: false,
    dragRange: resolveNumberInputDragRange(props.value, props),
  }
  let next: number
  if (gesture.kind === "step") {
    next = stepNumberInputValue(current.current, gesture.direction, props)
    current.rawCurrent = next
  } else {
    const rawNext = scrubNumberInputRawValue(
      current.rawCurrent,
      gesture.deltaX,
      gesture.distanceX,
      current.dragRange,
      props,
      gesture.shiftKey,
    )
    current.rawCurrent = rawNext
    const projected = gesture.ctrlKey
      ? snapLinearNumberInputValue(rawNext, current.dragRange, gesture.shiftKey)
      : rawNext
    next = normalizeNumberInputValue(projected, {...props, step: numberPointerStep(props)})
  }
  if (next === current.current) {
    states.set(key, current)
    return
  }
  current.current = next
  current.changed = true
  states.set(key, current)
  props.onChange?.(next)
}

function resolveNumberInputDragRange(
  value: number,
  options: NumberInputFormatOptions,
): NumberInputSoftRange {
  const range = resolveNumberInputSoftRange(value, options)
  const span = range.max - range.min
  const maximumSpan = numberPointerAdaptiveSpan(options)
  if (span <= maximumSpan) return range
  const center = normalizeNumberInputValue(value, options)
  let minimum = center - maximumSpan / 2
  let maximum = center + maximumSpan / 2
  if (minimum < range.min) {
    minimum = range.min
    maximum = minimum + maximumSpan
  }
  else if (maximum > range.max) {
    maximum = range.max
    minimum = maximum - maximumSpan
  }
  return Object.freeze({min: minimum, max: maximum})
}

function numberPointerStateFor(host: UiSurface): Map<string, NumberPointerState> {
  let states = numberPointerStates.get(host)
  if (states === undefined) {
    states = new Map()
    numberPointerStates.set(host, states)
  }
  return states
}

function numberPointerStep(options: NumberInputFormatOptions): number {
  if (Number.isFinite(options.step) && options.step! > 0) return options.step!
  if (options.numberKind === "integer") return 1
  const precision = normalizedPrecision(options.precision) ?? 3
  return 10 ** -precision
}

function numberPointerAdaptiveSpan(options: NumberInputFormatOptions): number {
  return options.numberKind === "integer"
    ? 2000
    : 20_000 * Math.min(numberPointerStep(options), 0.1)
}

function normalizedPrecision(value: number | undefined): number | undefined {
  if (!Number.isFinite(value)) return undefined
  return Math.min(100, Math.max(0, Math.trunc(value!)))
}

function finiteBound(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? value! : fallback
}

function rounded(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000
}

function roundHalfAwayFromZero(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value)
}
