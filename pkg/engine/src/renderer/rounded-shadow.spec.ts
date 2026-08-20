import {describe, expect, test} from "bun:test"
import {Mesh} from "../core/Mesh"
import {PlaneGeometry} from "../geometries/PlaneGeometry"
import {Matrix4} from "../math/Matrix4"
import {RoundedRectMaterial} from "../materials/RoundedRectMaterial"
import {Renderer} from "./index"
import roundedShader from "./shaders/rounded.wgsl"

type RendererProbe = {
  perObjectDataCPU: Float32Array
  updateMeshData(mesh: Mesh, worldMatrix: Matrix4, offsetFloats: number): void
}

const uploadedParams = (material: RoundedRectMaterial): number[] => {
  const mesh = new Mesh(new PlaneGeometry({width: 1, height: 1}), material)
  const renderer = new Renderer() as unknown as RendererProbe
  renderer.perObjectDataCPU = new Float32Array(64)
  renderer.updateMeshData(mesh, new Matrix4(), 0)
  return [...renderer.perObjectDataCPU.slice(48, 52)]
}

describe("RoundedRectMaterial analytical shadow", () => {
  test("uploads explicit transparent fill alpha and keeps border/shader alpha authoritative", () => {
    const material = new RoundedRectMaterial({
      width: 2,
      height: 1,
      radius: {tl: 0.1, tr: 0.2, br: 0.3, bl: 0.4},
      fill: null,
      border: 0x6699cc,
      borderWidth: 0.05,
    })
    const mesh = new Mesh(new PlaneGeometry({width: 2, height: 1}), material)
    const renderer = new Renderer() as unknown as RendererProbe
    renderer.perObjectDataCPU = new Float32Array(64)
    renderer.updateMeshData(mesh, new Matrix4(), 0)

    expect([...renderer.perObjectDataCPU.slice(32, 36)]).toEqual([1, 1, 1, 0])
    expect(renderer.perObjectDataCPU[39]).toBe(1)
    expect([...renderer.perObjectDataCPU.slice(44, 48)]).toEqual([0.1, 0.2, 0.3, 0.4].map(Math.fround))
    expect(roundedShader).toContain("perObject.fill.rgb * fillStrength * perObject.fill.a")
    expect(roundedShader).toContain("fillStrength * perObject.fill.a + borderStrength * perObject.border.a")
  })

  test("preserves ordinary uniform packing and uses the existing spare params", () => {
    const ordinary = new RoundedRectMaterial({
      width: 2,
      height: 1,
      radius: 0.2,
      borderWidth: 0.05,
      opacity: 0.75,
    })
    const shadow = new RoundedRectMaterial({
      width: 2,
      height: 1,
      radius: 0.2,
      opacity: 0.5,
      shadowBlur: 0.25,
      shadowSpread: 0.125,
    })

    const ordinaryParams = uploadedParams(ordinary)
    expect(ordinaryParams[0]).toBeCloseTo(0.05)
    expect(ordinaryParams.slice(1)).toEqual([0.75, 0, 0])
    expect(uploadedParams(shadow)).toEqual([0, 0.5, 0.25, 0.125])
  })

  test("keeps the ordinary rounded branch and adds one texture-free analytical fade", () => {
    expect(roundedShader).toContain("let dOuter = sdRoundBox(p, halfSize, radii);")
    expect(roundedShader).toContain("let outerMask = 1.0 - smoothstep(-aa, aa, dOuter);")
    expect(roundedShader).toContain("if (borderWidth <= 0.0)")
    expect(roundedShader).toContain("let shadowBlur = perObject.params.z;")
    expect(roundedShader).toContain("let shadowSpread = perObject.params.w;")
    expect(roundedShader).toContain("let shadowDistance = dOuter - shadowSpread;")
    expect(roundedShader).toContain("smoothstep(-shadowBlur, shadowBlur, shadowDistance)")
    expect(roundedShader).not.toContain("max(shadowBlur, aa)")
    expect(roundedShader.match(/@binding\(/g)).toHaveLength(2)
    expect(roundedShader).not.toContain("texture_2d")
    expect(roundedShader).not.toContain("textureSample")
    expect(roundedShader).not.toContain("sampler")
  })
})
