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
import {div, divScrollPosition, divScrollTo} from "./div.ts"
import {drawIcon} from "./icon.ts"
import {createInputEditState, focusInput, handleActiveInputKey, input} from "./input.ts"
import {li, liY, ul, ulContentHeight} from "./list.ts"
import {flexColumn, flexRow} from "./flex.ts"
import {select} from "./select.ts"

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

  portal(draw: () => void): void {
    this.withOverlayPortal(draw)
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

class RetainedElementsSurface extends UiSurface {
  readonly root: Object3D
  readonly elements: Object3D
  readonly sibling: Object3D
  surfaceRenderPasses = 0
  readonly counters = {
    elementsLayoutPlans: 0,
    elementsMaterializations: 0,
    siblingLayoutPlans: 0,
    siblingMaterializations: 0,
  }
  #mounted = false

  constructor() {
    super({bgColor: null, borderColor: null})
    this.root = this.createRetainedParent()
    this.root.name = "RetainedElements.root"
    this.elements = this.createRetainedParent(this.root)
    this.elements.name = "RetainedElements.elements"
    this.sibling = this.createRetainedParent(this.root)
    this.sibling.name = "RetainedElements.sibling"
  }

  transformRoot(update: (parent: Object3D) => void): void {
    this.updateRetainedTransform(this.root, update)
  }

  protected render(): void {
    this.surfaceRenderPasses += 1
    if (this.#mounted) return
    this.#mounted = true
    this.materializeRetainedParent(this.elements, this.#drawElements)
    this.materializeRetainedParent(this.sibling, this.#drawSibling)
  }

  readonly #drawElements = (): void => {
    this.counters.elementsLayoutPlans += 1
    this.counters.elementsMaterializations += 1
    this.registerRenderKey("ambiguous-owner")
    div(this, 8, 8, 284, 160, {
      key: "elements-panel",
      style: {background: "bgPanel", borderColor: "border", borderRadius: 10, padding: 6},
      children: () => {
        flexColumn({
          x: 16,
          y: 14,
          w: 250,
          h: 140,
          gap: 4,
          items: [
            {height: 18, draw: (x, y, width, height) => flexRow({
              x,
              y,
              w: width,
              h: height,
              gap: 4,
              alignItems: "center",
              items: [
                {width: "grow", height, draw: (tx, ty, tw) => {
                  this.drawText("Text", tx, ty, {fontPx: 12, material: this.materials.text, maxWidthPx: tw})
                }},
                {width: 16, height: 16, draw: (ix, iy, iw) => {
                  drawIcon(this, "ui-elements:test-icon", ix, iy, iw)
                }},
              ],
            })},
            {height: 24, draw: (x, y, width, height) => {
              input(this, x, y, width, height, {key: "editor", children: "seed"})
            }},
            {height: "grow", draw: (x, y, width, height) => ul(this, x, y, width, height, {
              key: "items",
              itemHeight: 28,
              itemGap: 2,
              scrollContentHeight: ulContentHeight(6, {
                itemHeight: 28,
                itemGap: 2,
                paddingTop: 4,
                paddingBottom: 4,
              }),
              style: {paddingY: 4, scrollbarWidth: 6},
              children: ({itemX, itemY, itemWidth, itemHeight}) => {
                for (let index = 0; index < 6; index += 1) {
                  li(this, itemX, liY(index, {startY: itemY, itemHeight, itemGap: 2}), itemWidth, itemHeight, {
                    key: `item:${index}`,
                    children: `Item ${index}`,
                  })
                }
              },
            })},
            {height: 10, draw: (x, y, width, height) => {
              this.drawPolyline([
                {x, y: y + height / 2},
                {x: x + width / 2, y: y + height},
                {x: x + width, y},
              ], new Color(0.2, 0.8, 1, 1), 2)
            }},
          ],
        })
      },
    })
  }

  readonly #drawSibling = (): void => {
    this.counters.siblingLayoutPlans += 1
    this.counters.siblingMaterializations += 1
    this.registerRenderKey("ambiguous-owner")
    this.drawRect(296, 8, 16, 160, new Color(0.7, 0.3, 0.2, 1))
  }
}

class RetainedSelectSurface extends UiSurface {
  readonly selectOwner: Object3D
  readonly sibling: Object3D
  selectMaterializations = 0
  siblingMaterializations = 0
  siblingActions = 0
  surfaceRenderPasses = 0
  value = "multiply"
  #mounted = false

  constructor() {
    super({bgColor: null, borderColor: null})
    this.selectOwner = this.createRetainedParent()
    this.sibling = this.createRetainedParent()
  }

  protected render(): void {
    this.surfaceRenderPasses += 1
    if (this.#mounted) return
    this.#mounted = true
    this.materializeRetainedParent(this.selectOwner, this.#drawSelect)
    this.materializeRetainedParent(this.sibling, this.#drawSibling)
  }

  readonly #drawSelect = (): void => {
    this.selectMaterializations += 1
    select(this, 10, 10, 120, 22, {
      key: "retained-select",
      value: this.value,
      options: [
        {value: "add", label: "Add"},
        {value: "multiply", label: "Multiply"},
        {value: "subtract", label: "Subtract"},
      ],
      onChange: (value) => { this.value = value },
    })
  }

  readonly #drawSibling = (): void => {
    this.siblingMaterializations += 1
    this.drawRect(10, 33, 120, 68, new Color(0.7, 0.3, 0.2, 1))
    this.hit(10, 33, 120, 68, () => { this.siblingActions += 1 }, {key: "later-sibling"})
  }
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
  test("keeps a standalone portal on the ordinary immediate overlay fallback", () => {
    const surface = new RetainedTestSurface()
    surface.setRect({x: 0, y: 0, w: 120, h: 80}, 0.001, font)
    surface.portal(() => {
      surface.drawRect(10, 10, 40, 20, new Color(0.2, 0.8, 0.4, 1))
    })
    const immediate = requiredLayer(surface, "RetainedTestSurface.immediateOverlayLayer")
    const retained = requiredLayer(surface, "RetainedTestSurface.retainedOverlayLayer")
    expect(immediate.children).toHaveLength(1)
    expect(retained.children).toHaveLength(0)
    surface.dispose()
  })

  test("commits one owner-linked portal above later siblings and rolls visual/input lifecycle back atomically", () => {
    const fake = createFakeRuntime()
    const surface = new RetainedTestSurface()
    surface.attachCanvas(fake.runtime)
    surface.setRect({x: 0, y: 0, w: 240, h: 160}, 0.001, font)
    const root = surface.createParent("root")
    const owner = surface.createParent("portal-owner", root)
    const sibling = surface.createParent("later-sibling", root)
    const actions: string[] = []

    surface.materialize(owner, () => {
      surface.portal(() => {
        surface.drawRect(12, 12, 80, 40, new Color(0.2, 0.8, 0.4, 1))
        surface.hit(12, 12, 80, 40, () => actions.push("portal"), {key: "portal-hit"})
        surface.wheel(12, 12, 80, 40, () => actions.push("portal-wheel"), "portal-wheel")
        surface.dismissableLayer({
          key: "portal-dismiss",
          regions: [{x: 12, y: 12, w: 80, h: 40}],
          dismiss: () => actions.push("dismiss"),
        })
      })
    })
    surface.materialize(sibling, () => {
      surface.drawRect(12, 12, 80, 40, new Color(0.8, 0.2, 0.2, 1))
      surface.hit(12, 12, 80, 40, () => actions.push("sibling"), {key: "sibling-hit"})
      surface.wheel(12, 12, 80, 40, () => actions.push("sibling-wheel"), "sibling-wheel")
      surface.dismissableLayer({
        key: "sibling-dismiss",
        regions: [{x: 12, y: 12, w: 80, h: 40}],
        dismiss: () => actions.push("sibling-dismiss"),
      })
    })

    const overlayLayer = surface.node.getObjectByName("RetainedTestSurface.overlayLayer")!
    const overlay = surface.node.getObjectByName("RetainedTestSurface.retainedOverlayLayer")
    expect(overlay).toBeDefined()
    expect(overlayLayer.children.map(({name}) => name)).toEqual([
      "RetainedTestSurface.retainedOverlayLayer",
      "RetainedTestSurface.immediateOverlayLayer",
    ])
    expect(owner.children).toHaveLength(0)
    expect(overlay!.children).toHaveLength(1)
    const portal = overlay!.children[0]!
    const portalVisual = portal.children[0] as Mesh
    const portalGeometry = portalVisual.geometry
    surface.onPointerDown({} as MouseEvent, 20, 20)
    surface.onPointerUp({} as MouseEvent, 20, 20)
    expect(actions).toEqual(["portal"])
    surface.onWheel({} as WheelEvent, 20, 20)
    expect(actions).toEqual(["portal", "portal-wheel"])
    expect(surface.dismissTopLayer("escape")).toBeTrue()
    expect(actions).toEqual(["portal", "portal-wheel", "dismiss"])

    expect(() => surface.materialize(owner, () => {
      surface.portal(() => {
        surface.drawRect(20, 20, 20, 20, new Color(0.1, 0.2, 0.9, 1))
        surface.hit(20, 20, 20, 20, () => actions.push("staged"), {key: "staged-hit"})
      })
      throw new Error("portal staging failed")
    })).toThrow("portal staging failed")
    expect(overlay!.children).toEqual([portal])
    expect(portal.children).toEqual([portalVisual])
    surface.onPointerDown({} as MouseEvent, 20, 20)
    surface.onPointerUp({} as MouseEvent, 20, 20)
    expect(actions).toEqual(["portal", "portal-wheel", "dismiss", "portal"])

    surface.materialize(owner, () => {
      surface.portal(() => {
        surface.drawRect(12, 12, 80, 40, new Color(0.1, 0.2, 0.9, 1))
        surface.hit(12, 12, 80, 40, () => actions.push("replacement"), {key: "replacement-hit"})
      })
    })
    expect(overlay!.children).toEqual([portal])
    expect(portal.children[0]).not.toBe(portalVisual)
    expect(countGeometry(fake.invalidated, portalGeometry)).toBe(1)
    const replacementVisual = portal.children[0]
    const siblingChildren = [...sibling.children]
    surface.requestKeyedRender("replacement-hit")
    surface.flushPendingRender()
    expect(overlay!.children).toEqual([portal])
    expect(portal.children[0]).not.toBe(replacementVisual)
    expect(sibling.children).toEqual(siblingChildren)

    surface.materialize(owner, () => {
      surface.drawRect(0, 0, 4, 4, new Color(0.5, 0.5, 0.5, 1))
    })
    expect(overlay!.children).toHaveLength(0)
    surface.onPointerDown({} as MouseEvent, 20, 20)
    surface.onPointerUp({} as MouseEvent, 20, 20)
    expect(actions).toEqual(["portal", "portal-wheel", "dismiss", "portal", "sibling"])
  })

  test("inherits retained transforms, viewport clip and visibility without rebuilding portal geometry", () => {
    const fake = createFakeRuntime()
    const surface = new RetainedTestSurface()
    surface.attachCanvas(fake.runtime)
    surface.setRect({x: 0, y: 0, w: 240, h: 160}, 0.001, font)
    const root = surface.createParent("root")
    const owner = surface.createParent("portal-owner", root)
    surface.setViewportClip(root, {x: 10, y: 12, w: 100, h: 70})
    surface.materialize(owner, () => {
      surface.portal(() => {
        surface.drawRect(0, 0, 120, 90, new Color(0.2, 0.8, 0.4, 1))
      })
    })
    const overlay = surface.node.getObjectByName("RetainedTestSurface.retainedOverlayLayer")!
    const portal = overlay.children[0]!
    const visual = portal.children[0] as Mesh
    const geometry = visual.geometry
    const material = visual.material as MeshBasicMaterial
    surface.node.updateWorldMatrix()
    expect([...portal.matrixWorld.elements]).toEqual([...owner.matrixWorld.elements])
    expect(material.clipBounds).toEqual([10, 12, 110, 82])

    surface.transform(root, (parent) => {
      parent.position.set(0.04, -0.03, 0)
      parent.scale.set(0.5, 0.5, 1)
    })
    surface.node.updateWorldMatrix()
    expect([...portal.matrixWorld.elements]).toEqual([...owner.matrixWorld.elements])
    expect(portal.children[0]).toBe(visual)
    expect(visual.geometry).toBe(geometry)
    expect(material.clipBounds).toEqual([10, 12, 110, 82])

    surface.setVisibility(root, false)
    surface.node.updateWorldMatrix()
    expect(portal.visible).toBeFalse()
    surface.setVisibility(root, true)
    surface.node.updateWorldMatrix()
    expect(portal.visible).toBeTrue()

    surface.removeParent(owner)
    expect(overlay.children).toHaveLength(0)
    expect(countGeometry(fake.invalidated, geometry)).toBe(1)
    surface.dispose()
    expect(countGeometry(fake.invalidated, geometry)).toBe(1)
  })

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
    let keyedFailure = false
    const draw = () => {
      surface.registerRenderKey("failure-owner")
      surface.drawRect(4, 4, 32, 16, new Color(0.2, 0.7, 0.4, 1))
      if (keyedFailure) throw new Error("keyed failure")
    }
    surface.materialize(root, draw)

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

    keyedFailure = true
    surface.requestKeyedRender("failure-owner")
    expect(() => surface.flushPendingRender()).toThrow("keyed failure")
    expect(root.children).toEqual([currentMesh])
    expect(currentMesh.parent).toBe(root)
    expect(currentMesh.geometry).toBe(currentGeometry)
    expect(countGeometry(fake.invalidated, currentGeometry)).toBe(0)
    expect(fake.invalidated).toHaveLength(2)

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

  test("keeps nested Elements stable on transform and rematerializes only the keyed owner", () => {
    const fake = createFakeRuntime()
    const surface = new RetainedElementsSurface()
    surface.attachCanvas(fake.runtime)
    surface.setRect({x: 0, y: 0, w: 320, h: 180}, 0.001, font)

    expect(surface.counters).toEqual({
      elementsLayoutPlans: 1,
      elementsMaterializations: 1,
      siblingLayoutPlans: 1,
      siblingMaterializations: 1,
    })
    expect(surface.elements.children.length).toBeGreaterThan(10)
    const elementChildren = [...surface.elements.children]
    const elementGeometries = elementChildren.map((child) => (child as {geometry?: BufferGeometry}).geometry)
    const siblingChildren = [...surface.sibling.children]
    const siblingGeometry = (siblingChildren[0] as Mesh).geometry

    surface.transformRoot((parent) => {
      parent.position.set(0.04, -0.03, 0)
      parent.scale.set(1.25, 1.25, 1)
    })

    expect(surface.counters).toEqual({
      elementsLayoutPlans: 1,
      elementsMaterializations: 1,
      siblingLayoutPlans: 1,
      siblingMaterializations: 1,
    })
    expect(surface.elements.children).toEqual(elementChildren)
    expect(surface.elements.children.map((child) => (child as {geometry?: BufferGeometry}).geometry)).toEqual(elementGeometries)
    expect(surface.sibling.children).toEqual(siblingChildren)
    expect((surface.sibling.children[0] as Mesh).geometry).toBe(siblingGeometry)

    surface.requestKeyedRender("ambiguous-owner")
    surface.flushPendingRender()
    expect(surface.surfaceRenderPasses).toBe(2)
    expect(surface.counters).toEqual({
      elementsLayoutPlans: 1,
      elementsMaterializations: 1,
      siblingLayoutPlans: 1,
      siblingMaterializations: 1,
    })
    expect(surface.elements.children).toEqual(elementChildren)
    expect(surface.sibling.children).toEqual(siblingChildren)

    const originalSetInterval = globalThis.setInterval
    globalThis.setInterval = (() => 1) as unknown as typeof setInterval
    try {
      focusInput(surface, "editor", createInputEditState("seed", 4))
      surface.flushPendingRender()
      expect(surface.counters.elementsMaterializations).toBe(2)
      expect(surface.counters.elementsLayoutPlans).toBe(2)
      expect(surface.counters.siblingMaterializations).toBe(1)
      expect(surface.surfaceRenderPasses).toBe(2)
      expect(surface.sibling.children).toEqual(siblingChildren)
      expect((surface.sibling.children[0] as Mesh).geometry).toBe(siblingGeometry)

      const keyboardEvent = {
        key: "ArrowLeft",
        metaKey: false,
        ctrlKey: false,
        shiftKey: false,
        preventDefault() {},
      } as KeyboardEvent
      expect(handleActiveInputKey(surface, keyboardEvent)).toBe(true)
      surface.flushPendingRender()
      expect(surface.counters.elementsMaterializations).toBe(3)
      expect(surface.counters.elementsLayoutPlans).toBe(3)
      expect(surface.counters.siblingMaterializations).toBe(1)
      expect(surface.surfaceRenderPasses).toBe(2)
      expect(surface.sibling.children).toEqual(siblingChildren)
    } finally {
      globalThis.setInterval = originalSetInterval
    }

    divScrollTo(surface, "items", {top: 36})
    surface.flushPendingRender()
    expect(divScrollPosition(surface, "items").top).toBe(36)
    expect(surface.counters.elementsMaterializations).toBe(4)
    expect(surface.counters.elementsLayoutPlans).toBe(4)
    expect(surface.counters.siblingMaterializations).toBe(1)
    expect(surface.sibling.children).toEqual(siblingChildren)

    const originalRequestAnimationFrame = globalThis.requestAnimationFrame
    const originalCancelAnimationFrame = globalThis.cancelAnimationFrame
    const callbacks = new Map<number, FrameRequestCallback>()
    let nextFrameId = 1
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback): number => {
      const id = nextFrameId++
      callbacks.set(id, callback)
      return id
    }) as typeof requestAnimationFrame
    globalThis.cancelAnimationFrame = ((id: number): void => {
      callbacks.delete(id)
    }) as typeof cancelAnimationFrame
    try {
      let prevented = 0
      surface.onWheel({
        deltaX: 0,
        deltaY: 48,
        deltaMode: 0,
        shiftKey: false,
        timeStamp: 100,
        preventDefault: () => { prevented += 1 },
      } as unknown as WheelEvent, 80, 130)
      for (let frame = 0; callbacks.size > 0 && frame < 200; frame += 1) {
        const queued = [...callbacks.entries()]
        callbacks.clear()
        for (const [, callback] of queued) callback(116 + frame * 16)
        surface.flushPendingRender()
      }
      expect(callbacks.size).toBe(0)
      expect(prevented).toBe(1)
      expect(divScrollPosition(surface, "items").top).toBeGreaterThan(36)
      expect(surface.counters.elementsMaterializations).toBeGreaterThan(4)
      expect(surface.counters.elementsLayoutPlans).toBe(surface.counters.elementsMaterializations)
      expect(surface.counters.siblingMaterializations).toBe(1)
      expect(surface.counters.siblingLayoutPlans).toBe(1)
      expect(surface.sibling.children).toEqual(siblingChildren)
      expect((surface.sibling.children[0] as Mesh).geometry).toBe(siblingGeometry)
    } finally {
      globalThis.requestAnimationFrame = originalRequestAnimationFrame
      globalThis.cancelAnimationFrame = originalCancelAnimationFrame
      surface.dispose()
    }
  })

  test("rematerializes only the exact select owner for disclosure and choice", () => {
    const fake = createFakeRuntime()
    const surface = new RetainedSelectSurface()
    surface.attachCanvas(fake.runtime)
    surface.setRect({x: 0, y: 0, w: 220, h: 140}, 0.001, font)

    const siblingChildren = [...surface.sibling.children]
    const siblingGeometry = (siblingChildren[0] as Mesh).geometry
    expect({
      select: surface.selectMaterializations,
      sibling: surface.siblingMaterializations,
    }).toEqual({select: 1, sibling: 1})

    surface.onPointerDown({} as MouseEvent, 20, 20)
    surface.onPointerUp({} as MouseEvent, 20, 20)
    surface.flushPendingRender()
    expect({
      select: surface.selectMaterializations,
      sibling: surface.siblingMaterializations,
    }).toEqual({select: 2, sibling: 1})
    expect(surface.sibling.children).toEqual(siblingChildren)
    expect((surface.sibling.children[0] as Mesh).geometry).toBe(siblingGeometry)

    surface.onPointerDown({} as MouseEvent, 20, 88)
    surface.onPointerUp({} as MouseEvent, 20, 88)
    surface.flushPendingRender()
    expect(surface.value).toBe("subtract")
    expect({
      select: surface.selectMaterializations,
      sibling: surface.siblingMaterializations,
    }).toEqual({select: 3, sibling: 1})
    expect(surface.sibling.children).toEqual(siblingChildren)
    expect((surface.sibling.children[0] as Mesh).geometry).toBe(siblingGeometry)
    surface.dispose()
  })

  test("resolves the exact retained pointer hit key for control focus ownership", () => {
    const fake = createFakeRuntime()
    const surface = new RetainedTestSurface()
    surface.attachCanvas(fake.runtime)
    surface.setRect({x: 0, y: 0, w: 120, h: 100}, 0.001, font)
    const parent = surface.createParent("focus-owner")
    surface.materialize(parent, () => {
      surface.stageHit(parent, {x: 10, y: 20, w: 40, h: 24}, () => {}, {key: "retained-input"})
    })
    expect(surface.pointerHitKey(20, 30)).toBe("retained-input")
    expect(surface.pointerHitKey(80, 80)).toBeNull()
    surface.dispose()
  })
})

function requiredLayer(surface: UiSurface, name: string): Object3D {
  const layer = surface.node.getObjectByName(name)
  if (layer === undefined) throw new Error(`Missing Surface layer: ${name}`)
  return layer
}
