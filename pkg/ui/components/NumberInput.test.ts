import {describe, expect, test} from "bun:test"
import {
  createInputEditState,
  focusInput,
  handleActiveInputKey,
  blenderRgba8ToColor,
  resolveWidgetColors,
  surfaceHasActiveInput,
  uiShapeMetrics,
  type UiSurface,
  UiSurface as BaseUiSurface,
} from "@ui/elements"
import {Field, type NumberFieldDefinition} from "./Field.ts"
import {
  NumberInput,
  formatNumberInputValue,
  normalizeNumberInputValue,
  parseNumberInputValue,
  resolveNumberInputSoftRange,
  snapLinearNumberInputValue,
  scrubNumberInputValue,
  stepNumberInputValue,
  type NumberInputProps,
} from "./NumberInput.ts"

type RoundedRectCall = Parameters<UiSurface["drawRoundedRect"]>
type RectCall = Parameters<UiSurface["drawRect"]>
type TextCall = Parameters<UiSurface["drawText"]>
type HitCall = Parameters<UiSurface["hit"]>

class RecordingSurface extends BaseUiSurface {
  readonly roundedRects: RoundedRectCall[] = []
  readonly rects: RectCall[] = []
  readonly texts: TextCall[] = []
  readonly hits: HitCall[] = []

  override drawRoundedRect(...args: RoundedRectCall): void {
    this.roundedRects.push(args)
  }

  override drawRect(...args: RectCall): void {
    this.rects.push(args)
  }

  override drawText(...args: TextCall): number {
    this.texts.push(args)
    return 0
  }

  override hit(...args: HitCall): void {
    this.hits.push(args)
  }

  override pushClip(): void {}

  override popClip(): void {}

  protected render(): void {}
}

const enter = (): KeyboardEvent => ({
  key: "Enter",
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  preventDefault() {},
} as KeyboardEvent)

const escape = (): KeyboardEvent => ({
  key: "Escape",
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  preventDefault() {},
} as KeyboardEvent)

const pointer = (opts: Partial<MouseEvent> = {}): MouseEvent => ({
  button: opts.button ?? 0,
  ctrlKey: opts.ctrlKey === true,
  shiftKey: opts.shiftKey === true,
  preventDefault() {},
} as MouseEvent)

const submit = (surface: UiSurface, key: string, value: string): void => {
  focusInput(surface, key, createInputEditState(value))
  expect(handleActiveInputKey(surface, enter())).toBeTrue()
}

const numberProps = (
  onChange: (value: number) => void,
  extra: Partial<NumberInputProps> = {},
): NumberInputProps => ({
  key: "number",
  value: 1,
  min: 0,
  max: 10,
  step: 0.25,
  unit: "kg",
  onChange,
  ...extra,
})

describe("public NumberInput", () => {
  test("normalizes finite float, integer, range and step values", () => {
    expect(normalizeNumberInputValue(3.1415927)).toBe(3.141593)
    expect(normalizeNumberInputValue(7.8, {numberKind: "integer"})).toBe(8)
    expect(normalizeNumberInputValue(13, {min: 0, max: 10})).toBe(10)
    expect(normalizeNumberInputValue(0.74, {step: 0.25})).toBe(0.75)
    expect(normalizeNumberInputValue(0.74, {min: 0, max: 1, step: 0.25})).toBe(0.75)
    expect(normalizeNumberInputValue(Number.NaN, {min: 2})).toBe(2)
  })

  test("keeps soft bounds separate from hard normalization and derives finite fallback ranges", () => {
    expect(resolveNumberInputSoftRange(5, {min: 0, max: 10})).toEqual({min: 0, max: 10})
    expect(resolveNumberInputSoftRange(50, {precision: 2})).toEqual({min: -50, max: 150})
    expect(resolveNumberInputSoftRange(50, {min: 0, max: 100, softMin: 80, softMax: 20})).toEqual({min: 20, max: 80})
    expect(normalizeNumberInputValue(15, {min: 0, max: 20, softMin: 0, softMax: 10})).toBe(15)
  })

  test("maps horizontal scrub through soft range, Shift precision and hard normalization", () => {
    const options = {min: 0, max: 20, softMin: 0, softMax: 10, step: 0.1, precision: 1} as const
    expect(scrubNumberInputValue(5, 50, 50, options)).toBe(6)
    expect(scrubNumberInputValue(5, 50, 50, options, true)).toBe(5.1)
    expect(scrubNumberInputValue(9, 100, 100, options)).toBe(10)
    expect(scrubNumberInputValue(500, 50, 50, {min: 0, max: 1000, step: 0.01})).toBe(502)
    expect(stepNumberInputValue(1, -1, {min: 0, max: 10, step: 0.25})).toBe(0.75)
    expect(stepNumberInputValue(1, 1, {min: 0, max: 10, step: 0.25})).toBe(1.25)
    expect(stepNumberInputValue(0, -1, {min: -10, max: 20, softMin: 0, softMax: 10, step: 0.25})).toBe(0)
    expect(stepNumberInputValue(10, 1, {min: -10, max: 20, softMin: 0, softMax: 10, step: 0.25})).toBe(10)
    expect(stepNumberInputValue(15, -1, {min: -10, max: 20, softMin: 0, softMax: 10, step: 0.25})).toBe(14.75)
    expect(stepNumberInputValue(15, 1, {min: -10, max: 20, softMin: 0, softMax: 10, step: 0.25})).toBe(10)
    expect(stepNumberInputValue(-5, 1, {min: -10, max: 20, softMin: 0, softMax: 10, step: 0.25})).toBe(-4.75)
    expect(stepNumberInputValue(-5, -1, {min: -10, max: 20, softMin: 0, softMax: 10, step: 0.25})).toBe(0)
    expect(stepNumberInputValue(10, 1, {min: -10, max: 20, softMin: 0.1, softMax: 10.1, step: 0.25})).toBe(10.1)
    expect(stepNumberInputValue(0.2, -1, {min: -10, max: 20, softMin: 0.1, softMax: 10.1, step: 0.25})).toBe(0.1)
    expect(stepNumberInputValue(10.1, 1, {min: -10, max: 20, softMin: 0.1, softMax: 10.1, step: 0.25})).toBe(10.1)
  })

  test("applies Blender linear Ctrl and Ctrl+Shift snap increments by frozen soft range", () => {
    expect(snapLinearNumberInputValue(0.44, {min: 0, max: 1})).toBe(0.4)
    expect(snapLinearNumberInputValue(0.44, {min: 0, max: 1}, true)).toBe(0.44)
    expect(snapLinearNumberInputValue(6.3, {min: 0, max: 10})).toBe(6)
    expect(snapLinearNumberInputValue(6.34, {min: 0, max: 10}, true)).toBe(6.3)
    expect(snapLinearNumberInputValue(44.4, {min: 0, max: 100})).toBe(40)
    expect(snapLinearNumberInputValue(44.4, {min: 0, max: 100}, true)).toBe(44)
    expect(snapLinearNumberInputValue(-0.05, {min: -1, max: 1})).toBe(-0.1)
    expect(snapLinearNumberInputValue(0, {min: 0, max: 100})).toBe(0)
    expect(snapLinearNumberInputValue(100, {min: 0, max: 100})).toBe(100)

    expect(scrubNumberInputValue(0.34, 50, 50, {softMin: 0, softMax: 1, step: 0.01}, false, true)).toBe(0.4)
    expect(scrubNumberInputValue(0.34, 50, 50, {softMin: 0, softMax: 1, step: 0.01}, true, true)).toBe(0.35)
  })

  test("preserves the unsnapped drag position while Ctrl toggles during one gesture", () => {
    const values: number[] = []
    const surface = new RecordingSurface()
    NumberInput(surface, 0, 0, 100, 22, {
      key: "toggle-snap",
      value: 1.3,
      min: 0,
      max: 10,
      softMin: 0,
      softMax: 10,
      step: 0.1,
      onChange: (value) => values.push(value),
    })
    const options = surface.hits[0]?.[5]
    if (typeof options === "object") {
      options.onPointerDown?.(50, 11, pointer())
      options.onPointerMove?.(54, 11, pointer())
      options.onPointerMove?.(104, 11, pointer({ctrlKey: true}))
      options.onPointerMove?.(114, 11, pointer({ctrlKey: true}))
      options.onPointerMove?.(124, 11, pointer())
    }
    expect(values).toEqual([2, 3, 2.7])
  })

  test("publishes controlled side steps, scrub updates and cancel restoration", () => {
    const stepped: number[] = []
    const side = new RecordingSurface()
    NumberInput(side, 0, 0, 100, 22, {
      key: "side",
      value: 1,
      min: 0,
      max: 10,
      step: 0.25,
      onChange: (value) => stepped.push(value),
    })
    const sideOptions = side.hits[0]![5] as NonNullable<HitCall[5]>
    if (typeof sideOptions === "object") {
      sideOptions.onPointerDown?.(4, 11, pointer())
      sideOptions.onPointerUp?.(pointer())
    }
    expect(stepped).toEqual([0.75])

    const scrubbed: number[] = []
    const scrub = new RecordingSurface()
    NumberInput(scrub, 0, 0, 100, 22, {
      key: "scrub-number",
      value: 5,
      min: 0,
      max: 10,
      softMin: 0,
      softMax: 10,
      step: 0.1,
      onChange: (value) => scrubbed.push(value),
    })
    const scrubOptions = scrub.hits[0]![5] as NonNullable<HitCall[5]>
    if (typeof scrubOptions === "object") {
      scrubOptions.onPointerDown?.(50, 11, pointer())
      scrubOptions.onPointerMove?.(55, 11, pointer())
      scrubOptions.onPointerMove?.(65, 11, pointer())
    }
    expect(scrubbed).toEqual([5.2])
    expect(handleActiveInputKey(scrub, escape())).toBeTrue()
    expect(scrubbed).toEqual([5.2, 5])
  })

  test("freezes the capped adaptive drag range from gesture origin", () => {
    const values: number[] = []
    const surface = new RecordingSurface()
    NumberInput(surface, 0, 0, 100, 22, {
      key: "frozen-range",
      value: 500,
      min: 0,
      max: 1000,
      step: 0.01,
      onChange: (value) => values.push(value),
    })
    const options = surface.hits[0]![5]
    if (typeof options === "object") {
      options.onPointerDown?.(50, 11, pointer())
      options.onPointerMove?.(54, 11, pointer())
      options.onPointerMove?.(554, 11, pointer())
      options.onPointerMove?.(654, 11, pointer())
      options.onPointerUp?.(pointer())
    }
    expect(values).toEqual([600])
  })

  test("enters text on center release and Ctrl press without changing the number", () => {
    for (const ctrlKey of [false, true]) {
      const values: number[] = []
      const surface = new RecordingSurface()
      NumberInput(surface, 0, 0, 100, 22, {key: `text:${ctrlKey}`, value: 1, onChange: (value) => values.push(value)})
      const options = surface.hits[0]![5] as NonNullable<HitCall[5]>
      if (typeof options === "object") {
        options.onPointerDown?.(50, 11, pointer({ctrlKey}))
        if (!ctrlKey) options.onPointerUp?.(pointer())
      }
      expect(values).toEqual([])
      expect(surfaceHasActiveInput(surface)).toBeTrue()
    }
  })

  test("parses a finite value with an optional unit and rejects invalid input", () => {
    const options = {min: 0, max: 2, step: 0.25, unit: "kg"} as const
    expect(parseNumberInputValue(" 1.26 kg ", options)).toBe(1.25)
    expect(parseNumberInputValue("1.26", options)).toBe(1.25)
    expect(parseNumberInputValue("", options)).toBeNull()
    expect(parseNumberInputValue("kg", options)).toBeNull()
    expect(parseNumberInputValue("1 kg later", options)).toBeNull()
    expect(parseNumberInputValue("Infinity", options)).toBeNull()
    expect(formatNumberInputValue(1.26, options)).toBe("1.25kg")
  })

  test("keeps default formatting while allowing reusable fixed precision and font size", () => {
    expect(formatNumberInputValue(1)).toBe("1")
    expect(formatNumberInputValue(1, {precision: 2})).toBe("1.00")
    expect(formatNumberInputValue(1.236, {precision: 2, unit: "m"})).toBe("1.24m")

    const surface = new RecordingSurface()
    NumberInput(surface, 0, 0, 120, 28, {
      value: 1,
      precision: 2,
      fontPx: 9,
    })
    expect(surface.texts[0]?.[0]).toBe("1.00")
    expect(surface.texts[0]?.[3].fontPx).toBe(9)
  })

  test("uses one Elements-owned visible silhouette in regular and compact density", () => {
    const regular = new RecordingSurface()
    NumberInput(regular, 4, 6, 120, 28, numberProps(() => {}))
    const [, regularY, regularWidth, regularHeight, regularStyle] = regular.roundedRects[0]!
    expect({regularY, regularWidth, regularHeight}).toEqual({
      regularY: 9,
      regularWidth: 120,
      regularHeight: uiShapeMetrics.controlHeight,
    })
    expect({radius: regularStyle.radius, borderWidth: regularStyle.borderWidth}).toEqual({
      radius: uiShapeMetrics.lowRadius,
      borderWidth: uiShapeMetrics.borderWidth,
    })

    const compact = new RecordingSurface()
    NumberInput(compact, 4, 6, 120, 22, numberProps(() => {}, {density: "compact"}))
    const [, , width, height, style] = compact.roundedRects[0]!
    expect({width, height, radius: style.radius, borderWidth: style.borderWidth}).toEqual({
      width: 120,
      height: uiShapeMetrics.controlHeight,
      radius: uiShapeMetrics.lowRadius,
      borderWidth: uiShapeMetrics.borderWidth,
    })
    expect(style.fill).toEqual(blenderRgba8ToColor(resolveWidgetColors("number").inner))
    expect(style.border).toEqual(blenderRgba8ToColor(resolveWidgetColors("number").outline))
    expect(regularStyle.fill).toEqual(style.fill)
    expect(regularStyle.border).toEqual(style.border)
  })

  test("suppresses mutating input for disabled and read-only states", () => {
    const values: number[] = []
    for (const state of [{disabled: true}, {readOnly: true}] as const) {
      const surface = new RecordingSurface()
      NumberInput(surface, 0, 0, 120, 28, numberProps((value) => values.push(value), state))
      expect(surface.hits).toHaveLength(0)
      const colors = resolveWidgetColors("number", {disabled: true})
      expect(surface.roundedRects[0]?.[4]).toMatchObject({
        fill: blenderRgba8ToColor(colors.inner),
        border: blenderRgba8ToColor(colors.outline),
      })
      submit(surface, "number", "4.75kg")
    }
    expect(values).toEqual([])
  })

  test("passes edge-aware grouped appearance through TextField without inset", () => {
    const surface = new RecordingSurface()
    focusInput(surface, "grouped-number", createInputEditState("1"))
    NumberInput(surface, 0, 0, 100, 22, {
      key: "grouped-number",
      value: 1,
      appearance: {
        kind: "grouped-cell",
        corners: {topLeft: false, topRight: false, bottomLeft: false, bottomRight: false},
      },
      sx: {borderRadius: 0, borderWidth: 0},
    })

    expect(surface.roundedRects[0]?.slice(0, 4)).toEqual([0, 0, 100, 22])
    expect(surface.roundedRects[0]?.[4]).toMatchObject({radius: {tl: 0, tr: 0, br: 0, bl: 0}, borderWidth: 0})
  })

  test("returns the same controlled value standalone and through regular and compact Field", () => {
    const standaloneValues: number[] = []
    const regularFieldValues: number[] = []
    const compactFieldValues: number[] = []

    const standalone = new RecordingSurface()
    NumberInput(standalone, 0, 0, 120, 28, numberProps((value) => standaloneValues.push(value), {
      key: "standalone",
    }))
    submit(standalone, "standalone", "4.74 kg")

    const definition = (onChange: (value: number) => void): NumberFieldDefinition => ({
      id: "field",
      label: "Mass",
      kind: "number",
      value: 1,
      min: 0,
      max: 10,
      step: 0.25,
      unit: "kg",
      onChange,
    })

    const regularField = new RecordingSurface()
    Field(regularField, 0, 0, 120, definition((value) => regularFieldValues.push(value)))
    submit(regularField, "field:field", "4.74 kg")

    const compactField = new RecordingSurface()
    Field(compactField, 0, 0, 120, definition((value) => compactFieldValues.push(value)), {density: "compact"})
    submit(compactField, "field:field", "4.74 kg")

    expect(standaloneValues).toEqual([4.75])
    expect(regularFieldValues).toEqual(standaloneValues)
    expect(compactFieldValues).toEqual(standaloneValues)
  })

  test("keeps soft-range pointer scrub identical standalone and through both Field densities", () => {
    const scrub = (surface: RecordingSurface): void => {
      const hit = surface.hits[0]!
      const options = hit[5]
      if (typeof options !== "object") return
      const center = hit[0] + hit[2] / 2
      options.onPointerDown?.(center, hit[1] + hit[3] / 2, pointer())
      options.onPointerMove?.(center + 50, hit[1] + hit[3] / 2, pointer({ctrlKey: true}))
      options.onPointerMove?.(center + 100, hit[1] + hit[3] / 2, pointer({ctrlKey: true}))
      options.onPointerUp?.(pointer())
    }
    const standaloneValues: number[] = []
    const regularValues: number[] = []
    const compactValues: number[] = []
    const options = {
      value: 1.3,
      min: 0,
      max: 20,
      softMin: 0,
      softMax: 10,
      step: 0.1,
    } as const

    const standalone = new RecordingSurface()
    NumberInput(standalone, 0, 0, 120, 22, {...options, key: "standalone-pointer", onChange: (value) => standaloneValues.push(value)})
    scrub(standalone)

    const definition = (onChange: (value: number) => void): NumberFieldDefinition => ({
      id: "pointer-field",
      label: "Pointer",
      kind: "number",
      ...options,
      onChange,
    })
    const regular = new RecordingSurface()
    Field(regular, 0, 0, 120, definition((value) => regularValues.push(value)))
    scrub(regular)
    const compact = new RecordingSurface()
    Field(compact, 0, 0, 120, definition((value) => compactValues.push(value)), {density: "compact"})
    scrub(compact)

    expect(standaloneValues).toEqual([2])
    expect(regularValues).toEqual(standaloneValues)
    expect(compactValues).toEqual(standaloneValues)
  })
})
