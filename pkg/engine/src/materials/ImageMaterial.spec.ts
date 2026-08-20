import {describe, expect, test} from "bun:test"
import {Color} from "../math/Color"
import {ImageMaterial} from "./ImageMaterial"

describe("ImageMaterial tint", () => {
  test("defaults to neutral white and preserves an explicit RGBA multiplier", () => {
    const neutral = new ImageMaterial({src: "icon.svg"})
    expect([neutral.tint.r, neutral.tint.g, neutral.tint.b, neutral.tint.a]).toEqual([1, 1, 1, 1])

    const tint = new Color(0.25, 0.5, 0.75, 0.4)
    const tinted = new ImageMaterial({src: "icon.svg", tint})
    expect(tinted.tint).not.toBe(tint)
    expect([tinted.tint.r, tinted.tint.g, tinted.tint.b, tinted.tint.a]).toEqual([0.25, 0.5, 0.75, 0.4])
  })
})
