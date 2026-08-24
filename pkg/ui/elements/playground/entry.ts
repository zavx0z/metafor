import {UiRuntime} from "@ui/elements/runtime"
import {
  PlaygroundBackdropSurface,
  PlaygroundDockSurface,
  PlaygroundNavigationSurface,
  PlaygroundStoryPanelSurface,
  planPlaygroundShell,
  type PlaygroundStoryArgs,
  type PlaygroundStoryModule,
  type PlaygroundStoryPanelMode,
  type PlaygroundStoryPanelOptions,
} from "@ui/playground"
import {
  ELEMENT_STORIES,
  elementCatalogItems,
  elementSectionItems,
  elementStoryIndex,
  elementVariantItems,
  type ElementsStoryRoute,
} from "./stories.ts"
import {ElementsStoryPreviewSurface} from "./story-preview.ts"
import {
  createMountedStoryRoute,
  mountStoryOverview,
} from "../../playground/hub/mounted-story-page.ts"

const ELEMENTS_MOUNT_PATH = "/elements"

export type ElementsPlaygroundObserver = Readonly<{
  snapshot(): Readonly<Record<string, unknown>>
  selectStory(route: string): Promise<Readonly<Record<string, unknown>>>
  setControl(key: string, value: unknown): Readonly<Record<string, unknown>>
}>

declare global {
  var __elementsPlaygroundObserver: ElementsPlaygroundObserver | undefined
  var __elementsStoryControlBridge: ((key: string, value: unknown) => void) | undefined
}

async function startElementsPlayground(): Promise<void> {
  const canvas = document.getElementById("stage-canvas")
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error("stage-canvas not found")
  document.documentElement.dataset.elementsPlayground = "starting"
  document.documentElement.dataset.uiPlayground = "starting"
  document.documentElement.dataset.uiPlaygroundPage = "elements"
  try {
    const runtime = await UiRuntime.create(canvas, {
      fontUrl: "/JetBrainsMono-Bold.ttf",
      virtualDisplay: {initial: "near", surfaceDisplay: true, grid: false},
    })
    runtime.handleResize()

    const mounted = createMountedStoryRoute<ElementsStoryRoute>(ELEMENT_STORIES, ELEMENTS_MOUNT_PATH)
    if (mounted.kind === "overview") {
      mountStoryOverview(runtime, canvas, ELEMENT_STORIES, mounted, "Элементы UI")
      document.documentElement.dataset.elementsPlaygroundRoute = mounted.node.path
      document.documentElement.dataset.elementsPlaygroundPage = "overview"
      document.documentElement.dataset.elementsPlayground = "ready"
      document.documentElement.dataset.uiPlayground = "ready"
      return
    }
    const router = mounted.router

    let storyRoute = router.current as ElementsStoryRoute
    let storyIndex = elementStoryIndex(storyRoute)
    let storyModule = await ELEMENT_STORIES.load(storyRoute)
    let storyArgs: PlaygroundStoryArgs = Object.freeze({...storyModule.defaultArgs})
    let storyPanelMode: PlaygroundStoryPanelMode = "controls"
    let catalogQuery = ""
    let collapsedCatalogGroups = new Set<string>()
    let controlChanges = 0
    let storyRevision = 0

    const navigate = (route: ElementsStoryRoute): void => router.go(route)
    const backdrop = new PlaygroundBackdropSurface()
    const catalog = new PlaygroundNavigationSurface<ElementsStoryRoute>({
      title: "Элементы UI",
      items: elementCatalogItems(collapsedCatalogGroups),
      route: storyRoute,
      onNavigate: navigate,
      query: catalogQuery,
      searchPlaceholder: "Элемент, API, тег…",
      onQueryChange: handleCatalogQuery,
      onGroupToggle: handleCatalogGroupToggle,
    })
    const sections = new PlaygroundNavigationSurface<ElementsStoryRoute>({
      title: storyIndex.componentLabel,
      items: elementSectionItems(storyRoute),
      route: storyRoute,
      onNavigate: navigate,
    })
    const dock = new PlaygroundDockSurface<ElementsStoryRoute>({
      title: "Варианты",
      items: elementVariantItems(storyRoute),
      route: storyRoute,
      onNavigate: navigate,
    })
    const preview = new ElementsStoryPreviewSurface()
    preview.setStory(storyIndex, storyModule, storyArgs)
    let storyPanel: PlaygroundStoryPanelSurface

    const storyPanelOptions = (): PlaygroundStoryPanelOptions => ({
      source: storyModule.source(storyArgs),
      args: storyArgs,
      controls: storyModule.controls,
      events: [
        {id: "route", label: "Сценарий", value: storyRoute},
        {id: "changes", label: "Изменения", value: String(controlChanges)},
        {id: "state", label: "Состояние", value: String(storyArgs["state"] ?? "готово")},
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
          document.documentElement.dataset.elementsStoryCopy = "copied"
        } catch {
          document.documentElement.dataset.elementsStoryCopy = "error"
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
      document.documentElement.dataset.elementsPlaygroundRoute = storyRoute
      document.documentElement.dataset.elementsStorySource = storyModule.source(storyArgs)
      document.documentElement.dataset.elementsStoryArgs = JSON.stringify(storyArgs)
      document.documentElement.dataset.elementsStorySections = String(elementSectionItems(storyRoute).length)
      document.documentElement.dataset.elementsStoryVariants = String(elementVariantItems(storyRoute).length)
      document.documentElement.dataset.elementsPlaygroundRetained = JSON.stringify(current)
      return current
    }

    function updateControl(key: string, value: unknown): Readonly<Record<string, unknown>> {
      storyArgs = Object.freeze({...storyArgs, [key]: value})
      controlChanges += 1
      preview.setArgs(storyArgs)
      storyPanel.setOptions(storyPanelOptions())
      return publish()
    }

    async function applyRoute(route: ElementsStoryRoute): Promise<Readonly<Record<string, unknown>>> {
      const revision = ++storyRevision
      const nextIndex = elementStoryIndex(route)
      const nextModule = await ELEMENT_STORIES.load(route)
      if (revision !== storyRevision || router.current !== route) return snapshot()
      storyRoute = route
      storyIndex = nextIndex
      storyModule = nextModule
      storyArgs = Object.freeze({...storyModule.defaultArgs})
      controlChanges = 0
      catalog.setOptions(catalogOptions(route))
      sections.setOptions({
        title: storyIndex.componentLabel,
        items: elementSectionItems(route),
        route,
        onNavigate: navigate,
      })
      dock.setOptions({title: "Варианты", items: elementVariantItems(route), route, onNavigate: navigate})
      preview.setStory(storyIndex, storyModule, storyArgs)
      storyPanel.setOptions(storyPanelOptions())
      runtime.relayout()
      return publish()
    }

    function catalogOptions(route: ElementsStoryRoute) {
      return {
        title: "Элементы UI",
        items: elementCatalogItems(collapsedCatalogGroups),
        route,
        onNavigate: navigate,
        query: catalogQuery,
        searchPlaceholder: "Элемент, API, тег…",
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
      void applyRoute(route as ElementsStoryRoute).catch(publishElementsError)
    })
    globalThis.__elementsStoryControlBridge = (key, value) => {
      updateControl(key, value)
    }
    globalThis.__elementsPlaygroundObserver = Object.freeze({
      snapshot: publish,
      async selectStory(route) {
        if (ELEMENT_STORIES.find(route) === undefined) throw new Error(`Unknown Elements story: ${route}`)
        navigate(route)
        if (router.current === route) return applyRoute(route)
        return snapshot()
      },
      setControl: updateControl,
    })
    new ResizeObserver(() => {
      runtime.handleResize()
      publish()
    }).observe(canvas)
    runtime.handleResize()
    publish()
    document.documentElement.dataset.elementsPlayground = "ready"
    document.documentElement.dataset.uiPlayground = "ready"
  } catch (error) {
    publishElementsError(error)
    throw error
  }
}

function publishElementsError(error: unknown): void {
  document.documentElement.dataset.elementsPlayground = "error"
  document.documentElement.dataset.uiPlayground = "error"
  document.documentElement.dataset.elementsPlaygroundError = error instanceof Error
    ? error.stack ?? error.message
    : String(error)
}

if (typeof document !== "undefined") await startElementsPlayground()
