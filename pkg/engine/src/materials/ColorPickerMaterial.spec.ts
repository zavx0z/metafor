import {describe, expect, test} from "bun:test"
import {Color} from "../math/Color"
import {ColorPickerMaterial} from "./ColorPickerMaterial"

describe("ColorPickerMaterial", () => {
  test("normalizes analytical picker inputs without allocating texture state", () => {
    const material = new ColorPickerMaterial({
      width: Number.NaN,
      height: -2,
      mode: "alpha",
      hue: -0.25,
      saturation: 2,
      value: -1,
      alpha: Number.POSITIVE_INFINITY,
      opacity: 0.4,
      checkerPrimary: new Color(0.2, 0.2, 0.2, 1),
      checkerSecondary: new Color(0.15, 0.15, 0.15, 1),
      checkerSize: 0.008,
    })

    expect(material.width).toBe(0)
    expect(material.height).toBe(0)
    expect(material.mode).toBe("alpha")
    expect(material.hue).toBe(0.75)
    expect(material.saturation).toBe(1)
    expect(material.value).toBe(0)
    expect(material.alpha).toBe(0)
    expect(material.opacity).toBe(0.4)
    expect(material.checkerPrimary).toEqual(new Color(0.2, 0.2, 0.2, 1))
    expect(material.checkerSecondary).toEqual(new Color(0.15, 0.15, 0.15, 1))
    expect(material.checkerSize).toBe(0.008)
    expect(material.clipBounds).toBeNull()
    expect(Object.keys(material).some((key) => /texture|sampler|framebuffer/i.test(key))).toBeFalse()
  })
})
