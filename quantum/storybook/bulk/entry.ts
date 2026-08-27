import {loadDocumentDefaultFont} from "@engine/core/default-font"
import {
  createDocument,
  type CustomEvent as DomCustomEvent,
} from "@zavx0z/dom"
import {createDocumentCanvasRuntime} from "@zavx0z/renderer-browser"
import {
  STORYBOOK_DOM_WORKBENCH_EVENTS,
  createStorybookDomWorkbench,
  storybookDomWorkbenchCss,
} from "@zavx0z/storybook/workbench"
import {
  storybookPublicPath,
  waitForStorybookFrameBoundary,
} from "@zavx0z/storybook/environment"
import {
  StorybookRouteTreeRouter,
  storybookRouteTreeUrl,
} from "@zavx0z/storybook/route-tree"
import {
  BULK_STORY_ROUTE_TREE,
  isBulkStoryRoute,
} from "./stories.ts"
import {
  bulkHudOverviewCss,
  bulkHudStoryCss,
  createBulkHudOverview,
  createBulkHudStory,
} from "./story.ts"

const canvas = document.getElementById("quantum-storybook-canvas")
if (!(canvas instanceof HTMLCanvasElement)) throw new Error("Quantum Storybook canvas not found")

declare global {
  var __quantumBulkStorybookCapturePresentedFrame: (() => Promise<Blob | null>) | undefined
}

document.documentElement.dataset.quantumStorybook = "starting"
document.documentElement.dataset.quantumBulkStorybook = "starting"
document.documentElement.dataset.quantumStorybookPage = "bulk"
document.documentElement.dataset.quantumStorybookPipeline = "dom-webgpu"

try {
  const bulkMountPath = storybookPublicPath("quantum", "/bulk")
  const router = new StorybookRouteTreeRouter(BULK_STORY_ROUTE_TREE, {
    basePath: bulkMountPath,
  })
  const route = router.current.path
  const semanticDocument = createDocument()
  const presentation = isBulkStoryRoute(route)
    ? createBulkHudStory(semanticDocument)
    : createBulkHudOverview(semanticDocument, route as "" | "hud")
  const presentationCss = isBulkStoryRoute(route) ? bulkHudStoryCss : bulkHudOverviewCss
  const catalogItems = Object.freeze([
    Object.freeze({id: "hud", label: "Bulk HUD", route: "hud"}),
  ])
  const secondaryItems = Object.freeze([
    Object.freeze({id: "hud/default", label: "По умолчанию", route: "hud/default"}),
  ])
  const workbench = createStorybookDomWorkbench({
    document: semanticDocument,
    parent: semanticDocument,
    initial: {
      title: "Quantum · Bulk HUD",
      "catalog.label": "Bulk",
      "catalog.items": catalogItems,
      "catalog.active": route === "" ? null : "hud",
      "secondary.label": "HUD",
      "secondary.items": secondaryItems,
      "secondary.active": isBulkStoryRoute(route) ? route : null,
      "preview.label": isBulkStoryRoute(route) ? "Bulk HUD · По умолчанию" : "Bulk HUD · Обзор",
      "preview.node": presentation.element,
      "scenarios.label": "Сценарии",
      "scenarios.items": Object.freeze([]),
      "scenarios.active": null,
      "inspector.label": "Исходный код",
      "inspector.source": presentation.source,
      status: {
        lead: "Создано для ",
        owner: "MetaFor",
        detail: " · Bulk HTML DOM → WebGPU",
      },
    },
  })

  const font = await loadDocumentDefaultFont()
  const runtime = await createDocumentCanvasRuntime({
    canvas,
    document: semanticDocument,
    root: workbench.element,
    styleSheets: [storybookDomWorkbenchCss, presentationCss],
    font,
    tooltipDelayMs: 500,
    distance: 600,
  })
  globalThis.__quantumBulkStorybookCapturePresentedFrame = () =>
    runtime.captureLastPresentedFramePng()
  let disposed = false

  const publish = (): void => {
    const source = presentation.source
    workbench.update("inspector.source", source)
    document.documentElement.dataset.quantumStorybookPath = router.current.path
    document.documentElement.dataset.quantumStorybookRoute = `bulk/${router.current.path}`
    document.documentElement.dataset.quantumStorybookHtml = source.html
    document.documentElement.dataset.quantumStorybookCss = source.css
    document.documentElement.dataset.quantumStorybookTypescript = source.typescript
    runtime.requestRender()
  }
  const navigate = (targetRoute: string): void => {
    const target = BULK_STORY_ROUTE_TREE.find(targetRoute)
    if (target === undefined) throw new Error(`Unknown Bulk Storybook route: ${targetRoute}`)
    const targetPathname = storybookRouteTreeUrl(BULK_STORY_ROUTE_TREE, target.path, {
      basePath: bulkMountPath,
    })
    if (targetPathname === window.location.pathname) {
      runtime.requestRender()
      return
    }
    window.location.assign(targetPathname)
  }
  const onStoryInteraction = (): void => publish()
  const onNavigate = (event: unknown): void => {
    navigate((event as DomCustomEvent<{route: string}>).detail.route)
  }

  presentation.element.addEventListener("click", onStoryInteraction)
  presentation.element.addEventListener("pointerdown", onStoryInteraction)
  workbench.element.addEventListener(STORYBOOK_DOM_WORKBENCH_EVENTS.navigate, onNavigate)
  const dispose = (): void => {
    if (disposed) return
    disposed = true
    presentation.element.removeEventListener("click", onStoryInteraction)
    presentation.element.removeEventListener("pointerdown", onStoryInteraction)
    workbench.element.removeEventListener(STORYBOOK_DOM_WORKBENCH_EVENTS.navigate, onNavigate)
    if ("dispose" in presentation && typeof presentation.dispose === "function") {
      presentation.dispose()
    }
    router.dispose()
    workbench.dispose()
    runtime.dispose()
    globalThis.__quantumBulkStorybookCapturePresentedFrame = undefined
  }
  window.addEventListener("pagehide", dispose, {once: true})

  publish()
  await waitForStorybookFrameBoundary()
  document.documentElement.dataset.quantumStorybook = "ready"
  document.documentElement.dataset.quantumBulkStorybook = "ready"
} catch (error) {
  document.documentElement.dataset.quantumStorybook = "error"
  document.documentElement.dataset.quantumBulkStorybook = "error"
  document.documentElement.dataset.quantumStorybookError = error instanceof Error
    ? error.stack ?? error.message
    : String(error)
  console.error(error)
  throw error
}
