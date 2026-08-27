import {loadDocumentDefaultFont} from "@engine/core/default-font"
import {codeEditorCss} from "@ui/components/code-editor"
import {
  createDocument,
  type CustomEvent as DomCustomEvent,
  type Document as SemanticDocument,
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
  type StorybookRouteTreeNode,
} from "@zavx0z/storybook/route-tree"
import type {GraphDomStory} from "./dom-story.ts"
import {
  createGraphOverview,
  graphOverviewCss,
} from "./overview.ts"
import {
  GRAPH_STORIES,
  graphCatalogItems,
  graphOverviewInput,
  graphSectionItems,
  graphVariantItems,
  isGraphStoryRoute,
} from "./stories.ts"
import {graphDomStoryCss} from "./stories/source.ts"

const canvas = document.getElementById("quantum-storybook-canvas")
if (!(canvas instanceof HTMLCanvasElement)) throw new Error("Canvas лаборатории Graph не найден")

declare global {
  var __quantumGraphStorybookCapturePresentedFrame: (() => Promise<Blob | null>) | undefined
}

document.documentElement.dataset.quantumStorybook = "starting"
document.documentElement.dataset.quantumStorybookPage = "graph"
document.documentElement.dataset.quantumStorybookPipeline = "dom-webgpu"

try {
  const graphMountPath = storybookPublicPath("quantum", "/graph")
  const router = new StorybookRouteTreeRouter(GRAPH_STORIES.routeTree, {
    basePath: graphMountPath,
  })
  const routeNode = router.current
  const semanticDocument = createDocument()
  const story = await createRouteStory(semanticDocument, routeNode)
  const catalogItems = graphCatalogItems()
  const secondaryItems = graphSectionItems(routeNode.path)
  const scenarioItems = graphVariantItems(routeNode.path)
  const workbench = createStorybookDomWorkbench({
    document: semanticDocument,
    parent: semanticDocument,
    initial: {
      title: "Quantum · Graph",
      "catalog.label": "Лаборатория Graph",
      "catalog.items": catalogItems,
      "catalog.active": activeCatalog(routeNode.path, catalogItems),
      "secondary.label": secondaryLabel(routeNode.path),
      "secondary.items": secondaryItems,
      "secondary.active": activeSecondary(routeNode.path, secondaryItems),
      "preview.label": routeTitle(routeNode),
      "preview.node": story.element,
      "scenarios.label": "Варианты",
      "scenarios.items": scenarioItems,
      "scenarios.active": routeNode.kind === "leaf" ? routeNode.path : null,
      "inspector.label": "Исходный код",
      "inspector.source": story.source,
      status: {
        lead: "Создано для ",
        owner: "MetaFor",
        detail: " · Graph HTML DOM → WebGPU",
      },
    },
  })

  const font = await loadDocumentDefaultFont()
  const runtime = await createDocumentCanvasRuntime({
    canvas,
    document: semanticDocument,
    root: workbench.element,
    styleSheets: [
      storybookDomWorkbenchCss,
      codeEditorCss,
      graphDomStoryCss,
      graphOverviewCss,
    ],
    font,
    tooltipDelayMs: 500,
    distance: 600,
  })
  globalThis.__quantumGraphStorybookCapturePresentedFrame = () =>
    runtime.captureLastPresentedFramePng()
  let disposed = false

  const publish = (): void => {
    const source = story.source
    workbench.update("inspector.source", source)
    document.documentElement.dataset.quantumStorybookPath = routeNode.path
    document.documentElement.dataset.quantumStorybookRouteKind = routeNode.kind
    document.documentElement.dataset.quantumStorybookRoute = routeNode.path
    document.documentElement.dataset.quantumStorybookArgs = JSON.stringify(story.args)
    document.documentElement.dataset.quantumStorybookHtml = source.html
    document.documentElement.dataset.quantumStorybookCss = source.css
    document.documentElement.dataset.quantumStorybookTypescript = source.typescript
    document.documentElement.dataset.quantumStorybookPanelCategory = "source"
    const snapshot = "snapshot" in story && typeof story.snapshot === "function"
      ? story.snapshot()
      : null
    if (snapshot === null) delete document.documentElement.dataset.quantumStorybookNodeTree
    else document.documentElement.dataset.quantumStorybookNodeTree = JSON.stringify(snapshot)
    runtime.requestRender()
  }
  const navigate = (targetRoute: string): void => {
    const target = GRAPH_STORIES.routeTree.find(targetRoute)
    if (target === undefined) throw new Error(`Неизвестный путь лаборатории Graph: ${targetRoute}`)
    const pathname = storybookRouteTreeUrl(GRAPH_STORIES.routeTree, target.path, {
      basePath: graphMountPath,
    })
    if (pathname === window.location.pathname) {
      runtime.requestRender()
      return
    }
    window.location.assign(pathname)
  }
  const onNavigate = (event: unknown): void => {
    navigate((event as DomCustomEvent<{route: string}>).detail.route)
  }
  const onScenario = (event: unknown): void => {
    navigate((event as DomCustomEvent<{id: string}>).detail.id)
  }
  const onStoryChange = (): void => publish()
  story.element.addEventListener("change", onStoryChange)
  workbench.element.addEventListener(STORYBOOK_DOM_WORKBENCH_EVENTS.navigate, onNavigate)
  workbench.element.addEventListener(STORYBOOK_DOM_WORKBENCH_EVENTS.scenario, onScenario)

  const dispose = (): void => {
    if (disposed) return
    disposed = true
    story.element.removeEventListener("change", onStoryChange)
    workbench.element.removeEventListener(STORYBOOK_DOM_WORKBENCH_EVENTS.navigate, onNavigate)
    workbench.element.removeEventListener(STORYBOOK_DOM_WORKBENCH_EVENTS.scenario, onScenario)
    router.dispose()
    story.dispose()
    workbench.dispose()
    runtime.dispose()
    globalThis.__quantumGraphStorybookCapturePresentedFrame = undefined
  }
  window.addEventListener("pagehide", dispose, {once: true})

  publish()
  await waitForStorybookFrameBoundary()
  document.documentElement.dataset.quantumStorybook = "ready"
} catch (error) {
  document.documentElement.dataset.quantumStorybook = "error"
  document.documentElement.dataset.quantumStorybookError = error instanceof Error
    ? error.stack ?? error.message
    : String(error)
  console.error(error)
  throw error
}

async function createRouteStory(
  document: SemanticDocument,
  route: StorybookRouteTreeNode<string>,
): Promise<GraphDomStory> {
  if (route.kind === "leaf") {
    if (!isGraphStoryRoute(route.path)) throw new Error(`Неизвестный Graph story: ${route.path}`)
    const factory = await GRAPH_STORIES.load(route.path)
    return factory(document)
  }
  return createGraphOverview(document, graphOverviewInput(route.path))
}

function activeCatalog(
  route: string,
  items: readonly Readonly<{id: string}>[],
): string | null {
  const candidate = route.split("/")[0] ?? ""
  return items.some(({id}) => id === candidate) ? candidate : null
}

function activeSecondary(
  route: string,
  items: readonly Readonly<{id: string}>[],
): string | null {
  const parts = route.split("/")
  if (parts.length < 2) return null
  const candidate = parts.slice(0, 2).join("/")
  return items.some(({id}) => id === candidate) ? candidate : null
}

function secondaryLabel(route: string): string {
  const componentId = route.split("/")[0]
  return GRAPH_STORIES.index.find((item) => item.componentId === componentId)?.componentLabel ?? "Разделы"
}

function routeTitle(route: StorybookRouteTreeNode<string>): string {
  if (route.kind === "leaf") return GRAPH_STORIES.find(route.path)?.title ?? route.path
  return route.path.length === 0 ? "Graph · Обзор" : `${route.path} · Обзор`
}
