import {beforeAll, describe, expect, test} from "bun:test"
import {join} from "node:path"
import {fileURLToPath} from "node:url"
import {TrueTypeFont} from "@metafor/engine"
import {FIELD_KINDS} from "@ui/components"
import {planPlaygroundShell} from "@ui/playground"
import type {UiRuntime} from "@ui/elements"
import {ComponentsPreviewSurface} from "./entry.ts"
import {
  FIELD_ROUTES,
  FIELD_SECTIONS,
  createFieldPlaygroundDefinitions,
  fieldRouteFromSection,
  fieldSectionFromRoute,
} from "./fields.ts"
import {
  COMPONENT_PLAYGROUND_CATALOG,
  COMPONENT_PLAYGROUND_ROUTE_DECLARATION,
  COMPONENT_PLAYGROUND_ROUTES,
  componentsPlaygroundCatalogRoute,
  componentsPlaygroundDock,
  componentsPlaygroundSectionRoute,
  componentsPlaygroundSections,
} from "./routes.ts"

const playgroundRoot = fileURLToPath(new URL(".", import.meta.url))
let font: TrueTypeFont

beforeAll(async () => {
  const bytes = await Bun.file(new URL("../../../engine/static/JetBrainsMono-Bold.ttf", import.meta.url)).arrayBuffer()
  font = new TrueTypeFont(bytes)
})

describe("restored @ui/components playground", () => {
  test("keeps the historical route shell and adds every universal Field kind", () => {
    const fields = createFieldPlaygroundDefinitions(() => {}, () => {})
    const kinds = new Set(fields.map(({kind}) => kind))
    for (const kind of FIELD_KINDS) expect(kinds.has(kind)).toBeTrue()
    expect(fields.find(({id}) => id === "boolean")).toMatchObject({kind: "boolean", presentation: "switch"})
    expect(FIELD_SECTIONS.map(fieldRouteFromSection)).toEqual([...FIELD_ROUTES])
    expect(FIELD_ROUTES.map(fieldSectionFromRoute)).toEqual([...FIELD_SECTIONS])
  })

  test("maps every historical route through public catalog, sections and dock descriptors", () => {
    expect(COMPONENT_PLAYGROUND_ROUTES).toEqual([
      "button/basic",
      "button/basic/text",
      "button/basic/contained",
      "button/basic/outlined",
      "button/icon-label",
      "button/icon-label/left",
      "button/icon-label/right",
      "button/sizes",
      "button/sizes/small",
      "button/sizes/medium",
      "button/sizes/large",
      "button/color",
      "button/color/primary",
      "button/color/success",
      "button/color/warning",
      "button/color/error",
      "button/color/neutral",
      "button/icon",
      "button/icon/svg",
      "pane/variants",
      "pane/variants/glass",
      "pane/variants/outlined",
      "pane/variants/filled",
      "field/values",
      "field/selection",
      "field/composite",
      "field/reference",
    ])
    expect(COMPONENT_PLAYGROUND_CATALOG.map(({label}) => label)).toEqual([
      "Button", "Pane", "Field", "Badge", "TextField", "Divider", "Scrollbar", "Scroll List", "Noti Stack",
    ])
    expect(COMPONENT_PLAYGROUND_ROUTE_DECLARATION).toEqual({
      location: "pathname",
      routes: COMPONENT_PLAYGROUND_ROUTES,
      fallback: "button/basic",
    })
    expect(componentsPlaygroundCatalogRoute("field/composite")).toBe("field/values")
    expect(componentsPlaygroundSections("button/color/error").map(({route}) => route)).toEqual([
      "button/basic", "button/icon", "button/icon-label", "button/sizes", "button/color",
    ])
    expect(componentsPlaygroundSectionRoute("button/color/error")).toBe("button/color")
    expect(componentsPlaygroundSectionRoute("pane/variants/filled")).toBe("pane/variants")
    expect(componentsPlaygroundDock("field/selection").map(({route}) => route)).toEqual([...FIELD_ROUTES])
  })

  test("uses the public retained shell without manual five-panel duplication or Node ownership", async () => {
    const entry = await Bun.file(join(playgroundRoot, "entry.ts")).text()
    const routes = await Bun.file(join(playgroundRoot, "routes.ts")).text()
    expect(entry).toContain("Components")
    expect(routes).toContain("Field contract")
    expect(entry).toContain('from "@ui/playground"')
    expect(entry).toContain("PlaygroundNavigationSurface")
    expect(entry).toContain("PlaygroundDockSurface")
    expect(entry).toContain("PlaygroundInfoSurface")
    expect(entry).toContain("PlaygroundBackdropSurface")
    expect(entry).toContain("planPlaygroundShell")
    for (const duplicate of ["#catalog(", "#sectionPanel(", "#dock(", "#parameters(", "VirtualRouter"]) {
      expect(entry).not.toContain(duplicate)
    }
    for (const forbidden of ["NodeEditor", "NodeCanvas", "BlenderSocket", "NodeSystemSurface", "Hamiltonian", "Bulk"]) {
      expect(`${entry}\n${routes}`).not.toContain(forbidden)
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

  test("keeps retained preview identities on transform and dirties only one controlled Field", () => {
    const surface = new ComponentsPreviewSurface("field/values", () => {})
    try {
      surface.attachCanvas(createFakeRuntime())
      surface.setRect({x: 0, y: 0, w: 936, h: 742}, 0.001, font)
      const initial = surface.diagnostics
      const initialByKey = ownerDiagnostics(initial)
      expect(initialByKey.get("preview")?.materializations).toBe(1)
      for (const key of ["field:text", "field:number", "field:slider", "field:readonly"]) {
        expect(initialByKey.get(key)).toMatchObject({layoutPlans: 1, materializations: 1, visible: true})
      }

      surface.transformPreview({x: 18, y: 24, scale: 1.15})
      const transformed = ownerDiagnostics(surface.diagnostics)
      expect(transformed).toEqual(initialByKey)

      surface.setFieldValue("number", 0.75)
      surface.flushPendingRender()
      const changed = ownerDiagnostics(surface.diagnostics)
      for (const [key, before] of initialByKey) {
        const after = changed.get(key)!
        expect(after.objectId).toBe(before.objectId)
        if (key === "field:number") {
          expect(after.layoutPlans).toBe(before.layoutPlans + 1)
          expect(after.materializations).toBe(before.materializations + 1)
          expect(after.childObjectIds).not.toEqual(before.childObjectIds)
        } else {
          expect(after).toEqual(before)
        }
      }
    } finally {
      surface.dispose()
    }
  })

  test("wires a dev-only browser entry through the no-HMR public server", async () => {
    const server = await Bun.file(join(playgroundRoot, "server.ts")).text()
    expect(server).toContain("startPlaygroundServer")
    expect(server).toContain("4017")
    expect(server).toContain('packageName: "@ui/components"')
    expect(server).not.toContain("title:")
    expect(server).toContain('entrypoint: join(import.meta.dir, "entry.ts")')
    expect(server).toContain('canvasId: "stage-canvas"')
  })
})

function createFakeRuntime(): UiRuntime {
  return {
    canvas: {style: {}},
    renderer: {pixelRatio: 1, invalidateGeometry() {}},
    requestRender() {},
    uiRectToFramebufferClipBounds: (xMin: number, yMin: number, xMax: number, yMax: number) => [xMin, yMin, xMax, yMax],
  } as unknown as UiRuntime
}

function ownerDiagnostics(snapshot: ComponentsPreviewSurface["diagnostics"]): Map<string, Readonly<{
  key: string
  objectId: string
  childObjectIds: readonly string[]
  layoutPlans: number
  materializations: number
  visible: boolean
}>> {
  return new Map(snapshot.owners.map((owner) => [owner.key, owner]))
}
