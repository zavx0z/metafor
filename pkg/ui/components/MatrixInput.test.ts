import {describe, expect, test} from "bun:test"
import {
  createInputEditState,
  focusInput,
  handleActiveInputKey,
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
    MatrixInput(surface, 0, 0, 204, 56, matrixProps((value) => values.push(value), {value: initial}))

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
      MatrixInput(surface, 0, 0, 204, 56, matrixProps((value) => values.push(value), state))
      expect(surface.hits).toHaveLength(0)
      submit(surface, "matrix:0:1", "4.75")
    }
    expect(values).toEqual([])
  })

  test("preserves regular and compact matrix geometry and measurement", () => {
    const value = [[1, 0], [0, 1]] as const
    expect(measureMatrixInputHeight({value})).toBe(56)
    expect(measureMatrixInputHeight({value, density: "compact"})).toBe(47)
    expect(measureMatrixInputHeight({value: [[1], [0], [0]]})).toBe(84)
    expect(measureMatrixInputHeight({value: [[1], [0], [0], [0]], density: "compact"})).toBe(97)

    const regular = new RecordingSurface()
    MatrixInput(regular, 4, 6, 204, 56, matrixProps(() => {}))
    expect(regular.roundedRects.map((call) => ({x: call[0], y: call[1], w: call[2], h: call[3]}))).toEqual([
      {x: 4, y: 8, w: 100, h: 22},
      {x: 108, y: 8, w: 100, h: 22},
      {x: 4, y: 38, w: 100, h: 22},
      {x: 108, y: 38, w: 100, h: 22},
    ])
    expect(regular.roundedRects[0]?.[4].radius).toBe(3)
    expect(regular.texts.map(([text]) => text)).toEqual(["1.00", "0.00", "0.00", "1.00"])
    expect(regular.texts.map((call) => call[3].fontPx)).toEqual([9, 9, 9, 9])

    const compact = new RecordingSurface()
    MatrixInput(compact, 4, 6, 123, 47, matrixProps(() => {}, {density: "compact"}))
    expect(compact.roundedRects.map((call) => ({x: call[0], y: call[1], w: call[2], h: call[3]}))).toEqual([
      {x: 4, y: 6, w: 60, h: 22},
      {x: 67, y: 6, w: 60, h: 22},
      {x: 4, y: 31, w: 60, h: 22},
      {x: 67, y: 31, w: 60, h: 22},
    ])
    expect(compact.roundedRects[0]?.[4].radius).toBe(3)
    expect(compact.texts.map(([text]) => text)).toEqual(["1.00", "0.00", "0.00", "1.00"])
    expect(compact.texts.map((call) => call[3].fontPx)).toEqual([11, 11, 11, 11])
  })

  test("returns the same value standalone and through regular and compact Field", () => {
    const standaloneValues: (readonly (readonly number[])[])[] = []
    const regularFieldValues: (readonly (readonly number[])[])[] = []
    const compactFieldValues: (readonly (readonly number[])[])[] = []

    const standalone = new RecordingSurface()
    MatrixInput(standalone, 0, 0, 204, 56, matrixProps((value) => standaloneValues.push(value), {
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
