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
  normalizeMatrixFieldValue,
  type MatrixFieldDefinition,
} from "./Field.ts"
import {
  MatrixInput,
  measureMatrixInputHeight,
  normalizeMatrixInputValue,
  type MatrixInputProps,
} from "./MatrixInput.ts"

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

const matrixProps = (
  onChange: (value: readonly (readonly number[])[]) => void,
  extra: Partial<MatrixInputProps> = {},
): MatrixInputProps => ({
  key: "matrix",
  value: [[1, 0], [0, 1]],
  onChange,
  ...extra,
})

describe("public MatrixInput", () => {
  test("delegates pointer steps to public NumberInput without local matrix gesture logic", () => {
    const initial = [[1, 0], [0, 1]] as const
    const values: Array<readonly (readonly number[])[]> = []
    const surface = new RecordingSurface()
    MatrixInput(surface, 0, 0, 100, 44, {
      key: "pointer-matrix",
      value: initial,
      onChange: (value) => values.push(value),
    })
    const hit = surface.hits[0]!
    const options = hit[5]
    if (typeof options === "object") {
      options.onPointerDown?.(hit[0] + hit[2] - 2, hit[1] + hit[3] / 2, pointer())
      options.onPointerUp?.(pointer())
    }
    expect(values).toEqual([[[1.01, 0], [0, 1]]])
    expect(values[0]).not.toBe(initial)
    expect(initial).toEqual([[1, 0], [0, 1]])
  })
  test("normalizes square 2D, 3D and 4D values through the exact Field delegate", () => {
    expect(normalizeMatrixInputValue([[2]])).toEqual([[2, 0], [0, 1]])
    expect(normalizeMatrixInputValue([
      [1, 2, Number.NaN],
      [4],
      [7, 8, 9],
    ])).toEqual([
      [1, 2, 0],
      [4, 1, 0],
      [7, 8, 9],
    ])
    expect(normalizeMatrixInputValue([
      [1, 2, 3, 4],
      [5, 6, 7, 8],
      [9, 10, 11, 12],
      [13, 14, 15, 16],
    ])).toHaveLength(4)
    expect(normalizeMatrixInputValue([])).toEqual([[1, 0], [0, 1]])
    expect(normalizeMatrixFieldValue).toBe(normalizeMatrixInputValue)
  })

  test("publishes one immutable normalized cell update and rejects invalid input", () => {
    const initial = Object.freeze([
      Object.freeze([1, 0]),
      Object.freeze([0, 1]),
    ])
    const values: (readonly (readonly number[])[])[] = []
    const surface = new RecordingSurface()
    MatrixInput(surface, 0, 0, 146, 44, matrixProps((value) => values.push(value), {value: initial}))

    submit(surface, "matrix:1:0", "4.7500004")
    submit(surface, "matrix:0:1", "not-a-number")

    expect(values).toEqual([[[1, 0], [4.75, 1]]])
    expect(values[0]).not.toBe(initial)
    expect(initial).toEqual([[1, 0], [0, 1]])
  })

  test("suppresses mutating input for disabled and read-only cells", () => {
    const values: (readonly (readonly number[])[])[] = []
    for (const state of [{disabled: true}, {readOnly: true}] as const) {
      const surface = new RecordingSurface()
      MatrixInput(surface, 0, 0, 146, 44, matrixProps((value) => values.push(value), state))
      expect(surface.hits).toHaveLength(0)
      submit(surface, "matrix:0:1", "4.75")
    }
    expect(values).toEqual([])
  })

  test("uses one joined regular and compact matrix grid with shared rules", () => {
    const value = [[1, 0], [0, 1]] as const
    expect(measureMatrixInputHeight({value})).toBe(44)
    expect(measureMatrixInputHeight({value, density: "compact"})).toBe(44)
    expect(measureMatrixInputHeight({value: [[1], [0], [0]]})).toBe(66)
    expect(measureMatrixInputHeight({value: [[1], [0], [0], [0]], density: "compact"})).toBe(88)

    const regular = new RecordingSurface()
    MatrixInput(regular, 4, 6, 146, 44, matrixProps(() => {}))
    expect(regular.hits.map((call) => ({x: call[0], y: call[1], w: call[2], h: call[3]}))).toEqual([
      {x: 4, y: 6, w: 73, h: 22},
      {x: 77, y: 6, w: 73, h: 22},
      {x: 4, y: 28, w: 73, h: 22},
      {x: 77, y: 28, w: 73, h: 22},
    ])
    expect(regular.roundedRects.filter((call) => call[4].radius === uiShapeMetrics.lowRadius)).toHaveLength(2)
    expect(regular.roundedRects.filter((call) => call[4].radius === 0)).toHaveLength(2)
    expect(regular.texts.map(([text]) => text)).toEqual(["1.00", "0.00", "0.00", "1.00"])
    expect(regular.texts.map((call) => call[3].fontPx)).toEqual([11, 11, 11, 11])

    const compact = new RecordingSurface()
    MatrixInput(compact, 4, 6, 146, 44, matrixProps(() => {}, {density: "compact"}))
    expect(compact.hits.map((call) => ({x: call[0], y: call[1], w: call[2], h: call[3]}))).toEqual([
      {x: 4, y: 6, w: 73, h: 22},
      {x: 77, y: 6, w: 73, h: 22},
      {x: 4, y: 28, w: 73, h: 22},
      {x: 77, y: 28, w: 73, h: 22},
    ])
    expect(compact.roundedRects.filter((call) => call[4].radius === uiShapeMetrics.lowRadius)).toHaveLength(2)
    expect(compact.roundedRects.filter((call) => call[4].radius === 0)).toHaveLength(2)
    expect(compact.texts.map(([text]) => text)).toEqual(["1.00", "0.00", "0.00", "1.00"])
    expect(compact.texts.map((call) => call[3].fontPx)).toEqual([11, 11, 11, 11])
  })

  test("keeps an active corner cell full-size with only its outer corner rounded", () => {
    const surface = new RecordingSurface()
    focusInput(surface, "matrix:0:0", createInputEditState("1.00"))
    MatrixInput(surface, 4, 6, 146, 44, matrixProps(() => {}))

    const cornerPatches = surface.roundedRects.filter((call) => call[2] === 8 && call[3] === 8 && call[4].radius === 4)
    expect(cornerPatches.map((call) => call.slice(0, 4))).toEqual([[4, 6, 8, 8]])
    expect(surface.roundedRects.some((call) => call.slice(0, 4).toString() === [6, 8, 69, 18].toString())).toBeFalse()
  })

  test("returns the same value standalone and through regular and compact Field", () => {
    const standaloneValues: (readonly (readonly number[])[])[] = []
    const regularFieldValues: (readonly (readonly number[])[])[] = []
    const compactFieldValues: (readonly (readonly number[])[])[] = []

    const standalone = new RecordingSurface()
    MatrixInput(standalone, 0, 0, 146, 44, matrixProps((value) => standaloneValues.push(value), {
      key: "standalone",
    }))
    submit(standalone, "standalone:0:1", "4.75")

    const definition = (
      onChange: (value: readonly (readonly number[])[]) => void,
    ): MatrixFieldDefinition => ({
      id: "matrix",
      label: "Matrix",
      kind: "matrix",
      value: [[1, 0], [0, 1]],
      onChange,
    })

    const regularField = new RecordingSurface()
    Field(regularField, 0, 0, 204, definition((value) => regularFieldValues.push(value)))
    submit(regularField, "field:matrix:0:1", "4.75")

    const compactField = new RecordingSurface()
    Field(compactField, 0, 0, 123, definition((value) => compactFieldValues.push(value)), {density: "compact"})
    submit(compactField, "field:matrix:0:1", "4.75")

    expect(standaloneValues).toEqual([[[1, 4.75], [0, 1]]])
    expect(regularFieldValues).toEqual(standaloneValues)
    expect(compactFieldValues).toEqual(standaloneValues)
    expect(regularField.texts.slice(-4).map(([text]) => text)).toEqual(standalone.texts.map(([text]) => text))
    expect(compactField.texts.slice(-4).map(([text]) => text)).toEqual(standalone.texts.map(([text]) => text))
  })
})
