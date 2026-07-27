import {describe, expect, test} from "bun:test"
import {Color} from "../math"
import {LineGlowMaterial} from "./LineGlowMaterial"

describe("LineGlowMaterial GPU effect controls", () => {
  test("keeps ordinary line materials neutral by default", () => {
    const material = new LineGlowMaterial()

    expect(material.luminanceBoost).toBe(1)
    expect(material.shimmerAmount).toBe(0)
    expect(material.shimmerPhase).toBe(0)
  })

  test("stores bounded marker luminance and shimmer as scalar uniforms", () => {
    const material = new LineGlowMaterial({
      color: new Color(0.7, 0.8, 1, 1),
      glowColor: new Color(0.9, 0.95, 1, 0.9),
      glowIntensity: 4.8,
      luminanceBoost: 1.45,
      shimmerAmount: 0.13,
      shimmerPhase: Math.PI,
    })

    expect(material.luminanceBoost).toBe(1.45)
    expect(material.shimmerAmount).toBe(0.13)
    expect(material.shimmerPhase).toBe(Math.PI)
    expect(Array.isArray(material.shimmerAmount)).toBe(false)
  })
})
