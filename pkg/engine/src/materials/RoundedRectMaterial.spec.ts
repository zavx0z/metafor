import {describe, expect, test} from "bun:test"
import {RoundedRectMaterial} from "./RoundedRectMaterial"

describe("RoundedRectMaterial shadow parameters", () => {
  test("keeps ordinary rounded rectangles on zero shadow defaults", () => {
    const material = new RoundedRectMaterial({
      width: 2,
      height: 1,
      radius: {tl: 0.1, tr: 0.2, br: 0.3, bl: 0.4},
      borderWidth: 0.05,
      opacity: 0.75,
    })

    expect(material.width).toBe(2)
    expect(material.height).toBe(1)
    expect(material.radii).toEqual([0.1, 0.2, 0.3, 0.4])
    expect(material.borderWidth).toBe(0.05)
    expect(material.opacity).toBe(0.75)
    expect(material.shadowBlur).toBe(0)
    expect(material.shadowSpread).toBe(0)
  })

  test("stores finite non-negative local shadow dimensions", () => {
    const material = new RoundedRectMaterial({
      width: 2,
      height: 1,
      radius: 0.2,
      shadowBlur: 0.25,
      shadowSpread: 0.125,
    })
    const invalid = new RoundedRectMaterial({
      width: 2,
      height: 1,
      radius: 0.2,
      shadowBlur: Number.NaN,
      shadowSpread: Number.POSITIVE_INFINITY,
    })
    const negative = new RoundedRectMaterial({
      width: 2,
      height: 1,
      radius: 0.2,
      shadowBlur: -1,
      shadowSpread: -2,
    })

    expect(material.shadowBlur).toBe(0.25)
    expect(material.shadowSpread).toBe(0.125)
    expect(invalid.shadowBlur).toBe(0)
    expect(invalid.shadowSpread).toBe(0)
    expect(negative.shadowBlur).toBe(0)
    expect(negative.shadowSpread).toBe(0)
  })
})
