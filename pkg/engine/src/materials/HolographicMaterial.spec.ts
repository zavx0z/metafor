import {describe, expect, test} from "bun:test"
import {Color} from "../math"
import {HolographicMaterial} from "./HolographicMaterial"

describe("HolographicMaterial", () => {
  test("bounds its one-pass surface parameters", () => {
    const material = new HolographicMaterial({
      color: new Color(0.1, 0.4, 0.9),
      opacity: 2,
      irregularity: 2,
      rimStrength: 99,
      scanDensity: 99,
      scanSharpness: -1,
      bandRadius: -2,
      bandHalfWidth: -3,
    })

    expect(material.isGlassMaterial).toBe(true)
    expect(material.color).toEqual(new Color(0.1, 0.4, 0.9))
    expect(material.opacity).toBe(1)
    expect(material.irregularity).toBe(1)
    expect(material.rimStrength).toBe(8)
    expect(material.scanDensity).toBe(8)
    expect(material.scanSharpness).toBe(0)
    expect(material.bandRadius).toBe(0)
    expect(material.bandHalfWidth).toBe(0)
  })

  test("does not retain mutable caller colors", () => {
    const color = new Color(0.2, 0.7, 1)
    const material = new HolographicMaterial({color})

    color.setRGB(1, 0, 0)

    expect(material.color).toEqual(new Color(0.2, 0.7, 1))
  })

  test("uses an emissive additive pipeline without reflective Fresnel", async () => {
    const [renderer, shader] = await Promise.all([
      Bun.file(new URL("../renderer/index.ts", import.meta.url)).text(),
      Bun.file(
        new URL("../renderer/shaders/holographic.wgsl", import.meta.url),
      ).text(),
    ])
    const pipelineStart = renderer.indexOf('label: "HolographicMaterial"')
    const pipeline = renderer.slice(
      pipelineStart,
      renderer.indexOf("this.uiBasicMeshPipeline", pipelineStart),
    )

    expect(pipeline).toContain('dstFactor: "one"')
    expect(shader).toContain("let emission =")
    expect(shader).toContain("let silhouette =")
    expect(shader).toContain("let edgeHalo =")
    expect(shader).toContain("let edgeCore =")
    expect(shader).not.toContain("fresnel")
    expect(shader).not.toContain("smoothstep")
    expect(shader).not.toContain("atan2")
    expect(shader).not.toContain("let orbital =")
  })
})
