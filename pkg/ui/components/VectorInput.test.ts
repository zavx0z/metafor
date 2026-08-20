import {describe, expect, test} from "bun:test"
import {
  createInputEditState,
  focusInput,
  handleActiveInputKey,
  uiShapeMetrics,
  type UiSurface,
  UiSurface as BaseUiSurface,
} from "@ui/elements"
import {
  Field,
  normalizeVectorFieldValue,
  type RotationFieldDefinition,
  type VectorFieldDefinition,
} from "./Field.ts"
import {
  measureVectorInputHeight,
  normalizeVectorInputValue,
  VectorInput,
  type VectorInputProps,
} from "./VectorInput.ts"

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

const vectorProps = (
  onChange: (value: readonly number[]) => void,
  extra: Partial<VectorInputProps> = {},
): VectorInputProps => ({
  key: "vector",
  value: [1, 2, 3],
  dimensions: 3,
  min: 0,
  max: 10,
  step: 0.25,
  unit: "m",
  onChange,
  ...extra,
})

describe("public VectorInput", () => {
  test("normalizes 2D, 3D and 4D values through the exact Field delegate", () => {
    expect(normalizeVectorInputValue([1, 2], 2)).toEqual([1, 2])
    expect(normalizeVectorInputValue([1, 2], 3)).toEqual([1, 2, 0])
    expect(normalizeVectorInputValue([1, 2], 4)).toEqual([1, 2, 0, 0])
    expect(normalizeVectorInputValue([1.2, 2.8, Number.NaN], 3, {
      numberKind: "integer",
      min: 0,
      max: 2,
      step: 0.5,
    })).toEqual([1, 2, 0])
    expect(normalizeVectorFieldValue).toBe(normalizeVectorInputValue)
  })

  test("draws default and custom axis labels with the configured unit", () => {
    const defaults = new RecordingSurface()
    VectorInput(defaults, 0, 0, 400, 28, vectorProps(() => {}, {
      value: [1, 2, 3, 4],
      dimensions: 4,
    }))
    const defaultTexts = defaults.texts.map(([text]) => text)
    expect(defaultTexts).toEqual(expect.arrayContaining(["X", "Y", "Z", "W", "1m", "4m"]))

    const custom = new RecordingSurface()
    VectorInput(custom, 0, 0, 200, 28, vectorProps(() => {}, {
      value: [5, 6],
      dimensions: 2,
      axes: ["U", "V"],
      unit: "kg",
    }))
    const customTexts = custom.texts.map(([text]) => text)
    expect(customTexts).toEqual(expect.arrayContaining(["U", "V", "5kg", "6kg"]))
  })

  test("publishes one immutable normalized axis update and rejects invalid input", () => {
    const initial = Object.freeze([1, 2, 3])
    const values: (readonly number[])[] = []
    const surface = new RecordingSurface()
    VectorInput(surface, 0, 0, 300, 28, vectorProps((value) => values.push(value), {value: initial}))

    submit(surface, "vector:1", "11.13 m")
    submit(surface, "vector:2", "not-a-number")

    expect(values).toEqual([[1, 10, 3]])
    expect(values[0]).not.toBe(initial)
    expect(initial).toEqual([1, 2, 3])
  })

  test("suppresses mutating input for disabled and read-only axes", () => {
    const values: (readonly number[])[] = []
    for (const state of [{disabled: true}, {readOnly: true}] as const) {
      const surface = new RecordingSurface()
      VectorInput(surface, 0, 0, 300, 28, vectorProps((value) => values.push(value), state))
      expect(surface.hits).toHaveLength(0)
      submit(surface, "vector:1", "4.75m")
    }
    expect(values).toEqual([])
  })

  test("preserves the regular horizontal and compact vertical geometry", () => {
    const regular = new RecordingSurface()
    VectorInput(regular, 4, 6, 300, 28, vectorProps(() => {}))
    expect(regular.roundedRects).toHaveLength(3)
    expect(regular.roundedRects[0]?.[0]).toBeCloseTo(25)
    expect(regular.roundedRects[0]?.[1]).toBe(9)
    expect(regular.roundedRects[0]?.[2]).toBeCloseTo(75.666667)
    expect(regular.roundedRects[0]?.[3]).toBe(22)
    expect(regular.roundedRects[0]?.[4].radius).toBe(uiShapeMetrics.lowRadius)

    const compact = new RecordingSurface()
    const compactHeight = measureVectorInputHeight({value: [1, 2, 3], density: "compact"})
    expect(compactHeight).toBe(72)
    VectorInput(compact, 4, 6, 120, compactHeight, vectorProps(() => {}, {density: "compact"}))
    expect(compact.roundedRects).toHaveLength(3)
    expect(compact.roundedRects.map((call) => ({x: call[0], y: call[1], w: call[2], h: call[3]}))).toEqual([
      {x: 29, y: 6, w: 95, h: 22},
      {x: 29, y: 31, w: 95, h: 22},
      {x: 29, y: 56, w: 95, h: 22},
    ])
    expect(compact.roundedRects[0]?.[4].radius).toBe(uiShapeMetrics.lowRadius)
  })

  test("returns the same value standalone and through vector and rotation Field densities", () => {
    const standaloneValues: (readonly number[])[] = []
    const vectorRegularValues: (readonly number[])[] = []
    const vectorCompactValues: (readonly number[])[] = []
    const rotationRegularValues: (readonly number[])[] = []
    const rotationCompactValues: (readonly number[])[] = []

    const standalone = new RecordingSurface()
    VectorInput(standalone, 0, 0, 300, 28, vectorProps((value) => standaloneValues.push(value), {
      key: "standalone",
      unit: "°",
    }))
    submit(standalone, "standalone:1", "4.74 °")

    const vectorDefinition = (onChange: (value: readonly number[]) => void): VectorFieldDefinition => ({
      id: "vector",
      label: "Vector",
      kind: "vector",
      value: [1, 2, 3],
      min: 0,
      max: 10,
      step: 0.25,
      unit: "°",
      onChange,
    })
    const rotationDefinition = (onChange: (value: readonly number[]) => void): RotationFieldDefinition => ({
      id: "rotation",
      label: "Rotation",
      kind: "rotation",
      value: [1, 2, 3],
      min: 0,
      max: 10,
      step: 0.25,
      unit: "°",
      onChange,
    })

    const vectorRegular = new RecordingSurface()
    Field(vectorRegular, 0, 0, 300, vectorDefinition((value) => vectorRegularValues.push(value)))
    submit(vectorRegular, "field:vector:1", "4.74 °")

    const vectorCompact = new RecordingSurface()
    Field(vectorCompact, 0, 0, 120, vectorDefinition((value) => vectorCompactValues.push(value)), {density: "compact"})
    submit(vectorCompact, "field:vector:1", "4.74 °")

    const rotationRegular = new RecordingSurface()
    Field(rotationRegular, 0, 0, 300, rotationDefinition((value) => rotationRegularValues.push(value)))
    submit(rotationRegular, "field:rotation:1", "4.74 °")

    const rotationCompact = new RecordingSurface()
    Field(rotationCompact, 0, 0, 120, rotationDefinition((value) => rotationCompactValues.push(value)), {density: "compact"})
    submit(rotationCompact, "field:rotation:1", "4.74 °")

    expect(standaloneValues).toEqual([[1, 4.75, 3]])
    expect(vectorRegularValues).toEqual(standaloneValues)
    expect(vectorCompactValues).toEqual(standaloneValues)
    expect(rotationRegularValues).toEqual(standaloneValues)
    expect(rotationCompactValues).toEqual(standaloneValues)
  })
})
