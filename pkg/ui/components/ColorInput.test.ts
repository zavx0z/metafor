import {describe, expect, test} from "bun:test"
import {
  select,
  uiShapeMetrics,
  type ColorPickerPlaneDrawOptions,
  type DismissableLayerOptions,
  type UiSurfaceRect,
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
  readonly dismissables: DismissableLayerOptions[] = []
  readonly scope: object

  constructor(scope: object = {}) {
    super({bgColor: null, borderColor: null})
    this.scope = scope
  }

  override drawRoundedRect(...args: RoundedRectCall): void {
    this.roundedRects.push(args)
  }

  override drawRoundedShadow(): void {}

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

  override interactionViewport(): UiSurfaceRect {
    return {x: 0, y: 0, w: 320, h: 240}
  }

  override interactionScope(): object {
    return this.scope
  }

  override dismissableLayer(options: DismissableLayerOptions): void {
    this.dismissables.push(options)
  }

  override pushClip(): void {}

  override popClip(): void {}

  protected render(): void {}
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
  })

  test("suppresses mutating input for disabled and read-only states", () => {
    const values: ColorInputValue[] = []
    for (const state of [{disabled: true}, {readOnly: true}] as const) {
      const surface = new RecordingSurface()
      ColorInput(surface, 0, 0, 120, 28, colorProps((value) => values.push(value), state))
      expect(surface.hits).toHaveLength(0)
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
    expect(surface.pickerPlanes.map(({options}) => options.mode)).toEqual(["swatch"])
    surface.hits[0]?.[4]()
    expect(openStates).toEqual([true])

    ColorInput(surface, 0, 0, 146, 22, props)
    expect(surface.pickerPlanes.map(({options}) => options.mode)).toEqual(["swatch", "swatch", "wheel", "value", "swatch"])
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
    expect(surface.pickerPlanes).toHaveLength(planesBeforePersistentRender + 4)
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
    expect(surface.pickerPlanes).toHaveLength(planesBeforeClosedRender + 1)
  })

  test("supports deterministic controlled open and blocks it while disabled or read-only", () => {
    const states: boolean[] = []
    const open = new RecordingSurface()
    ColorInput(open, 0, 0, 146, 22, colorProps(() => {}, {
      open: true,
      onOpenChange: (value) => states.push(value),
    }))
    expect(open.pickerPlanes.map(({options}) => options.mode)).toEqual(["swatch", "wheel", "value", "swatch"])

    for (const state of [{disabled: true}, {readOnly: true}] as const) {
      const surface = new RecordingSurface()
      ColorInput(surface, 0, 0, 146, 22, colorProps(() => {}, {...state, open: true}))
      expect(surface.pickerPlanes.map(({options}) => options.mode)).toEqual(["swatch"])
    }
    expect(states).toEqual([])
  })

  test("separates compact popover from expanded inline composition without unproven alpha or hex UI", () => {
    const compact = new RecordingSurface()
    ColorInput(compact, 10, 12, 146, 22, colorProps(() => {}, {presentation: "compact", open: true}))
    expect(compact.pickerPlanes.map(({options}) => options.mode)).toEqual(["swatch", "wheel", "value", "swatch"])
    expect(compact.dismissables).toHaveLength(1)

    const expanded = new RecordingSurface()
    ColorInput(expanded, 10, 12, 146, 137, colorProps(() => {}, {presentation: "expanded"}))
    expect(expanded.pickerPlanes.map(({options}) => options.mode)).toEqual(["wheel", "value", "swatch"])
    expect(expanded.dismissables).toHaveLength(0)
    expect(expanded.hits.some((hit) => {
      const options = hit[5]
      return typeof options === "object" && String(options.key).includes("picker-hex")
    })).toBeFalse()
  })

  test("shares one active popover root chain with Elements Select", () => {
    const scope = {}
    const selectSurface = new RecordingSurface(scope)
    const colorSurface = new RecordingSurface(scope)
    const selectOpen: boolean[] = []
    const colorOpen: boolean[] = []
    const selectProps = {
      key: "shared-select",
      value: "one",
      options: [{value: "one", label: "One"}],
      onOpenChange: (open: boolean) => selectOpen.push(open),
    }
    select(selectSurface, 0, 0, 120, 22, selectProps)
    selectSurface.hits[0]?.[4]()
    select(selectSurface, 0, 0, 120, 22, selectProps)
    expect(selectOpen).toEqual([true])

    const colorPropsWithScope = colorProps(() => {}, {onOpenChange: (open) => colorOpen.push(open)})
    ColorInput(colorSurface, 0, 0, 120, 22, colorPropsWithScope)
    colorSurface.hits[0]?.[4]()
    expect(selectOpen).toEqual([true, false])
    expect(colorOpen).toEqual([true])
  })

  test("draws the normalized current color through the exact checker shader", () => {
    const regular = new RecordingSurface()
    ColorInput(regular, 4, 6, 120, 28, colorProps(() => {}))
    expect(regular.pickerPlanes.map(({x, y, w, h, options}) => ({x, y, w, h, mode: options.mode}))).toEqual([
      {x: 5, y: 10, w: 118, h: 20, mode: "swatch"},
    ])

    const compact = new RecordingSurface()
    ColorInput(compact, 4, 6, 120, 22, colorProps(() => {}, {density: "compact"}))
    expect(compact.pickerPlanes.map(({x, y, w, h, options}) => ({x, y, w, h, mode: options.mode}))).toEqual([
      {x: 5, y: 7, w: 118, h: 20, mode: "swatch"},
    ])
  })

  test("returns the same controlled value standalone and through regular and compact Field", () => {
    const standaloneValues: ColorInputValue[] = []
    const regularFieldValues: ColorInputValue[] = []
    const compactFieldValues: ColorInputValue[] = []

    const publishWheel = (surface: RecordingSurface, draw: () => void): void => {
      draw()
      const trigger = surface.hits.find((hit) => {
        const options = hit[5]
        return typeof options === "object" && String(options.key).endsWith(":swatch")
      })
      trigger?.[4]()
      draw()
      const wheel = surface.hits.find((hit) => {
        const options = hit[5]
        return typeof options === "object" && String(options.key).endsWith(":wheel")
      })
      const options = wheel?.[5]
      if (wheel !== undefined && typeof options === "object") {
        options.onPointerDown?.(wheel[0] + wheel[2], wheel[1] + wheel[3] / 2, {} as MouseEvent)
      }
    }

    const standalone = new RecordingSurface()
    publishWheel(standalone, () => ColorInput(standalone, 0, 0, 120, 22, colorProps((value) => standaloneValues.push(value), {
      key: "standalone",
    })))

    const definition = (onChange: (value: ColorInputValue) => void): ColorFieldDefinition => ({
      id: "field",
      label: "Color",
      kind: "color",
      value: initialColor,
      onChange,
    })

    const regularField = new RecordingSurface()
    publishWheel(regularField, () => Field(regularField, 0, 0, 120, definition((value) => regularFieldValues.push(value))))

    const compactField = new RecordingSurface()
    publishWheel(compactField, () => Field(compactField, 0, 0, 120, definition((value) => compactFieldValues.push(value)), {density: "compact"}))

    expect(standaloneValues).toEqual([{r: 1, g: 0, b: 0, a: 0.25}])
    expect(regularFieldValues).toEqual(standaloneValues)
    expect(compactFieldValues).toEqual(standaloneValues)
  })
})
