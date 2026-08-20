import {describe, expect, test} from "bun:test"
import {Mesh} from "../core/Mesh"
import {PlaneGeometry} from "../geometries/PlaneGeometry"
import {Matrix4} from "../math/Matrix4"
import {Color} from "../math/Color"
import {ColorPickerMaterial} from "../materials/ColorPickerMaterial"
import {Renderer} from "./index"

type RendererProbe = {
  perObjectDataCPU: Float32Array
  updateMeshData(mesh: Mesh, worldMatrix: Matrix4, offsetFloats: number): void
}

describe("ColorPickerMaterial renderer packing", () => {
  test("uploads HSVA, mode, opacity and clip into one per-object block", () => {
    const material = new ColorPickerMaterial({
      width: 0.12,
      height: 0.014,
      mode: "swatch",
      hue: 0.75,
      saturation: 0.5,
      value: 0.25,
      alpha: 0.6,
      opacity: 0.8,
      checkerPrimary: new Color(0.2, 0.2, 0.2, 1),
      checkerSecondary: new Color(0.15, 0.15, 0.15, 1),
      checkerSize: 0.008,
    })
    material.clipBounds = [2, 3, 40, 50]
    const mesh = new Mesh(new PlaneGeometry({width: material.width, height: material.height}), material)
    const renderer = new Renderer() as unknown as RendererProbe
    renderer.perObjectDataCPU = new Float32Array(64)

    renderer.updateMeshData(mesh, new Matrix4(), 0)

    expect([...renderer.perObjectDataCPU.slice(32, 36)]).toEqual([0.75, 0.5, 0.25, 0.6000000238418579])
    expect([...renderer.perObjectDataCPU.slice(36, 40)]).toEqual([0.11999999731779099, 0.014000000432133675, 3, 0.800000011920929])
    expect([...renderer.perObjectDataCPU.slice(40, 44)]).toEqual([0.20000000298023224, 0.20000000298023224, 0.20000000298023224, 1])
    expect([...renderer.perObjectDataCPU.slice(44, 48)]).toEqual([0.15000000596046448, 0.15000000596046448, 0.15000000596046448, 1])
    expect(renderer.perObjectDataCPU[48]).toBeCloseTo(0.008)
    expect([...renderer.perObjectDataCPU.slice(52, 56)]).toEqual(material.clipBounds)
  })

  test("packs value mode independently from retained hue and saturation inputs", () => {
    const material = new ColorPickerMaterial({
      width: 0.014,
      height: 0.12,
      mode: "value",
      hue: 0.9,
      saturation: 0.85,
      value: 0.4,
      alpha: 0.7,
      checkerPrimary: new Color(0.2, 0.2, 0.2, 1),
      checkerSecondary: new Color(0.15, 0.15, 0.15, 1),
      checkerSize: 0.008,
    })
    const mesh = new Mesh(new PlaneGeometry({width: material.width, height: material.height}), material)
    const renderer = new Renderer() as unknown as RendererProbe
    renderer.perObjectDataCPU = new Float32Array(64)

    renderer.updateMeshData(mesh, new Matrix4(), 0)

    expect([...renderer.perObjectDataCPU.slice(32, 36)]).toEqual([
      0.8999999761581421,
      0.8500000238418579,
      0.4000000059604645,
      0.699999988079071,
    ])
    expect(renderer.perObjectDataCPU[38]).toBe(1)
  })
})
