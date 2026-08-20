import {beforeAll, describe, expect, test} from "bun:test"
import {
  BufferGeometry,
  Color,
  Mesh,
  Object3D,
  RoundedRectMaterial,
  TrueTypeFont,
} from "@metafor/engine"
import type {UiRuntime} from "./runtime.ts"
import {UiSurface} from "./surface.ts"

class ShadowTestSurface extends UiSurface {
  constructor() {
    super({bgColor: null, borderColor: null})
  }

  createParent(): Object3D {
    return this.createRetainedParent()
  }

  materialize(parent: Object3D, draw: () => void): void {
    this.materializeRetainedParent(parent, draw)
  }

  transform(parent: Object3D, update: (parent: Object3D) => void): void {
    this.updateRetainedTransform(parent, update)
  }

  setViewportClip(parent: Object3D, rect: Readonly<{x: number; y: number; w: number; h: number}>): void {
    this.updateRetainedViewportClip(parent, rect)
  }

  mainLayer(): Object3D {
    return this.node.getObjectByName(`${this.constructor.name}.layer`)!
  }

  protected render(): void {}
}

type FakeRuntime = {
  runtime: UiRuntime
  invalidated: BufferGeometry[]
  frameCount(): number
}

const createFakeRuntime = (): FakeRuntime => {
  const invalidated: BufferGeometry[] = []
  let frames = 0
  const runtime = {
    canvas: {style: {}},
    renderer: {
      pixelRatio: 1,
      invalidateGeometry: (geometry: BufferGeometry) => invalidated.push(geometry),
    },
    requestRender: () => {
      frames += 1
    },
    uiRectToFramebufferClipBounds: (
      xMin: number,
      yMin: number,
      xMax: number,
      yMax: number,
    ): [number, number, number, number] => [xMin, yMin, xMax, yMax],
  } as unknown as UiRuntime
  return {runtime, invalidated, frameCount: () => frames}
}

const meshExtents = (mesh: Mesh): {xMin: number; xMax: number; yMin: number; yMax: number} => {
  const positions = mesh.geometry.attributes.position!.array
  const xs: number[] = []
  const ys: number[] = []
  for (let index = 0; index < positions.length; index += 3) {
    xs.push(positions[index]!)
    ys.push(positions[index + 1]!)
  }
  return {
    xMin: Math.min(...xs),
    xMax: Math.max(...xs),
    yMin: Math.min(...ys),
    yMax: Math.max(...ys),
  }
}

let font: TrueTypeFont

beforeAll(async () => {
  const bytes = await Bun.file(new URL("../../engine/static/JetBrainsMono-Bold.ttf", import.meta.url)).arrayBuffer()
  font = new TrueTypeFont(bytes)
})

const setupSurface = (): {surface: ShadowTestSurface; fake: FakeRuntime} => {
  const fake = createFakeRuntime()
  const surface = new ShadowTestSurface()
  surface.attachCanvas(fake.runtime)
  surface.setRect({x: 0, y: 0, w: 200, h: 120}, 0.001, font)
  fake.invalidated.length = 0
  return {surface, fake}
}

describe("UiSurface rounded shadow", () => {
  test("keeps ordinary rounded rectangles on their exact unpadded quad", () => {
    const {surface} = setupSurface()
    const layer = surface.mainLayer()

    surface.drawRoundedRect(10, 20, 100, 60, {
      radius: 8,
      fill: new Color(0.2, 0.3, 0.4, 1),
      border: new Color(0.8, 0.9, 1, 1),
      borderWidth: 1,
      opacity: 0.75,
    })

    expect(layer.children).toHaveLength(1)
    const mesh = layer.children[0] as Mesh
    const material = mesh.material as RoundedRectMaterial
    const extents = meshExtents(mesh)
    expect(extents.xMin).toBeCloseTo(-0.05)
    expect(extents.xMax).toBeCloseTo(0.05)
    expect(extents.yMin).toBeCloseTo(-0.03)
    expect(extents.yMax).toBeCloseTo(0.03)
    expect(material.width).toBeCloseTo(0.1)
    expect(material.height).toBeCloseTo(0.06)
    expect(material.shadowBlur).toBe(0)
    expect(material.shadowSpread).toBe(0)
  })

  test("draws one symmetrically padded quad around the original rounded rect", () => {
    const {surface} = setupSurface()
    const layer = surface.mainLayer()

    surface.pushClip(0, 0, 80, 50)
    surface.drawRoundedShadow(10, 20, 100, 60, {
      radius: {tl: 4, tr: 6, br: 8, bl: 10},
      blur: 8,
      spread: 4,
      color: new Color(0.1, 0.2, 0.3, 0.6),
      opacity: 0.4,
      z: -0.03,
    })
    surface.popClip()

    expect(layer.children).toHaveLength(1)
    const mesh = layer.children[0] as Mesh
    const material = mesh.material as RoundedRectMaterial
    expect(mesh).toBeInstanceOf(Mesh)
    expect(material).toBeInstanceOf(RoundedRectMaterial)
    const extents = meshExtents(mesh)
    expect(extents.xMin).toBeCloseTo(-0.062)
    expect(extents.xMax).toBeCloseTo(0.062)
    expect(extents.yMin).toBeCloseTo(-0.042)
    expect(extents.yMax).toBeCloseTo(0.042)
    expect(mesh.position.x).toBeCloseTo(0.06)
    expect(mesh.position.y).toBeCloseTo(-0.05)
    expect(mesh.position.z).toBe(-0.03)
    expect(material.width).toBeCloseTo(0.1)
    expect(material.height).toBeCloseTo(0.06)
    expect(material.radii).toEqual([0.004, 0.006, 0.008, 0.01])
    expect(material.shadowBlur).toBeCloseTo(0.008)
    expect(material.shadowSpread).toBeCloseTo(0.004)
    expect(material.opacity).toBe(0.4)
    expect(material.clipBounds).toEqual([0, 0, 80, 50])
  })

  test("skips invalid or zero-area shadows and bounds the remaining dimensions", () => {
    const {surface} = setupSurface()
    const layer = surface.mainLayer()

    surface.drawRoundedShadow(0, 0, 0, 20, {radius: 4, blur: 4, spread: 2, color: new Color(0)})
    surface.drawRoundedShadow(0, 0, -10, 20, {radius: 4, blur: 4, spread: 2, color: new Color(0)})
    surface.drawRoundedShadow(0, 0, Number.NaN, 20, {radius: 4, blur: 4, spread: 2, color: new Color(0)})
    surface.drawRoundedShadow(Number.POSITIVE_INFINITY, 0, 10, 20, {
      radius: 4,
      blur: 4,
      spread: 2,
      color: new Color(0),
    })
    surface.drawRoundedShadow(0, 0, 10, 20, {radius: 4, blur: 0, spread: 0, color: new Color(0)})
    surface.drawRoundedShadow(0, 0, 10, 20, {radius: 4, blur: -4, spread: Number.NaN, color: new Color(0)})
    expect(layer.children).toHaveLength(0)

    surface.drawRoundedShadow(0, 0, 10, 20, {
      radius: {tl: -2, tr: Number.NaN, br: Number.POSITIVE_INFINITY, bl: 4},
      blur: -4,
      spread: 2,
      color: new Color(0),
    })
    expect(layer.children).toHaveLength(1)
    const material = (layer.children[0] as Mesh).material as RoundedRectMaterial
    expect(material.radii).toEqual([0, 0, 0, 0.004])
    expect(material.shadowBlur).toBe(0)
    expect(material.shadowSpread).toBeCloseTo(0.002)
  })

  test("inherits retained transform and clip without rematerializing", () => {
    const {surface, fake} = setupSurface()
    const parent = surface.createParent()
    surface.setViewportClip(parent, {x: 20, y: 10, w: 100, h: 60})
    let materializations = 0
    surface.materialize(parent, () => {
      materializations += 1
      surface.drawRoundedShadow(10, 10, 80, 40, {
        radius: 6,
        blur: 8,
        spread: 2,
        color: new Color(0.2, 0.4, 0.8, 0.5),
      })
    })
    const mesh = parent.children[0] as Mesh
    const geometry = mesh.geometry
    const material = mesh.material as RoundedRectMaterial
    const framesBeforeTransform = fake.frameCount()

    expect(material.clipBounds).toEqual([20, 10, 120, 70])
    surface.transform(parent, (target) => {
      target.position.set(0.05, -0.04, 0)
      target.scale.set(1.5, 1.5, 1)
    })

    expect(materializations).toBe(1)
    expect(parent.children).toEqual([mesh])
    expect(mesh.geometry).toBe(geometry)
    expect(mesh.material).toBe(material)
    expect(material.clipBounds).toEqual([20, 10, 120, 70])
    expect(fake.invalidated).toHaveLength(0)
    expect(fake.frameCount()).toBe(framesBeforeTransform + 1)
  })
})
