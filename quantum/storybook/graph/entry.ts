import {UiRuntime} from "@layout/core/runtime"
import {
  StorybookBackdropSurface,
  StorybookDockSurface,
  StorybookNavigationSurface,
  StorybookStoryPanelSurface,
  type StorybookStoryPanelOptions,
} from "@ui/storybook/surfaces"
import {StorybookRouteTreeRouter} from "@ui/storybook/router"
import type {StorybookRouteTreeNode} from "@ui/storybook/route-tree"
import {planStorybookShell} from "@ui/storybook/layout"
import {storybookPublicPath} from "@ui/storybook/environment"
import {GraphStoryPreviewSurface} from "./preview.ts"
import {
  GRAPH_STORIES,
  graphCatalogItems,
  graphSectionItems,
  graphVariantItems,
  type GraphStoryRoute,
} from "./stories.ts"
import {GraphLabState} from "./state/lab-state.ts"

const GRAPH_MOUNT_PATH = storybookPublicPath("/graph")

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
    const initialRoute = representativeRoute(router.current)
    const state = await GraphLabState.create(initialRoute)
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
    const dock = new StorybookDockSurface<GraphStoryRoute>({
      title: "Варианты",
      items: graphVariantItems(state.route),
      route: router.current.kind === "leaf" ? state.route : GRAPH_STORIES.fallback as GraphStoryRoute,
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

    const frames = (w: number, h: number) => planStorybookShell(w, h)
    runtime.addSurface(backdrop, ({w, h}) => ({x: 0, y: 0, w, h}))
    runtime.addSurface(catalog, ({w, h}) => frames(w, h).catalog)
    runtime.addSurface(sections, ({w, h}) => frames(w, h).section)
    runtime.addSurface(preview, ({w, h}) => frames(w, h).preview)
    runtime.addSurface(dock, ({w, h}) => frames(w, h).dock)
    runtime.addSurface(storyPanel, ({w, h}) => frames(w, h).info)

    const snapshot = (): Readonly<Record<string, unknown>> => Object.freeze({
      path: router.current.path,
      pathKind: router.current.kind,
      ...state.snapshot(),
      catalog: catalog.diagnostics,
      sections: sections.diagnostics,
      dock: dock.diagnostics,
      preview: preview.diagnostics,
      panel: storyPanel.diagnostics,
    })

    const publish = (): Readonly<Record<string, unknown>> => {
      for (const surface of [catalog, sections, dock, preview, storyPanel]) surface.flushPendingRender()
      const current = snapshot()
      document.documentElement.dataset.quantumStorybookPath = router.current.path
      document.documentElement.dataset.quantumStorybookRouteKind = router.current.kind
      document.documentElement.dataset.quantumStorybookRoute = state.route
      document.documentElement.dataset.quantumStorybookState = JSON.stringify(current)
      return current
    }

    const applyNode = async (node: StorybookRouteTreeNode<string>): Promise<void> => {
      const route = representativeRoute(node)
      if (route !== state.route && !await state.select(route)) return
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
        route: node.kind === "leaf" ? state.route : GRAPH_STORIES.fallback as GraphStoryRoute,
        onNavigate: navigate,
      })
      preview.setStory(state.story, state.module, state.args)
      storyPanel.setOptions(panelOptions())
      runtime.relayout()
      publish()
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
    publish()
    document.documentElement.dataset.quantumStorybook = "ready"
  } catch (error) {
    publishGraphStorybookError(error)
    throw error
  }
}

function representativeRoute(node: StorybookRouteTreeNode<string>): GraphStoryRoute {
  if (node.kind === "leaf") return node.path as GraphStoryRoute
  const prefix = node.path.length === 0 ? "" : `${node.path}/`
  if (GRAPH_STORIES.fallback.startsWith(prefix)) return GRAPH_STORIES.fallback as GraphStoryRoute
  const route = GRAPH_STORIES.routeTree.leaves.find((candidate) => candidate.startsWith(prefix))
  if (route === undefined) throw new Error(`Overview не содержит Graph story: ${node.path}`)
  return route as GraphStoryRoute
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
