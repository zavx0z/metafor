import {describe, expect, test} from "bun:test"
import {Color} from "@metafor/engine"
import {
  blenderRgba8ToColor,
  blenderTheme,
  UiSurface as BaseUiSurface,
  type ColorPickerPlaneDrawOptions,
  type HitOptions,
  type UiSurface,
} from "@ui/elements"
import {
  colorPickerPlane,
  type ColorPickerValue,
} from "./color-picker.ts"

type HitCall = Parameters<UiSurface["hit"]>
type RoundedRectCall = Parameters<UiSurface["drawRoundedRect"]>

class RecordingSurface extends BaseUiSurface {
  readonly planes: Array<Readonly<{x: number; y: number; w: number; h: number; options: ColorPickerPlaneDrawOptions}>> = []
  readonly hits: HitCall[] = []
  readonly markers: RoundedRectCall[] = []

  override drawColorPickerPlane(
    x: number,
    y: number,
    w: number,
    h: number,
    options: ColorPickerPlaneDrawOptions,
  ): void {
    this.planes.push({x, y, w, h, options})
  }

  override drawRoundedRect(...args: RoundedRectCall): void {
    this.markers.push(args)
  }

  override hit(...args: HitCall): void {
    this.hits.push(args)
  }

  protected render(): void {}
}

class PressedRecordingSurface extends RecordingSurface {
  override hitState(): Readonly<{hovered: boolean; pressed: boolean}> {
    return {hovered: true, pressed: true}
  }
}

const pointerOptions = (hit: HitCall): HitOptions => {
  const options = hit[5]
  expect(typeof options).toBe("object")
  return options as HitOptions
}

const value = Object.freeze({h: 0.25, s: 0.5, v: 0.75, a: 0.4}) satisfies ColorPickerValue

describe("Component-internal color picker plane", () => {
  test("uses ui_hsv_cursor RGB fill and value-derived black/white contrast without palette aliases", async () => {
    const surface = new RecordingSurface()
    colorPickerPlane(surface, 10, 20, 100, 100, {
      key: "color:wheel-material",
      mode: "wheel",
      value,
    })

    expect(surface.markers).toHaveLength(2)
    expect(surface.markers[0]?.slice(0, 4)).toEqual([53.5, 88.5, 13, 13])
    expect(surface.markers[0]?.[4]).toMatchObject({
      radius: 6.5,
      fill: new Color(0.5625, 0.75, 0.375, 1),
      border: new Color(0, 0, 0, 0.375),
      borderWidth: 1,
      opacity: 1,
    })
    expect(surface.markers[1]?.slice(0, 4)).toEqual([54, 89, 12, 12])
    expect(surface.markers[1]?.[4]).toMatchObject({
      radius: 6,
      fill: new Color(0.5625, 0.75, 0.375, 1),
      border: new Color(1, 1, 1, 0.45),
      borderWidth: 1,
      opacity: 1,
    })

    const dark = new RecordingSurface()
    colorPickerPlane(dark, 0, 0, 20, 20, {mode: "wheel", value: {...value, v: 0}})
    expect((dark.markers[0]?.[4].border as Color).a).toBe(0)
    expect((dark.markers[1]?.[4].border as Color).a).toBe(0.8)
    const light = new RecordingSurface()
    colorPickerPlane(light, 0, 0, 20, 20, {mode: "wheel", value: {...value, v: 1}})
    expect((light.markers[0]?.[4].border as Color).a).toBe(0.5)
    expect((light.markers[1]?.[4].border as Color).a).toBeCloseTo(0.2)

    const source = await Bun.file(new URL("./color-picker.ts", import.meta.url)).text()
    expect(source).not.toContain("palette")
    expect(source).toContain("1 - value.v + 0.2")
    expect(source).toContain("value.v / 2")
  })

  test("grows the active wheel cursor and uses the narrow black/white slider indicator", () => {
    const pressed = new PressedRecordingSurface()
    colorPickerPlane(pressed, 10, 20, 100, 100, {key: "pressed-wheel", mode: "wheel", value})
    expect(pressed.markers.map((call) => call.slice(2, 4))).toEqual([[21, 21], [20, 20]])

    const slider = new RecordingSurface()
    colorPickerPlane(slider, 0, 10, 14, 100, {key: "value-slider", mode: "value", value})
    expect(slider.markers).toHaveLength(2)
    expect(slider.markers[0]?.[4]).toMatchObject({
      fill: new Color(0, 0, 0, 1),
      border: null,
      opacity: 1,
    })
    expect(slider.markers[1]?.[4]).toMatchObject({
      fill: null,
      border: new Color(1, 1, 1, 1),
      borderWidth: 1,
      opacity: 1,
    })
  })

  test("draws one bounded shader plane and publishes immutable wheel values on every drag step", () => {
    const surface = new RecordingSurface()
    const values: ColorPickerValue[] = []

    colorPickerPlane(surface, 10, 20, 100, 100, {
      key: "color:wheel",
      mode: "wheel",
      value,
      onChange: (next) => values.push(next),
    })

    expect(surface.planes).toHaveLength(1)
    expect(surface.planes[0]).toMatchObject({x: 10, y: 20, w: 100, h: 100, options: {mode: "wheel"}})
    expect(surface.planes[0]?.options).toMatchObject({
      checkerPrimary: blenderRgba8ToColor(blenderTheme.material.checkerPrimary),
      checkerSecondary: blenderRgba8ToColor(blenderTheme.material.checkerSecondary),
      checkerSize: blenderTheme.material.checkerSize,
    })
    expect(surface.hits).toHaveLength(1)
    const pointer = pointerOptions(surface.hits[0]!)
    pointer.onPointerDown?.(110, 70, {} as MouseEvent)
    pointer.onPointerMove?.(60, 120, {} as MouseEvent)

    expect(values).toEqual([
      {h: 0, s: 1, v: 0.75, a: 0.4},
      {h: 0.25, s: 1, v: 0.75, a: 0.4},
    ])
    expect(values.every((next) => Object.isFrozen(next))).toBeTrue()
    expect(value).toEqual({h: 0.25, s: 0.5, v: 0.75, a: 0.4})
  })

  test("maps value and alpha sliders vertically without cross-channel mutation", () => {
    const surface = new RecordingSurface()
    const values: ColorPickerValue[] = []
    for (const mode of ["value", "alpha"] as const) {
      colorPickerPlane(surface, 0, 10, 14, 100, {
        key: `color:${mode}`,
        mode,
        value,
        onChange: (next) => values.push(next),
      })
      pointerOptions(surface.hits.at(-1)!).onPointerDown?.(7, 35, {} as MouseEvent)
    }

    expect(values).toEqual([
      {h: 0.25, s: 0.5, v: 0.75, a: 0.4},
      {h: 0.25, s: 0.5, v: 0.75, a: 0.75},
    ])
    expect(values.every((next) => Object.isFrozen(next))).toBeTrue()
  })

  test("keeps disabled planes visible without registering a mutating hit", () => {
    const surface = new RecordingSurface()
    colorPickerPlane(surface, 0, 0, 100, 100, {mode: "wheel", value, disabled: true})

    expect(surface.planes).toHaveLength(1)
    expect(surface.planes[0]?.options.opacity).toBeLessThan(1)
    expect(surface.hits).toHaveLength(0)
  })
})
