import {describe, expect, test} from "bun:test"
import {
  blenderRgba8ToColor,
  createInputEditState,
  focusInput,
  handleActiveInputKey,
  resolveWidgetColors,
  type UiSurface,
  UiSurface as BaseUiSurface,
} from "@ui/elements"
import {
  formatIntegerInputValue,
  IntegerInput,
  normalizeIntegerInputValue,
  parseIntegerInputValue,
  resolveIntegerInputSoftRange,
} from "./IntegerInput.ts"

type RoundedRectCall = Parameters<UiSurface["drawRoundedRect"]>
type TextCall = Parameters<UiSurface["drawText"]>
type HitCall = Parameters<UiSurface["hit"]>

class RecordingSurface extends BaseUiSurface {
  readonly roundedRects: RoundedRectCall[] = []
  readonly texts: TextCall[] = []
  readonly hits: HitCall[] = []

  override drawRoundedRect(...args: RoundedRectCall): void { this.roundedRects.push(args) }
  override drawText(...args: TextCall): number { this.texts.push(args); return 0 }
  override measureText(value: string, _fontPx?: number): number { return value.length * 6 }
  override hit(...args: HitCall): void { this.hits.push(args) }
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

const pointer = (opts: Partial<MouseEvent> = {}): MouseEvent => ({
  button: opts.button ?? 0,
  ctrlKey: opts.ctrlKey === true,
  shiftKey: opts.shiftKey === true,
  preventDefault() {},
} as MouseEvent)

describe("public IntegerInput", () => {
  test("owns canonical integer normalization, formatting and integer soft bounds", () => {
    expect(normalizeIntegerInputValue(3.8)).toBe(4)
    expect(normalizeIntegerInputValue(4.2, {min: 1.2, max: 5.8, step: 2.2})).toBe(4)
    expect(normalizeIntegerInputValue(99, {min: 1.2, max: 5.8})).toBe(5)
    expect(formatIntegerInputValue(3.8)).toBe("4")
    expect(parseIntegerInputValue("4.8")).toBe(5)
    expect(parseIntegerInputValue("nope")).toBeNull()
    expect(resolveIntegerInputSoftRange(3, {min: 0.2, max: 9.8, softMin: 1.2, softMax: 7.8})).toEqual({min: 2, max: 7})
  })

  test("renders value-only and labeled variants with one right value edge", () => {
    const valueOnly = new RecordingSurface()
    IntegerInput(valueOnly, 0, 0, 146, 22, {value: 3})
    expect(valueOnly.texts.map(([value]) => value)).toEqual(["3"])
    expect(valueOnly.texts[0]?.[1]).toBeCloseTo(121.6)

    const labeled = new RecordingSurface()
    IntegerInput(labeled, 0, 0, 146, 22, {label: "Iterations", value: 3})
    const label = labeled.texts.find(([value]) => value === "Iterations")!
    const value = labeled.texts.find(([entry]) => entry === "3")!
    expect(label[1]).toBeCloseTo(18.4)
    expect(value[1]).toBeCloseTo(121.6)
    expect(value[1] + 6).toBeCloseTo(127.6)
    expect(labeled.roundedRects[0]?.slice(0, 4)).toEqual([0, 0, 146, 22])
    expect(labeled.hits[0]?.slice(0, 4)).toEqual([0, 0, 146, 22])
  })

  test("delegates side step and text submit to the shared numeric owner", () => {
    const values: number[] = []
    const surface = new RecordingSurface()
    IntegerInput(surface, 0, 0, 146, 22, {
      key: "integer",
      label: "Iterations",
      value: 3,
      min: 0,
      max: 10,
      softMin: 0,
      softMax: 10,
      onChange: (value) => values.push(value),
    })
    const hit = surface.hits[0]!
    const options = hit[5]
    if (typeof options === "object") {
      options.onPointerDown?.(hit[0] + hit[2] - 2, 11, pointer())
      options.onPointerUp?.(pointer())
    }
    expect(values).toEqual([4])

    focusInput(surface, "integer", createInputEditState("4.8"))
    expect(handleActiveInputKey(surface, enter())).toBeTrue()
    expect(values).toEqual([4, 5])

  })

  test("does not fork NumberInput gesture or pointer state", async () => {
    const source = await Bun.file(new URL("./IntegerInput.ts", import.meta.url)).text()
    expect(source).toContain("NumberInput(host")
    expect(source).toContain('numberKind: "integer"')
    expect(source).not.toContain("WeakMap")
    expect(source).not.toContain("onNumericGesture")
    expect(source).not.toContain("handleNumberPointerGesture")
  })

  test("keeps disabled and read-only variants visible without mutating hits", () => {
    for (const state of [{disabled: true}, {readOnly: true}] as const) {
      const surface = new RecordingSurface()
      IntegerInput(surface, 0, 0, 146, 22, {label: "Iterations", value: 3, ...state})
      expect(surface.texts.map(([value]) => value)).toEqual(expect.arrayContaining(["Iterations", "3"]))
      expect(surface.texts.map((call) => call[3].material.color)).toEqual([
        blenderRgba8ToColor(resolveWidgetColors("number", {disabled: true}).text),
        blenderRgba8ToColor(resolveWidgetColors("number", {disabled: true}).text),
      ])
      expect(surface.hits).toHaveLength(0)
    }
  })
})
