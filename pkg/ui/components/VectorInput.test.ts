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

const pointer = (): MouseEvent => ({button: 0, preventDefault() {}} as MouseEvent)

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
  test("delegates side pointer steps to public NumberInput without mutating the vector", () => {
    const initial = [1, 2, 3] as const
    const values: Array<readonly number[]> = []
    const surface = new RecordingSurface()
    VectorInput(surface, 0, 0, 150, 66, {
      key: "pointer-vector",
      value: initial,
      dimensions: 3,
      min: 0,
      max: 10,
      step: 0.25,
      onChange: (value) => values.push(value),
    })
    const hit = surface.hits[0]!
    const options = hit[5]
    if (typeof options === "object") {
      options.onPointerDown?.(hit[0] + hit[2] - 2, hit[1] + hit[3] / 2, pointer())
      options.onPointerUp?.(pointer())
    }
    expect(values).toEqual([[1.25, 2, 3]])
    expect(values[0]).not.toBe(initial)
    expect(initial).toEqual([1, 2, 3])
  })
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
    VectorInput(defaults, 0, 0, 146, 88, vectorProps(() => {}, {
      value: [1, 2, 3, 4],
      dimensions: 4,
    }))
    const defaultTexts = defaults.texts.map(([text]) => text)
    expect(defaultTexts).toEqual(expect.arrayContaining(["X", "Y", "Z", "W", "1m", "4m"]))

    const custom = new RecordingSurface()
    VectorInput(custom, 0, 0, 146, 44, vectorProps(() => {}, {
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
    VectorInput(surface, 0, 0, 146, 66, vectorProps((value) => values.push(value), {value: initial}))

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
      VectorInput(surface, 0, 0, 146, 66, vectorProps((value) => values.push(value), state))
      expect(surface.hits).toHaveLength(0)
      submit(surface, "vector:1", "4.75m")
    }
    expect(values).toEqual([])
  })

  test("uses the same joined stacked axis geometry in regular and compact density", () => {
    const regular = new RecordingSurface()
    const regularHeight = measureVectorInputHeight({value: [1, 2, 3]})
    expect(regularHeight).toBe(66)
    VectorInput(regular, 4, 6, 146, regularHeight, vectorProps(() => {}))
    expect(regular.hits.map((call) => ({x: call[0], y: call[1], w: call[2], h: call[3]}))).toEqual([
      {x: 26, y: 6, w: 124, h: 22},
      {x: 26, y: 28, w: 124, h: 22},
      {x: 26, y: 50, w: 124, h: 22},
    ])
    expect(regular.roundedRects.filter((call) => call[4].radius === uiShapeMetrics.lowRadius)).toHaveLength(2)
    expect(regular.roundedRects.filter((call) => call[4].radius === 0)).toHaveLength(2)

    const compact = new RecordingSurface()
    const compactHeight = measureVectorInputHeight({value: [1, 2, 3], density: "compact"})
    expect(compactHeight).toBe(regularHeight)
    VectorInput(compact, 4, 6, 146, compactHeight, vectorProps(() => {}, {density: "compact"}))
    expect(compact.hits.map((call) => ({x: call[0], y: call[1], w: call[2], h: call[3]}))).toEqual([
      {x: 26, y: 6, w: 124, h: 22},
      {x: 26, y: 28, w: 124, h: 22},
      {x: 26, y: 50, w: 124, h: 22},
    ])
    expect(compact.roundedRects.filter((call) => call[4].radius === uiShapeMetrics.lowRadius)).toHaveLength(2)
    expect(compact.roundedRects.filter((call) => call[4].radius === 0)).toHaveLength(2)
  })

  test("rounds only the active numeric edge that touches the group", () => {
    const surface = new RecordingSurface()
    focusInput(surface, "vector:0", createInputEditState("1m"))
    VectorInput(surface, 4, 6, 146, 66, vectorProps(() => {}))

    const active = surface.roundedRects.find((call) => call[0] === 26 && call[1] === 6 && call[2] === 124 && call[3] === 22)
    expect(active?.[4].radius).toEqual({tl: 0, tr: 4, br: 0, bl: 0})
  })

  test("returns the same value standalone and through vector and rotation Field densities", () => {
    const standaloneValues: (readonly number[])[] = []
    const vectorRegularValues: (readonly number[])[] = []
    const vectorCompactValues: (readonly number[])[] = []
    const rotationRegularValues: (readonly number[])[] = []
    const rotationCompactValues: (readonly number[])[] = []

    const standalone = new RecordingSurface()
    VectorInput(standalone, 0, 0, 146, 66, vectorProps((value) => standaloneValues.push(value), {
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
