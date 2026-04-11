import { describe, expect, test } from "bun:test"
import { resolveSurfaceLabelCurveRadius, resolveSurfaceLabelTextScale } from "./surface-label"

describe("bulk surface label scale", () => {
  test("shell использует внешнюю дугу тора вместо внутренней", () => {
    const radius = resolveSurfaceLabelCurveRadius({
      kind: "shell",
      offset: 40,
      shellRadius: 1250,
      shellTube: 750,
    })

    expect(radius).toBe(2040)
  })

  test("shell не ужимается сильнее peer sphere при одинаковом тексте", () => {
    const maxTextWidth = 720
    const options = {
      maxUvLabelSpanRad: Math.PI * 0.8,
      minScale: 0.2,
    }

    const shellScale = resolveSurfaceLabelTextScale(
      {
        kind: "shell",
        offset: 40,
        shellRadius: 1250,
        shellTube: 750,
      },
      maxTextWidth,
      options,
    )

    const fieldScale = resolveSurfaceLabelTextScale(
      {
        kind: "field",
        offset: 40,
        sphereRadius: 200,
      },
      maxTextWidth,
      options,
    )

    expect(shellScale).toBe(1)
    expect(fieldScale).toBeLessThanOrEqual(shellScale)
  })
})
