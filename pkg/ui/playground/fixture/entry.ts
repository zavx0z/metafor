import {type Object3D} from "@metafor/engine"
import {Pane, Typography} from "@ui/components"
import {UiRuntime, UiSurface} from "@ui/elements"
import {
  PlaygroundBackdropSurface,
  PlaygroundDockSurface,
  PlaygroundInfoSurface,
  PlaygroundNavigationSurface,
  PlaygroundRouter,
  definePlaygroundRoutes,
  planPlaygroundShell,
  type PlaygroundNavigationItem,
} from "@ui/playground"

type Route = "overview" | "details"
const routes = ["overview", "details"] as const
const routeDeclaration = definePlaygroundRoutes({routes, fallback: "overview"})
const items: readonly PlaygroundNavigationItem<Route>[] = [
  {id: "overview", label: "Overview", route: "overview"},
  {id: "details", label: "Details", route: "details"},
]

class FixturePreviewSurface extends UiSurface {
  #route: Route
  readonly #previewParent: Object3D
  #materialized: Readonly<{route: Route; w: number; h: number; pixelScale: number; font: unknown}> | null = null
  #layoutPlans = 0
  #materializations = 0

  constructor(route: Route) {
    super({bgColor: null, borderColor: null})
    this.#route = route
    this.#previewParent = this.createRetainedParent()
    this.#previewParent.name = "FixturePreviewSurface.preview"
  }

  get diagnostics(): Readonly<{layoutPlans: number; materializations: number}> {
    return Object.freeze({layoutPlans: this.#layoutPlans, materializations: this.#materializations})
  }

  setRoute(route: Route): void {
    if (this.#route === route) return
    this.#route = route
    this.requestRender()
  }

  protected override render(): void {
    const previous = this.#materialized
    const geometryChanged = previous === null || previous.w !== this.rectW || previous.h !== this.rectH ||
      previous.pixelScale !== this.pixelScale || previous.font !== this.font
    if (!geometryChanged && previous.route === this.#route) return
    if (geometryChanged) this.#layoutPlans += 1
    this.materializeRetainedParent(this.#previewParent, () => {
      Pane(this, 0, 0, this.rectW, this.rectH, {
        variant: "glass",
        sx: {background: "rgba(8, 13, 22, 0.72)", borderColor: "rgba(214, 231, 255, 0.22)", borderRadius: 38},
      })
      Typography(this, 42, 42, this.rectW - 84, 42, {
        children: this.#route === "overview" ? "Reusable playground shell" : "Consumer-owned preview",
        variant: "title",
      })
    })
    this.#materializations += 1
    this.#materialized = {
      route: this.#route,
      w: this.rectW,
      h: this.rectH,
      pixelScale: this.pixelScale,
      font: this.font,
    }
  }
}

const canvas = document.getElementById("playground-canvas")
if (!(canvas instanceof HTMLCanvasElement)) throw new Error("playground-canvas not found")
const runtime = await UiRuntime.create(canvas, {
  fontUrl: "/JetBrainsMono-Bold.ttf",
  virtualDisplay: {initial: "near", surfaceDisplay: true, grid: false},
})
const router = new PlaygroundRouter(routeDeclaration)
const navigate = (route: Route): void => router.go(route)
const backdrop = new PlaygroundBackdropSurface()
const catalog = new PlaygroundNavigationSurface<Route>({title: "Playground", items, route: router.current, onNavigate: navigate})
const sections = new PlaygroundNavigationSurface<Route>({title: "Sections", items, route: router.current, onNavigate: navigate})
const dock = new PlaygroundDockSurface<Route>({title: "Routes", items, route: router.current, onNavigate: navigate})
const info = new PlaygroundInfoSurface({title: "Package contract", lines: ["Generic shell", "Consumer preview"], status: router.current})
const preview = new FixturePreviewSurface(router.current)

const frames = (w: number, h: number) => planPlaygroundShell(w, h)
runtime.addSurface(backdrop, ({w, h}) => ({x: 0, y: 0, w, h}))
runtime.addSurface(catalog, ({w, h}) => frames(w, h).catalog)
runtime.addSurface(sections, ({w, h}) => frames(w, h).section)
runtime.addSurface(preview, ({w, h}) => frames(w, h).preview)
runtime.addSurface(dock, ({w, h}) => frames(w, h).dock)
runtime.addSurface(info, ({w, h}) => frames(w, h).info)

const publishRetainedDiagnostics = (): void => {
  for (const surface of [catalog, sections, dock, info, preview]) surface.flushPendingRender()
  document.documentElement.dataset.playgroundRetained = JSON.stringify({
    catalog: catalog.diagnostics,
    sections: sections.diagnostics,
    dock: dock.diagnostics,
    info: info.diagnostics,
    preview: preview.diagnostics,
  })
}

router.subscribe((route) => {
  catalog.setOptions({title: "Playground", items, route, onNavigate: navigate})
  sections.setOptions({title: "Sections", items, route, onNavigate: navigate})
  dock.setOptions({title: "Routes", items, route, onNavigate: navigate})
  info.setOptions({title: "Package contract", lines: ["Generic shell", "Consumer preview"], status: route})
  preview.setRoute(route)
  document.documentElement.dataset.playgroundRoute = route
  publishRetainedDiagnostics()
})
document.documentElement.dataset.playgroundReady = "ready"
document.documentElement.dataset.playgroundRoute = router.current
new ResizeObserver(() => {
  runtime.handleResize()
  publishRetainedDiagnostics()
}).observe(canvas)
runtime.handleResize()
publishRetainedDiagnostics()
