import {describe, expect, test} from "bun:test"
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

class RecordingSurface extends BaseUiSurface {
  readonly planes: Array<Readonly<{x: number; y: number; w: number; h: number; options: ColorPickerPlaneDrawOptions}>> = []
  readonly hits: HitCall[] = []

  override drawColorPickerPlane(
    x: number,
    y: number,
    w: number,
    h: number,
    options: ColorPickerPlaneDrawOptions,
  ): void {
    this.planes.push({x, y, w, h, options})
  }

  override drawRoundedRect(): void {}

  override hit(...args: HitCall): void {
    this.hits.push(args)
  }

  protected render(): void {}
}

const pointerOptions = (hit: HitCall): HitOptions => {
  const options = hit[5]
  expect(typeof options).toBe("object")
  return options as HitOptions
}

const value = Object.freeze({h: 0.25, s: 0.5, v: 0.75, a: 0.4}) satisfies ColorPickerValue

describe("Component-internal color picker plane", () => {
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
