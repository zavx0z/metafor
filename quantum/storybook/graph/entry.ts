import {UiRuntime} from "@layout/core/runtime"
import {
  StorybookBackdropSurface,
  StorybookDockSurface,
  StorybookNavigationSurface,
  StorybookStoryPanelSurface,
  planStorybookShell,
  type StorybookResponsivePolicy,
  type StorybookStoryPanelOptions,
} from "@zavx0z/storybook/workbench"
import {
  StorybookRouteTreeRouter,
  type StorybookRouteTreeNode,
} from "@zavx0z/storybook/route-tree"
import {storybookPublicPath} from "@zavx0z/storybook/environment"
import {GraphStoryPreviewSurface} from "./preview.ts"
import {
  GRAPH_STORIES,
  graphCatalogItems,
  graphSectionItems,
  graphStorybookPresentationRoute,
  graphVariantItems,
  type GraphStoryRoute,
} from "./stories.ts"
import {GraphLabState} from "./state/lab-state.ts"

const GRAPH_MOUNT_PATH = storybookPublicPath("quantum", "/")
const GRAPH_STORYBOOK_RESPONSIVE: StorybookResponsivePolicy = Object.freeze({
  compactBelow: null,
  compactPanels: Object.freeze([]),
})

export type GraphStorybookObserver = Readonly<{
  snapshot(): Readonly<Record<string, unknown>>
  select(path: string): Promise<Readonly<Record<string, unknown>>>
  setControl(key: string, value: unknown): Readonly<Record<string, unknown>>
}>

declare global {
  var __quantumGraphStorybookObserver: GraphStorybookObserver | undefined
}

async function startGraphStorybook(): Promise<void> {
  const canvas = document.getElementById("quantum-storybook-canvas")
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error("Canvas лаборатории Graph не найден")
  document.documentElement.dataset.quantumStorybook = "starting"
  document.documentElement.dataset.quantumStorybookPage = "graph"
  try {
    const runtime = await UiRuntime.create(canvas, {
      virtualDisplay: {initial: "near", surfaceDisplay: true, grid: false},
    })
    runtime.handleResize()

    const router = new StorybookRouteTreeRouter(GRAPH_STORIES.routeTree, {
      basePath: GRAPH_MOUNT_PATH,
    })
    const initial = await loadStableGraphLabState(router)
    const initialNode = initial.node
    const state = initial.state
    let catalogQuery = ""
    let collapsedCatalogGroups = new Set<string>()

    const navigate = (path: string): void => {
      if (!router.go(path)) throw new Error(`Неизвестный путь лаборатории Graph: ${path}`)
    }
    const backdrop = new StorybookBackdropSurface()
    const catalog = new StorybookNavigationSurface<string>({
      title: "Лаборатория Graph",
      items: graphCatalogItems(collapsedCatalogGroups),
      route: componentPath(router.current.path),
      onNavigate: navigate,
      query: catalogQuery,
      searchPlaceholder: "Graph, API, эксперимент…",
      onQueryChange: handleCatalogQuery,
      onGroupToggle: handleCatalogGroupToggle,
    })
    const sections = new StorybookNavigationSurface<string>({
      title: state.story.componentLabel,
      items: graphSectionItems(state.route),
      route: sectionPath(router.current.path),
      onNavigate: navigate,
    })
    const dock = new StorybookDockSurface<string>({
      title: "Варианты",
      items: graphVariantItems(state.route),
      route: router.current.kind === "leaf" ? state.route : "",
      onNavigate: navigate,
    })
    const preview = new GraphStoryPreviewSurface()
    preview.setStory(state.story, state.module, state.args)
    let storyPanel: StorybookStoryPanelSurface

    const panelOptions = (): StorybookStoryPanelOptions => ({
      source: state.module.source(state.args),
      args: state.args,
      controls: state.module.controls,
      events: [
        {id: "route", label: "Сценарий", value: state.route},
        {id: "changes", label: "Изменения", value: String(state.snapshot().changes)},
        {id: "scope", label: "Контур", value: "Quantum Graph"},
      ],
      mode: state.panelMode,
      onModeChange(mode) {
        state.setPanelMode(mode)
        storyPanel.setOptions(panelOptions())
        publish()
      },
      onControlChange(key, value) {
        state.setControl(key, value)
        preview.setArgs(state.args)
        storyPanel.setOptions(panelOptions())
        publish()
      },
      async onCopy(source) {
        try {
          await navigator.clipboard.writeText(source)
          document.documentElement.dataset.quantumStorybookCopy = "copied"
        } catch {
          document.documentElement.dataset.quantumStorybookCopy = "error"
        }
      },
    })
    storyPanel = new StorybookStoryPanelSurface(panelOptions())

    const frames = (w: number, h: number) => planStorybookShell(w, h, {
      responsive: GRAPH_STORYBOOK_RESPONSIVE,
    })
    runtime.addSurface(backdrop, ({w, h}) => ({x: 0, y: 0, w, h}))
    runtime.addSurface(catalog, ({w, h}) => frames(w, h).catalog)
    runtime.addSurface(sections, ({w, h}) => frames(w, h).section)
    runtime.addSurface(preview, ({w, h}) => frames(w, h).preview)
    runtime.addSurface(dock, ({w, h}) => frames(w, h).dock)
    runtime.addSurface(storyPanel, ({w, h}) => frames(w, h).info)
    let presentedFrames = 0

    const snapshot = (): Readonly<Record<string, unknown>> => Object.freeze({
      path: router.current.path,
      pathKind: router.current.kind,
      ...state.snapshot(),
      catalog: catalog.diagnostics,
      sections: sections.diagnostics,
      dock: dock.diagnostics,
      preview: preview.diagnostics,
      panel: storyPanel.diagnostics,
      presentedFrames,
    })

    const publish = (): Readonly<Record<string, unknown>> => {
      for (const surface of [catalog, sections, dock, preview, storyPanel]) surface.flushPendingRender()
      runtime.space.updateWorldMatrix()
      runtime.renderer.renderFrame(runtime.space, runtime.hud, runtime.viewPoint)
      presentedFrames += 1
      const current = snapshot()
      document.documentElement.dataset.quantumStorybookPath = router.current.path
      document.documentElement.dataset.quantumStorybookRouteKind = router.current.kind
      document.documentElement.dataset.quantumStorybookRoute = state.route
      document.documentElement.dataset.quantumStorybookFrames = String(presentedFrames)
      document.documentElement.dataset.quantumStorybookState = JSON.stringify(current)
      return current
    }

    const applyNode = async (node: StorybookRouteTreeNode<string>): Promise<void> => {
      document.documentElement.dataset.quantumStorybook = "starting"
      state.invalidateSelection()
      const route = graphStorybookPresentationRoute(node.path)
      if (route !== state.route && !await state.select(route)) return
      if (router.current !== node) return
      catalog.setOptions(catalogOptions())
      sections.setOptions({
        title: state.story.componentLabel,
        items: graphSectionItems(state.route),
        route: sectionPath(node.path),
        onNavigate: navigate,
      })
      dock.setOptions({
        title: "Варианты",
        items: graphVariantItems(state.route),
        route: node.kind === "leaf" ? state.route : "",
        onNavigate: navigate,
      })
      preview.setStory(state.story, state.module, state.args)
      storyPanel.setOptions(panelOptions())
      runtime.relayout()
      publish()
      document.documentElement.dataset.quantumStorybook = "ready"
    }

    function catalogOptions() {
      return {
        title: "Лаборатория Graph",
        items: graphCatalogItems(collapsedCatalogGroups),
        route: componentPath(router.current.path),
        onNavigate: navigate,
        query: catalogQuery,
        searchPlaceholder: "Graph, API, эксперимент…",
        onQueryChange: handleCatalogQuery,
        onGroupToggle: handleCatalogGroupToggle,
      }
    }

    function handleCatalogQuery(query: string): void {
      catalogQuery = query
      catalog.setOptions(catalogOptions())
      publish()
    }

    function handleCatalogGroupToggle(groupId: string, collapsed: boolean): void {
      collapsedCatalogGroups = new Set(collapsedCatalogGroups)
      if (collapsed) collapsedCatalogGroups.add(groupId)
      else collapsedCatalogGroups.delete(groupId)
      catalog.setOptions(catalogOptions())
      publish()
    }

    router.subscribe((node) => {
      void applyNode(node).catch(publishGraphStorybookError)
    })
    globalThis.__quantumGraphStorybookObserver = Object.freeze({
      snapshot: publish,
      async select(path) {
        navigate(path)
        await applyNode(router.current)
        return snapshot()
      },
      setControl(key, value) {
        state.setControl(key, value)
        preview.setArgs(state.args)
        storyPanel.setOptions(panelOptions())
        return publish()
      },
    })
    new ResizeObserver(() => {
      runtime.handleResize()
      publish()
    }).observe(canvas)
    runtime.handleResize()
    if (router.current !== initialNode) {
      await applyNode(router.current)
      return
    }
    publish()
    if (router.current !== initialNode) return
    document.documentElement.dataset.quantumStorybook = "ready"
  } catch (error) {
    publishGraphStorybookError(error)
    throw error
  }
}

async function loadStableGraphLabState(
  router: StorybookRouteTreeRouter<string>,
): Promise<Readonly<{
  node: StorybookRouteTreeNode<string>
  state: GraphLabState
}>> {
  while (true) {
    const node = router.current
    const route = graphStorybookPresentationRoute(node.path)
    const state = await GraphLabState.create(route)
    if (router.current === node) return Object.freeze({node, state})
  }
}

function componentPath(path: string): string {
  return path.length === 0 ? "" : path.split("/", 1)[0] ?? ""
}

function sectionPath(path: string): string {
  return path.length === 0 ? "" : path.split("/").slice(0, 2).join("/")
}

function publishGraphStorybookError(error: unknown): void {
  document.documentElement.dataset.quantumStorybook = "error"
  document.documentElement.dataset.quantumStorybookError = error instanceof Error
    ? error.stack ?? error.message
    : String(error)
}

if (typeof document !== "undefined") await startGraphStorybook()
