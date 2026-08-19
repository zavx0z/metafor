import {beforeAll, describe, expect, test} from "bun:test"
import {join} from "node:path"
import {fileURLToPath} from "node:url"
import {TrueTypeFont} from "@metafor/engine"
import {planPlaygroundShell} from "@ui/playground"
import type {UiRuntime} from "@ui/elements"
import {
  ELEMENT_PLAYGROUND_CATALOG,
  ELEMENT_PLAYGROUND_ROUTES,
  ElementsPreviewSurface,
  elementsPlaygroundDock,
  elementsPlaygroundGroup,
  elementsPlaygroundSectionRoute,
  elementsPlaygroundSections,
} from "./entry.ts"

const playgroundRoot = fileURLToPath(new URL(".", import.meta.url))
let font: TrueTypeFont

beforeAll(async () => {
  const bytes = await Bun.file(new URL("../../../engine/static/JetBrainsMono-Bold.ttf", import.meta.url)).arrayBuffer()
  font = new TrueTypeFont(bytes)
})

describe("restored @ui/elements playground", () => {
  test("preserves every historical route and maps it through public shell descriptors", () => {
    expect(ELEMENT_PLAYGROUND_ROUTES).toEqual([
      "div",
      "div/scroll",
      "span",
      "button",
      "input",
      "img",
      "ul",
      "layout/flex",
      "layout/flex-css",
      "style/css",
      "style/theme",
      "events",
    ])
    expect(ELEMENT_PLAYGROUND_CATALOG.map(({label}) => label)).toEqual(["Primitives", "Layout", "Style", "Events"])
    expect(elementsPlaygroundGroup("layout/flex-css")).toBe("Layout")
    expect(elementsPlaygroundSections("style/theme").map(({route}) => route)).toEqual(["style/css", "style/theme"])
    expect(elementsPlaygroundSectionRoute("div/scroll")).toBe("div")
    expect(elementsPlaygroundDock("div").map(({route}) => route)).toEqual([
      "div|background",
      "div|border",
      "div|padding",
      "div|zIndex",
      "div/scroll|scroll",
    ])
  })

  test("uses the public retained shell and keeps product semantics outside the package consumer", async () => {
    const entry = await Bun.file(join(playgroundRoot, "entry.ts")).text()
    expect(entry).toContain('from "@ui/playground"')
    expect(entry).toContain("PlaygroundNavigationSurface")
    expect(entry).toContain("PlaygroundDockSurface")
    expect(entry).toContain("PlaygroundInfoSurface")
    expect(entry).toContain("PlaygroundBackdropSurface")
    expect(entry).toContain("planPlaygroundShell")
    expect(entry).toContain("createRetainedParent")
    expect(entry).toContain("materializeRetainedParent")
    for (const duplicate of ["#catalog(", "#sectionPanel(", "#dock(", "#parameters(", "VirtualRouter"]) {
      expect(entry).not.toContain(duplicate)
    }
    for (const forbidden of ["NodeEditor", "NodeCanvas", "BlenderSocket", "NodeSystemSurface", "Hamiltonian", "Bulk"]) {
      expect(entry).not.toContain(forbidden)
    }
  })

  test("preserves public desktop geometry and mobile preview-only boundary", () => {
    const desktop = planPlaygroundShell(1920, 1080)
    expect(desktop.catalog).toEqual({x: 130, y: 110, w: 210, h: 860})
    expect(desktop.section).toEqual({x: 358, y: 110, w: 160, h: 860})
    expect(desktop.preview).toEqual({x: 536, y: 110, w: 936, h: 742})
    expect(desktop.dock).toEqual({x: 536, y: 870, w: 936, h: 100})
    expect(desktop.info).toEqual({x: 1490, y: 110, w: 300, h: 860})

    const mobile = planPlaygroundShell(390, 844)
    expect(mobile.compact).toBeTrue()
    expect(mobile.preview).toEqual({x: 8, y: 8, w: 374, h: 828})
    for (const frame of [mobile.catalog, mobile.section, mobile.dock, mobile.info]) expect(frame.visible).toBeFalse()
  })

  test("keeps retained preview identities and counters unchanged on pure parent transform", () => {
    const surface = new ElementsPreviewSurface("button", () => {})
    try {
      surface.attachCanvas(createFakeRuntime())
      surface.setRect({x: 0, y: 0, w: 936, h: 742}, 0.001, font)
      const initial = surface.diagnostics
      expect(initial.layoutPlans).toBe(1)
      expect(initial.materializations).toBe(1)
      expect(initial.childObjectIds.length).toBeGreaterThan(0)

      surface.transformPreview({x: 18, y: 24, scale: 1.15})
      expect(surface.diagnostics).toEqual(initial)

      surface.applyDockAction("button|click")
      surface.flushPendingRender()
      const changed = surface.diagnostics
      expect(changed.parentObjectId).toBe(initial.parentObjectId)
      expect(changed.layoutPlans).toBe(initial.layoutPlans + 1)
      expect(changed.materializations).toBe(initial.materializations + 1)
      expect(changed.childObjectIds).not.toEqual(initial.childObjectIds)
    } finally {
      surface.dispose()
    }
  })

  test("waits for a positive public-shell preview frame before retained materialization", () => {
    const surface = new ElementsPreviewSurface("div", () => {})
    try {
      surface.attachCanvas(createFakeRuntime())
      surface.setRect({x: 0, y: 0, w: 40, h: 446}, 0.001, font)
      expect(surface.diagnostics).toMatchObject({layoutPlans: 0, materializations: 0, childObjectIds: []})

      surface.setRect({x: 0, y: 0, w: 936, h: 742}, 0.001, font)
      expect(surface.diagnostics.layoutPlans).toBe(1)
      expect(surface.diagnostics.materializations).toBe(1)
      expect(surface.diagnostics.childObjectIds.length).toBeGreaterThan(0)
    } finally {
      surface.dispose()
    }
  })

  test("serves historical path routes through the public no-HMR server", async () => {
    const port = await freePort()
    const process = Bun.spawn(["bun", "playground/server.ts"], {
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      env: {...Bun.env, ELEMENTS_PLAYGROUND_PORT: String(port)},
      stdout: "pipe",
      stderr: "pipe",
    })
    try {
      const html = await waitForText(`http://127.0.0.1:${port}/layout/flex-css`)
      expect(html).toContain("<title>@ui/elements playground</title>")
      expect(html).toContain('<canvas id="stage-canvas"></canvas>')
      expect(html).toContain('<script type="module" src="/entry.js"></script>')

      const entry = await fetch(`http://127.0.0.1:${port}/entry.js`)
      const source = await entry.text()
      expect(entry.status).toBe(200)
      expect(entry.headers.get("content-type")).toContain("text/javascript")
      expect(source).toContain("elementsPlayground")
      expect(source).not.toContain("entry.js was not emitted")

      const serverSource = await Bun.file(join(playgroundRoot, "server.ts")).text()
      expect(serverSource).toContain("startPlaygroundServer")
      expect(serverSource).toContain("ELEMENTS_PLAYGROUND_PORT")
      expect(serverSource).toContain("7901")
      expect(serverSource).not.toContain("Bun.serve")
    } finally {
      process.kill()
      await process.exited
    }
  }, 30000)
})

function createFakeRuntime(): UiRuntime {
  return {
    canvas: {style: {}},
    renderer: {pixelRatio: 1, invalidateGeometry() {}},
    requestRender() {},
    uiRectToFramebufferClipBounds: (xMin: number, yMin: number, xMax: number, yMax: number) => [xMin, yMin, xMax, yMax],
  } as unknown as UiRuntime
}

async function freePort(): Promise<number> {
  const server = Bun.serve({hostname: "127.0.0.1", port: 0, fetch: () => new Response("probe")})
  const port = server.port
  server.stop(true)
  if (port === undefined) throw new Error("Bun did not allocate a test port")
  return port
}

async function waitForText(url: string): Promise<string> {
  let cause: unknown
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(url)
      if (response.ok) return response.text()
      cause = new Error(`HTTP ${response.status}`)
    } catch (error) {
      cause = error
    }
    await Bun.sleep(50)
  }
  throw new Error(`Elements playground did not start: ${String(cause)}`)
}
