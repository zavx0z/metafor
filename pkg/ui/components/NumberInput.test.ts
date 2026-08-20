import {describe, expect, test} from "bun:test"
import {
  createInputEditState,
  focusInput,
  handleActiveInputKey,
  palette,
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
  type NumberInputProps,
} from "./NumberInput.ts"

type RoundedRectCall = Parameters<UiSurface["drawRoundedRect"]>
type TextCall = Parameters<UiSurface["drawText"]>
type HitCall = Parameters<UiSurface["hit"]>

class RecordingSurface extends BaseUiSurface {
  readonly roundedRects: RoundedRectCall[] = []
  readonly texts: TextCall[] = []
  readonly hits: HitCall[] = []

  override drawRoundedRect(...args: RoundedRectCall): void {
    this.roundedRects.push(args)
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
    expect(style.fill).toEqual(palette.bgInput)
    expect(style.border).toEqual(palette.borderDim)
    expect(regularStyle.fill).toEqual(style.fill)
    expect(regularStyle.border).toEqual(style.border)
  })

  test("suppresses mutating input for disabled and read-only states", () => {
    const values: number[] = []
    for (const state of [{disabled: true}, {readOnly: true}] as const) {
      const surface = new RecordingSurface()
      NumberInput(surface, 0, 0, 120, 28, numberProps((value) => values.push(value), state))
      expect(surface.hits).toHaveLength(0)
      submit(surface, "number", "4.75kg")
    }
    expect(values).toEqual([])
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
})
