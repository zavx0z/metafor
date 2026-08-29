import {describe, expect, test} from "bun:test"
import type {TrueTypeFont} from "@engine/core"
import {createDocument} from "@zavx0z/dom"
import {createBulkHudController} from "./hud-controller.ts"
import {createBulkDomOverlayRuntime} from "./overlay-runtime.ts"

describe("Bulk DOM overlay runtime", () => {
  test("projects the HUD into the existing renderer overlay and resizes in place", async () => {
    const canvas = new FakeCanvas(960, 640) as unknown as HTMLCanvasElement
    let requests = 0
    let invalidations = 0
    const runtime = createBulkDomOverlayRuntime({
      canvas,
      renderer: {
        invalidateGeometry() { invalidations += 1 },
      },
      font: fakeFont(),
      width: 960,
      height: 640,
      requestFrame() { requests += 1 },
    })
    const controller = createBulkHudController({
      document: runtime.document,
      transport: {
        async stack() { return [] },
        async pause() {},
        async resume() {},
      },
    })
    await controller.ready

    const frame = runtime.flush()
    expect(frame.document).toBe(runtime.document)
    expect(frame.root).toBe(runtime.document)
    expect(frame.viewport).toEqual({width: 960, height: 640})
    expect(frame.displayList.length).toBeGreaterThan(0)
    expect(frame.hits.has(controller.element)).toBeTrue()
    expect(controller.element.ownerDocument).toBe(runtime.document)
    expect(runtime.overlay.content).toBe(runtime.backend.root)
    expect(runtime.backend.root.children.length).toBe(frame.displayList.length)
    expect(requests).toBeGreaterThan(0)

    const foreignParent = createDocument().createElement("div")
    expect(() => createBulkHudController({
      document: runtime.document,
      parent: foreignParent,
      transport: {
        async stack() { return [] },
        async pause() {},
        async resume() {},
      },
    })).toThrow("another Document")

    const element = controller.element
    const resized = runtime.resize(720, 480)
    expect(resized.viewport).toEqual({width: 720, height: 480})
    expect(resized.revision).toBeGreaterThan(frame.revision)
    expect(controller.element).toBe(element)

    controller.dispose()
    runtime.flush()
    expect(runtime.frame.displayList).toEqual([])
    runtime.dispose()
    expect(invalidations).toBeGreaterThan(0)
    expect(() => runtime.flush()).toThrow("disposed")
  })

  test("uses only the direct DOM, renderer and renderer-webgpu owners", async () => {
    const source = await Bun.file(new URL("./overlay-runtime.ts", import.meta.url)).text()

    expect(source).toContain('from "@zavx0z/dom"')
    expect(source).toContain('from "@zavx0z/renderer"')
    expect(source).toContain('from "@zavx0z/renderer-webgpu"')
    expect(source).toContain("RendererWebGpuScreenOverlay")
    for (const forbidden of [
      "@layout/core",
      "@ui/elements",
      "@ui/hud",
      "createDocumentCanvasRuntime",
      "new Renderer()",
      "new Space()",
      "new ViewPoint()",
    ]) expect(source).not.toContain(forbidden)
  })

  test("keeps one direct Engine world beside the one Experience HUD projection", async () => {
    const [viewport, client] = await Promise.all([
      Bun.file(new URL("../web/index.ts", import.meta.url)).text(),
      Bun.file(new URL("../client.ts", import.meta.url)).text(),
    ])

    expect(viewport).toContain("const renderer = new Renderer()")
    expect(viewport).toContain("const space = new Space()")
    expect(viewport.match(/new Space\(\)/g)).toHaveLength(1)
    expect(viewport).toContain("const domRuntime = createBulkDomOverlayRuntime({")
    expect(viewport).toContain("renderer.renderFrame(space, domRuntime.overlay, viewPoint)")
    expect(viewport).toContain("uiDocument: domRuntime.document")
    expect(client).toContain("document: bulkViewport.uiDocument")
  })
})

class FakeCanvas extends EventTarget {
  readonly style = {cursor: ""}
  readonly parentElement = null
  readonly #captured = new Set<number>()

  constructor(readonly width: number, readonly height: number) {
    super()
  }

  getBoundingClientRect(): DOMRect {
    return {
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: this.width,
      bottom: this.height,
      width: this.width,
      height: this.height,
      toJSON: () => ({}),
    } as DOMRect
  }

  setPointerCapture(pointerId: number): void {
    this.#captured.add(pointerId)
  }

  hasPointerCapture(pointerId: number): boolean {
    return this.#captured.has(pointerId)
  }

  releasePointerCapture(pointerId: number): void {
    this.#captured.delete(pointerId)
  }
}

function fakeFont(): TrueTypeFont {
  return {
    unitsPerEm: 1_000,
    mapCharToGlyph: () => 0,
    getGlyphOutline: () => ({
      points: new Float32Array(),
      onCurve: new Uint8Array(),
      contours: new Uint16Array(),
    }),
    getHMetric: () => ({advanceWidth: 500, lsb: 0}),
  } as unknown as TrueTypeFont
}
