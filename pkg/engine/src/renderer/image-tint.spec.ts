import {describe, expect, test} from "bun:test"
import {Mesh} from "../core/Mesh"
import {TexturedPlaneGeometry} from "../geometries/TexturedPlaneGeometry"
import {Color} from "../math/Color"
import {Matrix4} from "../math/Matrix4"
import {ImageMaterial} from "../materials/ImageMaterial"
import {Renderer} from "./index"

type RendererProbe = {
  perObjectDataCPU: Float32Array
  updateMeshData(mesh: Mesh, worldMatrix: Matrix4, offsetFloats: number): void
}

describe("ImageMaterial renderer packing", () => {
  test("uploads tint independently from clip, view-box and image parameters", () => {
    const material = new ImageMaterial({
      src: "icon.svg",
      tint: new Color(0.25, 0.5, 0.75, 0.4),
      opacity: 0.6,
      fit: "contain",
      viewBox: {x: 0.1, y: 0.2, w: 0.3, h: 0.4},
      boxAspect: 2,
    })
    material.clipBounds = [3, 4, 30, 40]
    const mesh = new Mesh(new TexturedPlaneGeometry({width: 20, height: 10}), material)
    const renderer = new Renderer() as unknown as RendererProbe
    renderer.perObjectDataCPU = new Float32Array(64)

    renderer.updateMeshData(mesh, new Matrix4(), 0)

    expect([...renderer.perObjectDataCPU.slice(32, 36)]).toEqual([0.25, 0.5, 0.75, 0.4000000059604645])
    expect([...renderer.perObjectDataCPU.slice(36, 40)]).toEqual(material.clipBounds)
    expect([...renderer.perObjectDataCPU.slice(40, 44)]).toEqual([
      0.10000000149011612,
      0.20000000298023224,
      0.30000001192092896,
      0.4000000059604645,
    ])
    expect([...renderer.perObjectDataCPU.slice(44, 47)]).toEqual([0.6000000238418579, 2, 1])
  })
})
