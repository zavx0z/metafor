import { describe, expect, test } from "bun:test"
import { Color, Vector3 } from "@metafor/engine"
import { GlassBillboard } from "./GlassBillboard.ts"

describe("ui GlassBillboard", () => {
  test("stores explicit size and visual controls", () => {
    const billboard = new GlassBillboard({
      width: 320,
      height: 180,
      opacity: 0.4,
      matte: 0.6,
    })

    expect(billboard.width).toBe(320)
    expect(billboard.height).toBe(180)
    expect(billboard.material.opacity).toBe(0.4)
    expect(billboard.material.matte).toBe(0.6)
  })

  test("can face camera without changing its position", () => {
    const billboard = new GlassBillboard({ width: 100, height: 100 })
    billboard.position.set(10, 20, 30)
    billboard.faceCamera(new Vector3(10, -100, 30))

    expect(billboard.position.x).toBe(10)
    expect(billboard.position.y).toBe(20)
    expect(billboard.position.z).toBe(30)
    expect(billboard.quaternion.w).not.toBe(0)
  })

  test("updates visual colors in place", () => {
    const billboard = new GlassBillboard()
    billboard.setVisual({
      tintColor: new Color(0.2, 0.3, 0.4),
      borderOpacity: 0.5,
    })

    expect(billboard.material.tintColor.r).toBeCloseTo(0.2, 6)
    expect(billboard.borderMaterial.opacity).toBe(0.5)
  })
})
