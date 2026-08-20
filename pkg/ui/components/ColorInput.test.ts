import {describe, expect, test} from "bun:test"
import {
  createInputEditState,
  focusInput,
  handleActiveInputKey,
  palette,
  uiShapeMetrics,
  type ColorPickerPlaneDrawOptions,
  type UiSurface,
  UiSurface as BaseUiSurface,
} from "@ui/elements"
import {
  Field,
  fieldColorToHex,
  normalizeFieldColor,
  parseFieldColor,
  type ColorFieldDefinition,
} from "./Field.ts"
import {
  ColorInput,
  colorInputValueToPicker,
  colorPickerValueToInput,
  formatColorInputValue,
  normalizeColorInputValue,
  parseColorInputValue,
  type ColorInputProps,
  type ColorInputValue,
} from "./ColorInput.ts"

type RoundedRectCall = Parameters<UiSurface["drawRoundedRect"]>
type HitCall = Parameters<UiSurface["hit"]>
type PickerPlaneCall = Readonly<{
  x: number
  y: number
  w: number
  h: number
  options: ColorPickerPlaneDrawOptions
}>

class RecordingSurface extends BaseUiSurface {
  readonly roundedRects: RoundedRectCall[] = []
  readonly hits: HitCall[] = []
  readonly pickerPlanes: PickerPlaneCall[] = []

  override drawRoundedRect(...args: RoundedRectCall): void {
    this.roundedRects.push(args)
  }

  override hit(...args: HitCall): void {
    this.hits.push(args)
  }

  override drawColorPickerPlane(
    x: number,
    y: number,
    w: number,
    h: number,
    options: ColorPickerPlaneDrawOptions,
  ): void {
    this.pickerPlanes.push({x, y, w, h, options})
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

const initialColor: ColorInputValue = {r: 1, g: 0, b: 0.5, a: 0.25}

const colorProps = (
  onChange: (value: ColorInputValue) => void,
  extra: Partial<ColorInputProps> = {},
): ColorInputProps => ({
  key: "color",
  value: initialColor,
  onChange,
  ...extra,
})

describe("public ColorInput", () => {
  test("normalizes every RGBA channel into the controlled unit range", () => {
    expect(normalizeColorInputValue({r: 1.2, g: -1, b: 0.5, a: 0.25})).toEqual({
      r: 1,
      g: 0,
      b: 0.5,
      a: 0.25,
    })
    expect(normalizeColorInputValue({r: Number.NaN, g: Number.POSITIVE_INFINITY, b: -1, a: 2})).toEqual({
      r: 0,
      g: 0,
      b: 0,
      a: 1,
    })
    expect(normalizeColorInputValue({})).toEqual({r: 0, g: 0, b: 0, a: 1})
  })

  test("round-trips exact RGB and RGBA hex while preserving alpha semantics", () => {
    const exact = {r: 51 / 255, g: 102 / 255, b: 153 / 255, a: 128 / 255}
    expect(formatColorInputValue(exact)).toBe("#33669980")
    expect(formatColorInputValue(exact, false)).toBe("#336699")
    expect(parseColorInputValue("#33669980")).toEqual(exact)
    expect(parseColorInputValue("336699")).toEqual({...exact, a: 1})
    expect(parseColorInputValue(formatColorInputValue(exact))).toEqual(exact)
    expect(normalizeFieldColor).toBe(normalizeColorInputValue)
    expect(fieldColorToHex).toBe(formatColorInputValue)
    expect(parseFieldColor).toBe(parseColorInputValue)
  })

  test("round-trips immutable RGBA and HSVA without changing alpha", () => {
    const rgba = Object.freeze({r: 0.2, g: 0.4, b: 0.8, a: 0.35})
    const hsva = colorInputValueToPicker(rgba)
    const roundTrip = colorPickerValueToInput(hsva)

    expect(Object.isFrozen(hsva)).toBeTrue()
    expect(Object.isFrozen(roundTrip)).toBeTrue()
    expect(roundTrip.r).toBeCloseTo(rgba.r)
    expect(roundTrip.g).toBeCloseTo(rgba.g)
    expect(roundTrip.b).toBeCloseTo(rgba.b)
    expect(roundTrip.a).toBe(rgba.a)
  })

  test("rejects invalid text without publishing a color", () => {
    for (const text of ["", "#123", "#GG6699", "#3366998000", "rgba(1, 2, 3, 1)"]) {
      expect(parseColorInputValue(text)).toBeNull()
    }
    const values: ColorInputValue[] = []
    const surface = new RecordingSurface()
    ColorInput(surface, 0, 0, 120, 28, colorProps((value) => values.push(value)))
    submit(surface, "color", "not-a-color")
    expect(values).toEqual([])
  })

  test("suppresses mutating input for disabled and read-only states", () => {
    const values: ColorInputValue[] = []
    for (const state of [{disabled: true}, {readOnly: true}] as const) {
      const surface = new RecordingSurface()
      ColorInput(surface, 0, 0, 120, 28, colorProps((value) => values.push(value), state))
      expect(surface.hits).toHaveLength(0)
      submit(surface, "color", "#33669980")
    }
    expect(values).toEqual([])
  })

  test("opens one retained-style picker, publishes every drag step and closes only on swatch reclick", () => {
    const values: ColorInputValue[] = []
    const openStates: boolean[] = []
    const surface = new RecordingSurface()
    const props = colorProps((value) => values.push(value), {
      onOpenChange: (open) => openStates.push(open),
    })

    ColorInput(surface, 0, 0, 146, 22, props)
    expect(surface.pickerPlanes).toHaveLength(0)
    surface.hits[0]?.[4]()
    expect(openStates).toEqual([true])

    ColorInput(surface, 0, 0, 146, 22, props)
    expect(surface.pickerPlanes.map(({options}) => options.mode)).toEqual(["wheel", "value", "alpha"])
    const wheelHit = surface.hits.find((hit) => {
      const options = hit[5]
      return typeof options === "object" && options.key === "color:wheel"
    })
    expect(wheelHit).toBeDefined()
    const wheelOptions = wheelHit![5]
    expect(typeof wheelOptions).toBe("object")
    if (typeof wheelOptions !== "object") throw new Error("missing wheel pointer options")
    const [wheelX, wheelY, wheelW, wheelH] = wheelHit!
    wheelOptions.onPointerDown?.(wheelX + wheelW, wheelY + wheelH / 2, {} as MouseEvent)
    wheelOptions.onPointerMove?.(wheelX + wheelW / 2, wheelY + wheelH, {} as MouseEvent)

    expect(values).toHaveLength(2)
    expect(values.every((value) => Object.isFrozen(value))).toBeTrue()
    expect(props.value).toEqual(initialColor)

    const planesBeforePersistentRender = surface.pickerPlanes.length
    ColorInput(surface, 0, 0, 146, 22, props)
    expect(surface.pickerPlanes).toHaveLength(planesBeforePersistentRender + 3)
    expect(openStates).toEqual([true])

    const latestSwatchHit = surface.hits.filter((hit) => {
      const options = hit[5]
      return typeof options === "object" && options.key === "color:swatch"
    }).at(-1)
    expect(latestSwatchHit).toBeDefined()
    latestSwatchHit![4]()
    expect(openStates).toEqual([true, false])

    const planesBeforeClosedRender = surface.pickerPlanes.length
    ColorInput(surface, 0, 0, 146, 22, props)
    expect(surface.pickerPlanes).toHaveLength(planesBeforeClosedRender)
  })

  test("supports deterministic controlled open and blocks it while disabled or read-only", () => {
    const states: boolean[] = []
    const open = new RecordingSurface()
    ColorInput(open, 0, 0, 146, 22, colorProps(() => {}, {
      open: true,
      onOpenChange: (value) => states.push(value),
    }))
    expect(open.pickerPlanes.map(({options}) => options.mode)).toEqual(["wheel", "value", "alpha"])

    for (const state of [{disabled: true}, {readOnly: true}] as const) {
      const surface = new RecordingSurface()
      ColorInput(surface, 0, 0, 146, 22, colorProps(() => {}, {...state, open: true}))
      expect(surface.pickerPlanes).toHaveLength(0)
    }
    expect(states).toEqual([])
  })

  test("draws the normalized swatch through one Elements-owned geometry", () => {
    const regular = new RecordingSurface()
    ColorInput(regular, 4, 6, 120, 28, colorProps(() => {}))
    const [regularX, regularY, regularWidth, regularHeight, regularStyle] = regular.roundedRects[0]!
    expect({regularX, regularY, regularWidth, regularHeight}).toEqual({
      regularX: 4,
      regularY: 9,
      regularWidth: uiShapeMetrics.iconActionSlot,
      regularHeight: uiShapeMetrics.controlHeight,
    })
    expect({radius: regularStyle.radius, borderWidth: regularStyle.borderWidth}).toEqual({
      radius: uiShapeMetrics.lowRadius,
      borderWidth: uiShapeMetrics.borderWidth,
    })
    expect(regularStyle.fill).toMatchObject(initialColor)
    expect(regularStyle.border).toEqual(palette.borderDim)
    expect(regular.roundedRects[1]?.[0]).toBe(29)
    expect(regular.roundedRects[1]?.[2]).toBe(95)

    const compact = new RecordingSurface()
    ColorInput(compact, 4, 6, 120, 22, colorProps(() => {}, {density: "compact"}))
    const [compactX, compactY, compactWidth, compactHeight, compactStyle] = compact.roundedRects[0]!
    expect({compactX, compactY, compactWidth, compactHeight}).toEqual({
      compactX: 4,
      compactY: 6,
      compactWidth: uiShapeMetrics.iconActionSlot,
      compactHeight: uiShapeMetrics.controlHeight,
    })
    expect({radius: compactStyle.radius, borderWidth: compactStyle.borderWidth}).toEqual({
      radius: uiShapeMetrics.lowRadius,
      borderWidth: uiShapeMetrics.borderWidth,
    })
    expect(compactStyle.fill).toMatchObject(initialColor)
    expect(compact.roundedRects[1]?.[0]).toBe(29)
    expect(compact.roundedRects[1]?.[2]).toBe(95)
    expect(compact.roundedRects[1]?.[4].radius).toBe(uiShapeMetrics.lowRadius)
  })

  test("returns the same controlled value standalone and through regular and compact Field", () => {
    const standaloneValues: ColorInputValue[] = []
    const regularFieldValues: ColorInputValue[] = []
    const compactFieldValues: ColorInputValue[] = []

    const standalone = new RecordingSurface()
    ColorInput(standalone, 0, 0, 120, 28, colorProps((value) => standaloneValues.push(value), {
      key: "standalone",
    }))
    submit(standalone, "standalone", "#33669980")

    const definition = (onChange: (value: ColorInputValue) => void): ColorFieldDefinition => ({
      id: "field",
      label: "Color",
      kind: "color",
      value: initialColor,
      onChange,
    })

    const regularField = new RecordingSurface()
    Field(regularField, 0, 0, 120, definition((value) => regularFieldValues.push(value)))
    submit(regularField, "field:field", "#33669980")

    const compactField = new RecordingSurface()
    Field(compactField, 0, 0, 120, definition((value) => compactFieldValues.push(value)), {density: "compact"})
    submit(compactField, "field:field", "#33669980")

    expect(standaloneValues).toEqual([{r: 0.2, g: 0.4, b: 0.6, a: 128 / 255}])
    expect(regularFieldValues).toEqual(standaloneValues)
    expect(compactFieldValues).toEqual(standaloneValues)
  })
})
