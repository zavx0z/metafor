import {beforeAll, describe, expect, test} from "bun:test"
import {BufferGeometry, Object3D, TrueTypeFont} from "@metafor/engine"
import type {UiRuntime} from "./runtime.ts"
import {
  UiSurface,
  type DismissReason,
} from "./surface.ts"
import type {UiSurfaceRect} from "./runtime.ts"

class PopoverTestSurface extends UiSurface {
  createParent(): Object3D {
    return this.createRetainedParent()
  }

  materialize(parent: Object3D, draw: () => void): void {
    this.materializeRetainedParent(parent, draw)
  }

  transform(parent: Object3D, update: (parent: Object3D) => void): void {
    this.updateRetainedTransform(parent, update)
  }

  protected render(): void {}
}

const createFakeRuntime = (): UiRuntime => ({
  canvas: {style: {}},
  renderer: {pixelRatio: 1, invalidateGeometry(_geometry: BufferGeometry) {}},
  requestRender() {},
  uiRectToFramebufferClipBounds: (
    xMin: number,
    yMin: number,
    xMax: number,
    yMax: number,
  ): [number, number, number, number] => [xMin, yMin, xMax, yMax],
} as unknown as UiRuntime)

let font: TrueTypeFont

beforeAll(async () => {
  const bytes = await Bun.file(new URL("../../engine/static/JetBrainsMono-Bold.ttf", import.meta.url)).arrayBuffer()
  font = new TrueTypeFont(bytes)
})

describe("UiSurface dismissable popover layer", () => {
  test("keeps dismissal records atomic on failed rematerialization and clears stale owners", () => {
    const surface = new PopoverTestSurface()
    const dismissed: string[] = []
    try {
      surface.attachCanvas(createFakeRuntime())
      surface.setRect({x: 0, y: 0, w: 200, h: 120}, 0.001, font)
      const owner = surface.createParent()
      surface.materialize(owner, () => surface.dismissableLayer({
        key: "old",
        regions: [{x: 0, y: 0, w: 20, h: 20}],
        dismiss: () => dismissed.push("old"),
      }))
      expect(() => surface.materialize(owner, () => {
        surface.dismissableLayer({
          key: "new",
          regions: [{x: 0, y: 0, w: 20, h: 20}],
          dismiss: () => dismissed.push("new"),
        })
        throw new Error("staging failed")
      })).toThrow("staging failed")

      expect(surface.dismissTopLayer("escape")).toBeTrue()
      expect(dismissed).toEqual(["old"])
      surface.materialize(owner, () => {})
      expect(surface.dismissTopLayer("escape")).toBeFalse()
    } finally {
      surface.dispose()
    }
  })

  test("stages regions under the exact retained owner and dismisses outside/Escape", () => {
    const surface = new PopoverTestSurface()
    const dismissed: DismissReason[] = []
    try {
      surface.attachCanvas(createFakeRuntime())
      surface.setRect({x: 0, y: 0, w: 240, h: 180}, 0.001, font)
      const owner = surface.createParent()
      let viewport: UiSurfaceRect | undefined
      surface.materialize(owner, () => {
        viewport = surface.interactionViewport()
        surface.dismissableLayer({
          key: "popover",
          regions: [
            {x: 20, y: 20, w: 80, h: 22},
            {x: 20, y: 44, w: 120, h: 80},
          ],
          dismiss: (reason) => dismissed.push(reason),
        })
      })
      expect(viewport?.x).toBeCloseTo(0)
      expect(viewport?.y).toBeCloseTo(0)
      expect(viewport?.w).toBeCloseTo(240)
      expect(viewport?.h).toBeCloseTo(180)

      const pointer = {button: 0, preventDefault() {}} as MouseEvent
      surface.onPointerDown(pointer, 30, 30)
      expect(dismissed).toEqual([])
      surface.onPointerDown(pointer, 200, 150)
      expect(dismissed).toEqual(["outside"])
      expect(surface.dismissTopLayer("escape")).toBeTrue()
      expect(dismissed).toEqual(["outside", "escape"])
    } finally {
      surface.dispose()
    }
  })

  test("converts viewport and outside points through the retained transform", () => {
    const surface = new PopoverTestSurface()
    const dismissed: DismissReason[] = []
    try {
      surface.attachCanvas(createFakeRuntime())
      surface.setRect({x: 0, y: 0, w: 200, h: 120}, 0.001, font)
      const owner = surface.createParent()
      surface.transform(owner, (target) => {
        target.position.set(0.05, 0, 0)
        target.scale.set(2, 2, 1)
      })
      let viewport: UiSurfaceRect | undefined
      surface.materialize(owner, () => {
        viewport = surface.interactionViewport()
        surface.dismissableLayer({
          key: "transformed",
          regions: [{x: 10, y: 10, w: 20, h: 20}],
          dismiss: (reason) => dismissed.push(reason),
        })
      })
      expect(viewport?.x).toBeCloseTo(-25)
      expect(viewport?.y).toBeCloseTo(0)
      expect(viewport?.w).toBeCloseTo(100)
      expect(viewport?.h).toBeCloseTo(60)

      const pointer = {button: 0, preventDefault() {}} as MouseEvent
      surface.onPointerDown(pointer, 80, 40)
      expect(dismissed).toEqual([])
      surface.onPointerDown(pointer, 40, 40)
      expect(dismissed).toEqual(["outside"])
    } finally {
      surface.dispose()
    }
  })
})
