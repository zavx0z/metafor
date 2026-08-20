import {describe, expect, test} from "bun:test"
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
    })

    expect(material.width).toBe(0)
    expect(material.height).toBe(0)
    expect(material.mode).toBe("alpha")
    expect(material.hue).toBe(0.75)
    expect(material.saturation).toBe(1)
    expect(material.value).toBe(0)
    expect(material.alpha).toBe(0)
    expect(material.opacity).toBe(0.4)
    expect(material.clipBounds).toBeNull()
    expect(Object.keys(material).some((key) => /texture|sampler|framebuffer/i.test(key))).toBeFalse()
  })
})
