import {UiRuntime} from "@ui/elements/runtime"
import {
  PlaygroundBackdropSurface,
  PlaygroundDockSurface,
  PlaygroundNavigationSurface,
  PlaygroundRouter,
  PlaygroundStoryPanelSurface,
  planPlaygroundShell,
  playgroundRouteUrl,
  type PlaygroundStoryArgs,
  type PlaygroundStoryModule,
  type PlaygroundStoryPanelMode,
  type PlaygroundStoryPanelOptions,
} from "@ui/playground"
import {
  COMPONENT_STORIES,
  componentCatalogItems,
  componentSectionItems,
  componentStoryIndex,
  componentVariantItems,
  normalizeComponentsPlaygroundPath,
  type ComponentsStoryRoute,
} from "./stories.ts"
import {ComponentsStoryPreviewSurface} from "./story-preview.ts"

export type ComponentsPlaygroundObserver = Readonly<{
  snapshot(): Readonly<Record<string, unknown>>
  selectStory(route: string): Promise<Readonly<Record<string, unknown>>>
  setControl(key: string, value: unknown): Readonly<Record<string, unknown>>
  setFieldValue(id: string, value: unknown): Readonly<Record<string, unknown>>
}>

declare global {
  var __componentsPlaygroundObserver: ComponentsPlaygroundObserver | undefined
  var __componentsStoryControlBridge: ((key: string, value: unknown) => void) | undefined
}

async function startComponentsPlayground(): Promise<void> {
  const canvas = document.getElementById("stage-canvas")
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error("stage-canvas not found")
  document.documentElement.dataset.componentsPlayground = "starting"
  try {
    const runtime = await UiRuntime.create(canvas, {
      fontUrl: "/JetBrainsMono-Bold.ttf",
      virtualDisplay: {initial: "near", surfaceDisplay: true, grid: false},
    })
    runtime.handleResize()

    const legacyRoute = normalizeComponentsPlaygroundPath(window.location.pathname)
    if (legacyRoute !== null) history.replaceState(null, "", playgroundRouteUrl(legacyRoute))
    const router = new PlaygroundRouter(COMPONENT_STORIES.declaration)
    const resolvedPath = playgroundRouteUrl(router.current)
    if (window.location.pathname !== resolvedPath) history.replaceState(null, "", resolvedPath)

    let storyRoute = router.current as ComponentsStoryRoute
    let storyIndex = componentStoryIndex(storyRoute)
    let storyModule = await COMPONENT_STORIES.load(storyRoute)
    let storyArgs: PlaygroundStoryArgs = Object.freeze({...storyModule.defaultArgs})
    let storyPanelMode: PlaygroundStoryPanelMode = "controls"
    let catalogQuery = ""
    let collapsedCatalogGroups = new Set<string>()
    let controlChanges = 0
    let storyRevision = 0

    const navigate = (route: ComponentsStoryRoute): void => router.go(route)
    const backdrop = new PlaygroundBackdropSurface()
    const catalog = new PlaygroundNavigationSurface<ComponentsStoryRoute>({
      title: "Компоненты UI",
      items: componentCatalogItems(collapsedCatalogGroups),
      route: storyRoute,
      onNavigate: navigate,
      query: catalogQuery,
      searchPlaceholder: "Компонент, API, тег…",
      onQueryChange: handleCatalogQuery,
      onGroupToggle: handleCatalogGroupToggle,
    })
    const sections = new PlaygroundNavigationSurface<ComponentsStoryRoute>({
      title: storyIndex.componentLabel,
      items: componentSectionItems(storyRoute),
      route: storyRoute,
      onNavigate: navigate,
    })
    const dock = new PlaygroundDockSurface<ComponentsStoryRoute>({
      title: "Варианты",
      items: componentVariantItems(storyRoute),
      route: storyRoute,
      onNavigate: navigate,
    })
    const preview = new ComponentsStoryPreviewSurface()
    preview.setStory(storyIndex, storyModule, storyArgs)
    let storyPanel: PlaygroundStoryPanelSurface

    const storyPanelOptions = (): PlaygroundStoryPanelOptions => ({
      source: storyModule.source(storyArgs),
      args: storyArgs,
      controls: storyModule.controls,
      events: [
        {id: "route", label: "Story", value: storyRoute},
        {id: "changes", label: "Изменения", value: String(controlChanges)},
      ],
      mode: storyPanelMode,
      onModeChange(mode) {
        storyPanelMode = mode
        storyPanel.setOptions(storyPanelOptions())
        publish()
      },
      onControlChange(key, value) {
        updateControl(key, value)
      },
      async onCopy(source) {
        try {
          await navigator.clipboard.writeText(source)
          document.documentElement.dataset.componentsStoryCopy = "copied"
        } catch {
          document.documentElement.dataset.componentsStoryCopy = "error"
        }
      },
    })
    storyPanel = new PlaygroundStoryPanelSurface(storyPanelOptions())

    const frames = (w: number, h: number) => planPlaygroundShell(w, h)
    runtime.addSurface(backdrop, ({w, h}) => ({x: 0, y: 0, w, h}))
    runtime.addSurface(catalog, ({w, h}) => frames(w, h).catalog)
    runtime.addSurface(sections, ({w, h}) => frames(w, h).section)
    runtime.addSurface(preview, ({w, h}) => frames(w, h).preview)
    runtime.addSurface(dock, ({w, h}) => frames(w, h).dock)
    runtime.addSurface(storyPanel, ({w, h}) => frames(w, h).info)

    const snapshot = (): Readonly<Record<string, unknown>> => Object.freeze({
      route: storyRoute,
      story: storyIndex,
      args: storyArgs,
      source: storyModule.source(storyArgs),
      collapsedCatalogGroups: Object.freeze([...collapsedCatalogGroups]),
      catalog: catalog.diagnostics,
      sections: sections.diagnostics,
      dock: dock.diagnostics,
      panel: storyPanel.diagnostics,
      preview: preview.diagnostics,
    })

    const publish = (): Readonly<Record<string, unknown>> => {
      for (const surface of [catalog, sections, dock, storyPanel, preview]) surface.flushPendingRender()
      const current = snapshot()
      document.documentElement.dataset.componentsPlaygroundRoute = storyRoute
      document.documentElement.dataset.componentsStorySource = storyModule.source(storyArgs)
      document.documentElement.dataset.componentsStoryArgs = JSON.stringify(storyArgs)
      document.documentElement.dataset.componentsStorySections = String(componentSectionItems(storyRoute).length)
      document.documentElement.dataset.componentsStoryVariants = String(componentVariantItems(storyRoute).length)
      document.documentElement.dataset.componentsPlaygroundRetained = JSON.stringify(current)
      return current
    }

    function updateControl(key: string, value: unknown): Readonly<Record<string, unknown>> {
      storyArgs = Object.freeze({...storyArgs, [key]: value})
      controlChanges += 1
      preview.setArgs(storyArgs)
      storyPanel.setOptions(storyPanelOptions())
      return publish()
    }

    async function applyRoute(route: ComponentsStoryRoute): Promise<Readonly<Record<string, unknown>>> {
      const revision = ++storyRevision
      const nextIndex = componentStoryIndex(route)
      const nextModule = await COMPONENT_STORIES.load(route)
      if (revision !== storyRevision || router.current !== route) return snapshot()
      storyRoute = route
      storyIndex = nextIndex
      storyModule = nextModule
      storyArgs = Object.freeze({...storyModule.defaultArgs})
      controlChanges = 0
      catalog.setOptions(catalogOptions(route))
      sections.setOptions({
        title: storyIndex.componentLabel,
        items: componentSectionItems(route),
        route,
        onNavigate: navigate,
      })
      dock.setOptions({title: "Варианты", items: componentVariantItems(route), route, onNavigate: navigate})
      preview.setStory(storyIndex, storyModule, storyArgs)
      storyPanel.setOptions(storyPanelOptions())
      runtime.relayout()
      return publish()
    }

    function catalogOptions(route: ComponentsStoryRoute) {
      return {
        title: "Компоненты UI",
        items: componentCatalogItems(collapsedCatalogGroups),
        route,
        onNavigate: navigate,
        query: catalogQuery,
        searchPlaceholder: "Компонент, API, тег…",
        onQueryChange: handleCatalogQuery,
        onGroupToggle: handleCatalogGroupToggle,
      }
    }

    function handleCatalogQuery(query: string): void {
      catalogQuery = query
      catalog.setOptions(catalogOptions(storyRoute))
      publish()
    }

    function handleCatalogGroupToggle(groupId: string, collapsed: boolean): void {
      collapsedCatalogGroups = new Set(collapsedCatalogGroups)
      if (collapsed) collapsedCatalogGroups.add(groupId)
      else collapsedCatalogGroups.delete(groupId)
      catalog.setOptions(catalogOptions(storyRoute))
      publish()
    }

    router.subscribe((route) => {
      void applyRoute(route as ComponentsStoryRoute).catch(publishComponentsError)
    })
    globalThis.__componentsStoryControlBridge = (key, value) => {
      updateControl(key, value)
    }
    globalThis.__componentsPlaygroundObserver = Object.freeze({
      snapshot: publish,
      async selectStory(route) {
        if (COMPONENT_STORIES.find(route) === undefined) throw new Error(`Unknown Components story: ${route}`)
        navigate(route)
        if (router.current === route) return applyRoute(route)
        return snapshot()
      },
      setControl: updateControl,
      setFieldValue(_id, value) {
        return updateControl("value", value)
      },
    })
    new ResizeObserver(() => {
      runtime.handleResize()
      publish()
    }).observe(canvas)
    runtime.handleResize()
    publish()
    document.documentElement.dataset.componentsPlayground = "ready"
  } catch (error) {
    publishComponentsError(error)
    throw error
  }
}

function publishComponentsError(error: unknown): void {
  document.documentElement.dataset.componentsPlayground = "error"
  document.documentElement.dataset.componentsPlaygroundError = error instanceof Error
    ? error.stack ?? error.message
    : String(error)
}

if (typeof document !== "undefined") await startComponentsPlayground()
