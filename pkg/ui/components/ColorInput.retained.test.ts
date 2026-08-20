import {beforeAll, describe, expect, test} from "bun:test"
import {
  BufferGeometry,
  Color,
  ColorPickerMaterial,
  Mesh,
  Object3D,
  TrueTypeFont,
} from "@metafor/engine"
import {type UiRuntime, UiSurface} from "@ui/elements"
import {ColorInput, type ColorInputValue} from "./ColorInput.ts"

class RetainedColorSurface extends UiSurface {
  readonly colorOwner: Object3D
  readonly siblingOwner: Object3D
  color: ColorInputValue = Object.freeze({r: 1, g: 0, b: 0.5, a: 0.25})
  readonly published: ColorInputValue[] = []
  colorMaterializations = 0
  siblingMaterializations = 0
  siblingActions = 0
  #mounted = false

  constructor() {
    super({bgColor: null, borderColor: null})
    const root = this.createRetainedParent()
    this.colorOwner = this.createRetainedParent(root)
    this.siblingOwner = this.createRetainedParent(root)
  }

  protected render(): void {
    if (this.#mounted) return
    this.#mounted = true
    this.materializeRetainedParent(this.colorOwner, this.#drawColor)
    this.materializeRetainedParent(this.siblingOwner, () => {
      this.siblingMaterializations += 1
      this.drawRect(26, 49, 112, 112, new Color(0.2, 0.3, 0.4, 1))
      this.hit(26, 49, 112, 112, () => { this.siblingActions += 1 }, {key: "later-color-sibling"})
    })
  }

  readonly #drawColor = (): void => {
    this.colorMaterializations += 1
    ColorInput(this, 20, 20, 146, 22, {
      key: "retained-color",
      value: this.color,
      onChange: (value) => {
        this.color = value
        this.published.push(value)
      },
    })
  }
}

const createFakeRuntime = (): UiRuntime => ({
  canvas: {style: {}},
  renderer: {
    pixelRatio: 1,
    invalidateGeometry(_geometry: BufferGeometry) {},
  },
  requestRender() {},
  uiRectToFramebufferClipBounds: (
    xMin: number,
    yMin: number,
    xMax: number,
    yMax: number,
  ): [number, number, number, number] => [xMin, yMin, xMax, yMax],
} as unknown as UiRuntime)

const pickerPlanes = (root: Object3D): Mesh[] => {
  const meshes: Mesh[] = []
  const visit = (object: Object3D): void => {
    if (object instanceof Mesh && object.material instanceof ColorPickerMaterial) meshes.push(object)
    for (const child of object.children) visit(child)
  }
  visit(root)
  return meshes
}

let font: TrueTypeFont

beforeAll(async () => {
  const bytes = await Bun.file(new URL("../../engine/static/JetBrainsMono-Bold.ttf", import.meta.url)).arrayBuffer()
  font = new TrueTypeFont(bytes)
})

describe("retained ColorInput owner", () => {
  test("opens, drags continuously and dismisses by outside/Escape while rematerializing only its exact parent", () => {
    const surface = new RetainedColorSurface()
    try {
      surface.attachCanvas(createFakeRuntime())
      surface.setRect({x: 0, y: 0, w: 320, h: 240}, 0.001, font)
      const siblingChildren = [...surface.siblingOwner.children]
      const siblingGeometries = siblingChildren.map((child) => (child as {geometry?: BufferGeometry}).geometry)
      const overlay = surface.node.getObjectByName("RetainedColorSurface.retainedOverlayLayer")
      expect(overlay).toBeDefined()
      expect(pickerPlanes(surface.node)).toHaveLength(1)
      expect(overlay!.children).toHaveLength(0)

      const pointer = {button: 0, preventDefault() {}} as MouseEvent
      surface.onPointerDown(pointer, 31, 31)
      surface.flushPendingRender()
      surface.onPointerUp(pointer, 31, 31)
      surface.flushPendingRender()
      expect(pickerPlanes(surface.colorOwner)).toHaveLength(1)
      expect(pickerPlanes(surface.node)).toHaveLength(4)
      expect(overlay!.children).toHaveLength(1)
      expect(surface.siblingMaterializations).toBe(1)
      expect(surface.siblingOwner.children).toEqual(siblingChildren)

      const beforeDragMaterializations = surface.colorMaterializations
      surface.onPointerDown(pointer, 138, 105)
      surface.flushPendingRender()
      surface.onPointerMove(pointer, 82, 161)
      surface.flushPendingRender()
      expect(surface.published).toHaveLength(2)
      expect(surface.siblingActions).toBe(0)
      expect(surface.published.every((value) => Object.isFrozen(value))).toBeTrue()
      expect(surface.colorMaterializations).toBe(beforeDragMaterializations + 2)
      expect(pickerPlanes(surface.node)).toHaveLength(4)
      expect(surface.siblingMaterializations).toBe(1)
      expect(surface.siblingOwner.children).toEqual(siblingChildren)
      expect(surface.siblingOwner.children.map((child) => (child as {geometry?: BufferGeometry}).geometry)).toEqual(siblingGeometries)

      surface.onPointerUp(pointer, 82, 161)
      surface.flushPendingRender()
      expect(pickerPlanes(surface.node)).toHaveLength(4)

      surface.onPointerDown(pointer, 280, 220)
      surface.flushPendingRender()
      expect(pickerPlanes(surface.node)).toHaveLength(1)
      expect(overlay!.children).toHaveLength(0)

      surface.onPointerDown(pointer, 31, 31)
      surface.flushPendingRender()
      surface.onPointerUp(pointer, 31, 31)
      surface.flushPendingRender()
      expect(pickerPlanes(surface.node)).toHaveLength(4)
      expect(overlay!.children).toHaveLength(1)
      expect(surface.dismissTopLayer("escape")).toBeTrue()
      surface.flushPendingRender()
      expect(pickerPlanes(surface.node)).toHaveLength(1)
      expect(overlay!.children).toHaveLength(0)
      expect(surface.siblingMaterializations).toBe(1)
      expect(surface.siblingOwner.children).toEqual(siblingChildren)
    } finally {
      surface.dispose()
    }
  })
})
