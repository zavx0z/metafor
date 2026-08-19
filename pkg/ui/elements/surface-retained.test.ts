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
import type {RetainedHitOptions} from "./surface.ts"
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

  stageHit(
    parent: Object3D,
    rect: Readonly<{x: number; y: number; w: number; h: number}>,
    action: () => void,
    options: RetainedHitOptions = {},
  ): void {
    this.retainedHit(parent, rect.x, rect.y, rect.w, rect.h, action, options)
  }

  setViewportClip(parent: Object3D, rect: Readonly<{x: number; y: number; w: number; h: number}> | null): void {
    this.updateRetainedViewportClip(parent, rect)
  }

  setVisibility(parent: Object3D, visible: boolean): void {
    this.updateRetainedVisibility(parent, visible)
  }

  toRetained(parent: Object3D, point: Readonly<{x: number; y: number}>): Readonly<{x: number; y: number}> {
    return this.surfaceToRetainedPoint(parent, point)
  }

  toSurface(parent: Object3D, point: Readonly<{x: number; y: number}>): Readonly<{x: number; y: number}> {
    return this.retainedToSurfacePoint(parent, point)
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

  test("stages retained hits atomically in actual paint order and clears stale interaction state", () => {
    const fake = createFakeRuntime()
    const surface = new RetainedTestSurface()
    surface.attachCanvas(fake.runtime)
    surface.setRect({x: 0, y: 0, w: 200, h: 120}, 0.001, font)
    const root = surface.createParent("root")
    const bottom = surface.createParent("bottom", root)
    const top = surface.createParent("top", root)
    const actions: string[] = []
    let leaves = 0

    surface.materialize(bottom, () => {
      surface.drawRect(10, 10, 30, 30, new Color(0.2, 0.4, 0.6, 1))
      surface.stageHit(bottom, {x: 10, y: 10, w: 30, h: 30}, () => actions.push("bottom"), {
        key: "bottom",
      })
    })
    surface.materialize(top, () => {
      surface.drawRect(10, 10, 30, 30, new Color(0.7, 0.4, 0.2, 1))
      surface.stageHit(top, {x: 10, y: 10, w: 30, h: 30}, () => actions.push("top"), {
        key: "top",
        tooltip: {label: "top", delayMs: 10_000},
        onPointerLeave: () => { leaves += 1 },
      })
    })

    surface.onPointerDown({} as MouseEvent, 20, 20)
    surface.onPointerUp({} as MouseEvent, 20, 20)
    expect(actions).toEqual(["top"])

    surface.setVisibility(top, false)
    surface.onPointerDown({} as MouseEvent, 20, 20)
    surface.onPointerUp({} as MouseEvent, 20, 20)
    expect(actions).toEqual(["top", "bottom"])
    surface.setVisibility(top, true)

    expect(() => surface.materialize(top, () => {
      surface.stageHit(top, {x: 10, y: 10, w: 30, h: 30}, () => actions.push("staged"), {key: "staged"})
      throw new Error("hit staging failed")
    })).toThrow("hit staging failed")
    surface.onPointerDown({} as MouseEvent, 20, 20)
    surface.onPointerUp({} as MouseEvent, 20, 20)
    expect(actions).toEqual(["top", "bottom", "top"])

    const minimum = surface.createParent("screen-minimum", root)
    surface.materialize(minimum, () => {
      surface.drawRect(0, 0, 1, 1, new Color(1, 1, 1, 1))
      surface.stageHit(minimum, {x: 0, y: 0, w: 1, h: 1}, () => actions.push("minimum"), {
        key: "minimum",
        screenMinimum: {width: 20, height: 20},
      })
    })
    surface.transform(root, (parent) => {
      parent.position.set(0.05, -0.05, 0)
      parent.scale.set(0.1, 0.1, 1)
    })
    const visualGeometry = (minimum.children[0] as Mesh).geometry
    surface.onPointerDown({} as MouseEvent, 58, 50)
    surface.onPointerUp({} as MouseEvent, 58, 50)
    expect(actions.at(-1)).toBe("minimum")
    expect((minimum.children[0] as Mesh).geometry).toBe(visualGeometry)

    minimum.visible = false
    surface.onPointerMove({} as MouseEvent, 52, 52)
    surface.setVisibility(top, false)
    expect(surface.hitState(10, 10, 30, 30, "top")).toEqual({hovered: false, pressed: false})
    surface.setVisibility(top, true)
    surface.onPointerMove({} as MouseEvent, 52, 52)
    surface.onPointerDown({} as MouseEvent, 52, 52)
    surface.removeParent(top)
    expect(surface.hitState(10, 10, 30, 30, "top")).toEqual({hovered: false, pressed: false})
    surface.onPointerUp({} as MouseEvent, 52, 52)
    expect(actions).not.toContain("staged")
    expect(leaves).toBe(2)

    surface.onPointerDown({} as MouseEvent, 52, 52)
    surface.onPointerUp({} as MouseEvent, 52, 52)
    expect(actions.at(-1)).toBe("bottom")
    surface.dispose()
    surface.onPointerDown({} as MouseEvent, 52, 52)
    surface.onPointerUp({} as MouseEvent, 52, 52)
    expect(actions.at(-1)).toBe("bottom")
  })

  test("automatically retains ordinary hit and wheel controls in exact parent-local coordinates", () => {
    const fake = createFakeRuntime()
    const surface = new RetainedTestSurface()
    surface.attachCanvas(fake.runtime)
    surface.setRect({x: 0, y: 0, w: 200, h: 120}, 0.001, font)
    const root = surface.createParent("root")
    const component = surface.createParent("component", root)
    const actions: string[] = []
    let wheelCalls = 0
    const pointerMoves: Array<Readonly<{x: number; y: number}>> = []

    surface.materialize(component, () => {
      surface.hit(0, 0, 100, 80, () => actions.push("container"), {key: "container"})
      surface.hit(10, 10, 30, 20, () => actions.push("control"), {
        key: "control",
        onPointerMove: (x, y) => { pointerMoves.push({x, y}) },
      })
      surface.wheel(10, 10, 30, 20, () => { wheelCalls += 1 }, "control-wheel")
    })
    surface.transform(root, (parent) => {
      parent.position.set(0.05, -0.04, 0)
      parent.scale.set(0.5, 0.5, 1)
    })

    surface.onPointerMove({} as MouseEvent, 60, 47.5)
    expect(surface.hoveredPointer()?.x).toBeCloseTo(20, 5)
    expect(surface.hoveredPointer()?.y).toBeCloseTo(15, 5)
    surface.onPointerDown({} as MouseEvent, 60, 47.5)
    surface.onPointerMove({} as MouseEvent, 61, 48)
    surface.onPointerUp({} as MouseEvent, 61, 48)
    expect(pointerMoves.at(-1)?.x).toBeCloseTo(22, 5)
    expect(pointerMoves.at(-1)?.y).toBeCloseTo(16, 5)
    expect(actions).toEqual(["control"])
    surface.onWheel({} as WheelEvent, 60, 47.5)
    expect(wheelCalls).toBe(1)

    expect(() => surface.materialize(component, () => {
      surface.hit(10, 10, 30, 20, () => actions.push("staged-control"), {key: "staged-control"})
      surface.wheel(10, 10, 30, 20, () => { wheelCalls += 100 }, "staged-wheel")
      throw new Error("ordinary input staging failed")
    })).toThrow("ordinary input staging failed")
    surface.onPointerDown({} as MouseEvent, 60, 47.5)
    surface.onPointerUp({} as MouseEvent, 60, 47.5)
    surface.onWheel({} as WheelEvent, 60, 47.5)
    expect(actions).toEqual(["control", "control"])
    expect(wheelCalls).toBe(2)

    surface.onPointerMove({} as MouseEvent, 60, 47.5)
    surface.onPointerDown({} as MouseEvent, 60, 47.5)
    surface.setVisibility(component, false)
    expect(surface.hitState(10, 10, 30, 20, "control")).toEqual({hovered: false, pressed: false})
    surface.onPointerUp({} as MouseEvent, 60, 47.5)
    surface.onWheel({} as WheelEvent, 60, 47.5)
    expect(actions).toEqual(["control", "control"])
    expect(wheelCalls).toBe(2)

    surface.setVisibility(component, true)
    surface.removeParent(component)
    surface.onPointerDown({} as MouseEvent, 60, 47.5)
    surface.onPointerUp({} as MouseEvent, 60, 47.5)
    surface.onWheel({} as WheelEvent, 60, 47.5)
    surface.dispose()
    expect(actions).toEqual(["control", "control"])
    expect(wheelCalls).toBe(2)
  })

  test("keeps fixed viewport and projected local material clips current without rematerialization", () => {
    const fake = createFakeRuntime()
    const surface = new RetainedTestSurface()
    surface.attachCanvas(fake.runtime)
    surface.setRect({x: 10, y: 20, w: 200, h: 120}, 0.001, font)
    const root = surface.createParent("root")
    const component = surface.createParent("component", root)
    surface.setViewportClip(root, {x: 20, y: 10, w: 100, h: 60})
    surface.materialize(component, () => {
      surface.drawPolyline([{x: -100, y: 30}, {x: 300, y: 30}], new Color(0.2, 0.8, 1, 1), 2)
    })
    const retainedMesh = component.children[0] as Mesh
    const retainedMaterial = retainedMesh.material as MeshBasicMaterial
    const retainedGeometry = retainedMesh.geometry
    expect(retainedMaterial.clipBounds).toEqual([30, 30, 130, 90])

    surface.transform(root, (parent) => {
      parent.position.set(0.04, -0.03, 0)
      parent.scale.set(0.5, 0.5, 1)
    })
    expect(retainedMaterial.clipBounds).toEqual([30, 30, 130, 90])
    expect(retainedMesh.geometry).toBe(retainedGeometry)

    surface.moveRect({x: 50, y: 70, w: 200, h: 120}, 0.001, font)
    expect(retainedMaterial.clipBounds).toEqual([70, 80, 170, 140])
    expect(retainedMesh.geometry).toBe(retainedGeometry)

    surface.transform(root, (parent) => {
      parent.position.set(0, 0, 0)
      parent.scale.set(1, 1, 1)
    })
    surface.transform(component, (parent) => {
      parent.position.set(0.02, -0.01, 0)
      parent.scale.set(2, 2, 1)
    })
    surface.setViewportClip(root, null)
    surface.materialize(component, () => {
      surface.pushClip(0, 0, 10, 10)
      surface.drawRect(-20, -20, 80, 80, new Color(0.8, 0.3, 0.2, 1))
      surface.popClip()
    })
    const localClipMesh = component.children[0] as Mesh
    const localClipMaterial = localClipMesh.material as MeshBasicMaterial
    expect(localClipMaterial.clipBounds).not.toBeNull()
    for (const [index, expected] of [70, 80, 90, 100].entries()) {
      expect(localClipMaterial.clipBounds![index]).toBeCloseTo(expected, 5)
    }
    const clipBeforeFailure = localClipMaterial.clipBounds!.slice() as [number, number, number, number]
    expect(() => surface.materialize(component, () => {
      surface.pushClip(30, 30, 10, 10)
      surface.drawRect(0, 0, 60, 60, new Color(0.1, 0.9, 0.4, 1))
      throw new Error("clip staging failed")
    })).toThrow("clip staging failed")
    expect(component.children).toEqual([localClipMesh])
    expect(localClipMaterial.clipBounds).toEqual(clipBeforeFailure)

    const point = {x: 37, y: 29}
    const retainedPoint = surface.toRetained(component, point)
    const roundTrip = surface.toSurface(component, retainedPoint)
    expect(roundTrip.x).toBeCloseTo(point.x, 6)
    expect(roundTrip.y).toBeCloseTo(point.y, 6)
  })
})
