import {beforeAll, describe, expect, test} from "bun:test"
import {
  BufferGeometry,
  Color,
  Line,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Text,
  TrueTypeFont,
  type CachedText,
} from "@metafor/engine"
import {UiSurface} from "./surface.ts"
import type {UiRuntime} from "./runtime.ts"

class RetainedTestSurface extends UiSurface {
  constructor() {
    super({bgColor: null, borderColor: null})
  }

  createParent(name: string, parent?: Object3D): Object3D {
    const retainedParent = this.createRetainedParent(parent)
    retainedParent.name = name
    return retainedParent
  }

  materialize(parent: Object3D, draw: () => void): void {
    this.materializeRetainedParent(parent, draw)
  }

  transform(parent: Object3D, update: (parent: Object3D) => void): void {
    this.updateRetainedTransform(parent, update)
  }

  removeParent(parent: Object3D): void {
    this.removeRetainedParent(parent)
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

const countGeometry = (geometries: readonly BufferGeometry[], geometry: BufferGeometry): number =>
  geometries.filter((candidate) => candidate === geometry).length

let font: TrueTypeFont

beforeAll(async () => {
  const bytes = await Bun.file(new URL("../../engine/static/JetBrainsMono-Bold.ttf", import.meta.url)).arrayBuffer()
  font = new TrueTypeFont(bytes)
})

describe("UiSurface retained component parent", () => {
  test("preserves identity on presentation and recursively invalidates owned geometry once", () => {
    const fake = createFakeRuntime()
    const surface = new RetainedTestSurface()
    surface.attachCanvas(fake.runtime)
    surface.setRect({x: 0, y: 0, w: 320, h: 180}, 0.001, font)
    fake.invalidated.length = 0

    const root = surface.createParent("root")
    const nested = surface.createParent("nested", root)
    expect(root).toBeInstanceOf(Object3D)
    expect(nested.parent).toBe(root)

    surface.materialize(nested, () => {
      surface.drawRect(8, 8, 40, 24, new Color(0.2, 0.4, 0.8, 1))
      surface.drawText("cached", 12, 12, {fontPx: 12, material: surface.materials.text})
    })

    const oldMesh = nested.children[0] as Mesh
    const oldCachedText = nested.children[1] as CachedText
    const oldMeshGeometry = oldMesh.geometry
    const oldCachedStencil = oldCachedText.stencilGeometry
    const oldCachedCover = oldCachedText.coverGeometry

    const branch = new Object3D()
    const lineGeometry = new BufferGeometry()
    const line = new Line(lineGeometry, new MeshBasicMaterial({color: new Color(1, 1, 1, 1)}))
    const sharedMesh = new Mesh(lineGeometry, new MeshBasicMaterial({color: new Color(0.7, 0.7, 0.7, 1)}))
    const ownedText = new Text("owned", font, 0.012, surface.materials.text)
    const ownedStencil = ownedText.stencilGeometry
    const ownedCover = ownedText.coverGeometry
    branch.add(line)
    branch.add(sharedMesh)
    branch.add(ownedText)
    nested.add(branch)

    const childrenBeforeTransform = [...nested.children]
    const framesBeforeTransform = fake.frameCount()
    surface.transform(root, (parent) => {
      parent.position.set(0.12, -0.08, 0)
      parent.scale.set(1.5, 1.5, 1)
    })

    expect(root.children).toEqual([nested])
    expect(nested.children).toEqual(childrenBeforeTransform)
    expect(oldMesh.geometry).toBe(oldMeshGeometry)
    expect(oldCachedText.stencilGeometry).toBe(oldCachedStencil)
    expect(oldCachedText.coverGeometry).toBe(oldCachedCover)
    expect(line.geometry).toBe(lineGeometry)
    expect(sharedMesh.geometry).toBe(lineGeometry)
    expect(ownedText.stencilGeometry).toBe(ownedStencil)
    expect(ownedText.coverGeometry).toBe(ownedCover)
    expect(fake.invalidated).toHaveLength(0)
    expect(fake.frameCount()).toBe(framesBeforeTransform + 1)

    surface.materialize(nested, () => {
      surface.drawRect(16, 10, 52, 28, new Color(0.8, 0.3, 0.2, 1))
      surface.drawText("cached", 20, 14, {fontPx: 12, material: surface.materials.text})
    })

    expect(root.children).toEqual([nested])
    expect(nested.parent).toBe(root)
    expect(oldMesh.parent).toBeNull()
    expect(oldCachedText.parent).toBeNull()
    expect(branch.parent).toBeNull()
    expect(branch.children).toEqual([])
    expect(line.parent).toBeNull()
    expect(sharedMesh.parent).toBeNull()
    expect(ownedText.parent).toBeNull()
    expect(countGeometry(fake.invalidated, oldMeshGeometry)).toBe(1)
    expect(countGeometry(fake.invalidated, lineGeometry)).toBe(1)
    expect(countGeometry(fake.invalidated, ownedStencil)).toBe(1)
    expect(countGeometry(fake.invalidated, ownedCover)).toBe(1)
    expect(countGeometry(fake.invalidated, oldCachedStencil)).toBe(0)
    expect(countGeometry(fake.invalidated, oldCachedCover)).toBe(0)
    expect(new Set(fake.invalidated).size).toBe(fake.invalidated.length)

    const nextMesh = nested.children[0] as Mesh
    const nextCachedText = nested.children[1] as CachedText
    const nextMeshGeometry = nextMesh.geometry
    const nextCachedStencil = nextCachedText.stencilGeometry
    const nextCachedCover = nextCachedText.coverGeometry
    const invalidationsBeforeSecondTransform = fake.invalidated.length
    surface.transform(root, (parent) => {
      parent.position.x += 0.05
      parent.scale.set(0.75, 0.75, 1)
    })
    expect(nested.children[0]).toBe(nextMesh)
    expect(nested.children[1]).toBe(nextCachedText)
    expect(nextMesh.geometry).toBe(nextMeshGeometry)
    expect(nextCachedText.stencilGeometry).toBe(nextCachedStencil)
    expect(nextCachedText.coverGeometry).toBe(nextCachedCover)
    expect(fake.invalidated).toHaveLength(invalidationsBeforeSecondTransform)

    const invalidationsBeforeRemove = fake.invalidated.length
    const framesBeforeRemove = fake.frameCount()
    surface.removeParent(root)
    surface.removeParent(root)
    surface.dispose()
    surface.dispose()

    const removeInvalidations = fake.invalidated.slice(invalidationsBeforeRemove)
    expect(root.parent).toBeNull()
    expect(root.children).toEqual([])
    expect(nested.parent).toBeNull()
    expect(nested.children).toEqual([])
    expect(nextMesh.parent).toBeNull()
    expect(nextCachedText.parent).toBeNull()
    expect(countGeometry(removeInvalidations, nextMeshGeometry)).toBe(1)
    expect(countGeometry(removeInvalidations, nextCachedStencil)).toBe(0)
    expect(countGeometry(removeInvalidations, nextCachedCover)).toBe(0)
    expect(new Set(removeInvalidations).size).toBe(removeInvalidations.length)
    expect(fake.frameCount()).toBe(framesBeforeRemove + 1)
  })

  test("keeps the previous subtree when staged materialization fails", () => {
    const fake = createFakeRuntime()
    const surface = new RetainedTestSurface()
    surface.attachCanvas(fake.runtime)
    surface.setRect({x: 0, y: 0, w: 160, h: 90}, 0.001, font)
    const root = surface.createParent("root")
    surface.materialize(root, () => {
      surface.drawRect(4, 4, 32, 16, new Color(0.2, 0.7, 0.4, 1))
    })

    const currentMesh = root.children[0] as Mesh
    const currentGeometry = currentMesh.geometry
    fake.invalidated.length = 0
    const framesBeforeFailure = fake.frameCount()

    expect(() => surface.materialize(root, () => {
      surface.drawRect(8, 8, 48, 24, new Color(0.7, 0.2, 0.4, 1))
      throw new Error("staged failure")
    })).toThrow("staged failure")

    expect(root.children).toEqual([currentMesh])
    expect(currentMesh.parent).toBe(root)
    expect(currentMesh.geometry).toBe(currentGeometry)
    expect(countGeometry(fake.invalidated, currentGeometry)).toBe(0)
    expect(fake.invalidated).toHaveLength(1)
    expect(fake.frameCount()).toBe(framesBeforeFailure)

    surface.removeParent(root)
    expect(countGeometry(fake.invalidated, currentGeometry)).toBe(1)
  })

  test("disposes a still-attached retained subtree idempotently", () => {
    const fake = createFakeRuntime()
    const surface = new RetainedTestSurface()
    surface.attachCanvas(fake.runtime)
    surface.setRect({x: 0, y: 0, w: 120, h: 80}, 0.001, font)
    const root = surface.createParent("root")
    const nested = surface.createParent("nested", root)
    surface.materialize(nested, () => {
      surface.drawRect(6, 6, 24, 18, new Color(0.3, 0.5, 0.9, 1))
    })

    const mesh = nested.children[0] as Mesh
    const geometry = mesh.geometry
    fake.invalidated.length = 0
    surface.dispose()
    surface.dispose()
    surface.removeParent(root)

    expect(root.parent).toBeNull()
    expect(root.children).toEqual([])
    expect(nested.parent).toBeNull()
    expect(nested.children).toEqual([])
    expect(mesh.parent).toBeNull()
    expect(countGeometry(fake.invalidated, geometry)).toBe(1)
    expect(fake.invalidated).toHaveLength(1)
  })
})
