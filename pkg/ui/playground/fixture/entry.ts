import {type Object3D} from "@metafor/engine"
import {div} from "@ui/elements/div"
import {UiRuntime} from "@ui/elements/runtime"
import {UiSurface} from "@ui/elements/surface"
import {h2, p} from "@ui/elements/text"
import {
  PlaygroundBackdropSurface,
  PlaygroundDockSurface,
  PlaygroundNavigationSurface,
  PlaygroundRouter,
  PlaygroundStoryPanelSurface,
  definePlaygroundRoutes,
  definePlaygroundStories,
  planPlaygroundShell,
  type PlaygroundNavigationItem,
  type PlaygroundStoryArgs,
  type PlaygroundStoryIndexItem,
  type PlaygroundStoryModule,
  type PlaygroundStoryPanelMode,
  type PlaygroundStoryPanelOptions,
} from "@ui/playground"

type PageRoute = "overview" | "details"
const pageRoutes = ["overview", "details"] as const
const pageDeclaration = definePlaygroundRoutes({routes: pageRoutes, fallback: "overview"})

let recordStoryClick = (): void => {}

const loadButtonStory = (variant: "text" | "contained" | "outlined", disabled = false) => async (): Promise<PlaygroundStoryModule> => {
  const {createButtonStory} = await import("./stories/button.ts")
  return createButtonStory({variant, disabled, onClick: () => recordStoryClick()})
}

const storyRegistry = definePlaygroundStories({
  groups: [{
    id: "basic",
    label: "Основные",
    components: [{
      id: "button",
      label: "Кнопка",
      apiName: "Button",
      tags: ["action", "действие"],
      sections: [{
        id: "basic",
        label: "Основное",
        variants: [
          {id: "text", label: "Текстовая", title: "Текстовая кнопка", load: loadButtonStory("text")},
          {id: "contained", label: "Заполненная", title: "Заполненная кнопка", load: loadButtonStory("contained")},
          {id: "outlined", label: "Контурная", title: "Контурная кнопка", load: loadButtonStory("outlined")},
          {id: "disabled", label: "Недоступная", title: "Недоступная кнопка", load: loadButtonStory("contained", true)},
        ],
      }],
    }],
  }],
  fallback: {component: "button", section: "basic", variant: "contained"},
})

type FixturePreviewDiagnostics = Readonly<{layoutPlans: number; materializations: number; route: string}>

class FixturePreviewSurface extends UiSurface {
  readonly #previewParent: Object3D
  #storyIndex: PlaygroundStoryIndexItem
  #storyModule: PlaygroundStoryModule
  #args: PlaygroundStoryArgs
  #materialized: Readonly<{signature: string; w: number; h: number; pixelScale: number; font: unknown}> | null = null
  #layoutPlans = 0
  #materializations = 0

  constructor(index: PlaygroundStoryIndexItem, module: PlaygroundStoryModule, args: PlaygroundStoryArgs) {
    super({bgColor: null, borderColor: null})
    this.#storyIndex = index
    this.#storyModule = module
    this.#args = args
    this.#previewParent = this.createRetainedParent()
    this.#previewParent.name = "FixturePreviewSurface.preview"
  }

  get diagnostics(): FixturePreviewDiagnostics {
    return Object.freeze({layoutPlans: this.#layoutPlans, materializations: this.#materializations, route: this.#storyIndex.route})
  }

  setStory(index: PlaygroundStoryIndexItem, module: PlaygroundStoryModule, args: PlaygroundStoryArgs): void {
    this.#storyIndex = index
    this.#storyModule = module
    this.#args = args
    this.requestRender()
  }

  setArgs(args: PlaygroundStoryArgs): void {
    this.#args = args
    this.requestRender()
  }

  protected override render(): void {
    const signature = `${this.#storyIndex.route}:${JSON.stringify(this.#args)}`
    const previous = this.#materialized
    const geometryChanged = previous === null || previous.w !== this.rectW || previous.h !== this.rectH ||
      previous.pixelScale !== this.pixelScale || previous.font !== this.font
    if (!geometryChanged && previous.signature === signature) return
    if (geometryChanged) this.#layoutPlans += 1
    this.materializeRetainedParent(this.#previewParent, () => {
      div(this, 0, 0, this.rectW, this.rectH, {
        style: {
          background: "rgba(8, 13, 22, 0.72)",
          borderColor: "rgba(214, 231, 255, 0.22)",
          borderRadius: 38,
        },
      })
      h2(this, 42, 38, Math.max(0, this.rectW - 84), 42, {children: this.#storyIndex.title, style: {fontSize: 24}})
      p(this, 42, 92, Math.max(0, this.rectW - 84), 46, {
        children: "Рабочий компонент, текущие параметры и копируемый TypeScript используют один сценарий.",
        style: {fontSize: 12, color: "muted"},
      })
      this.#storyModule.render(this, this.#args, {x: 0, y: 0, w: this.rectW, h: this.rectH})
    })
    this.#materializations += 1
    this.#materialized = {signature, w: this.rectW, h: this.rectH, pixelScale: this.pixelScale, font: this.font}
  }
}

export type PlaygroundWorkbenchObserver = Readonly<{
  snapshot(): Readonly<Record<string, unknown>>
  selectStory(route: string): Promise<Readonly<Record<string, unknown>>>
  setControl(key: string, value: unknown): Readonly<Record<string, unknown>>
}>

declare global {
  var __playgroundWorkbenchObserver: PlaygroundWorkbenchObserver | undefined
}

async function startWorkbench(): Promise<void> {
  const canvas = document.getElementById("playground-canvas")
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error("playground-canvas not found")
  document.documentElement.dataset.playgroundReady = "starting"
  try {
    const runtime = await UiRuntime.create(canvas, {
      fontUrl: "/JetBrainsMono-Bold.ttf",
      virtualDisplay: {initial: "near", surfaceDisplay: true, grid: false},
    })
    runtime.handleResize()
    const pageRouter = new PlaygroundRouter(pageDeclaration)
    let storyRoute = storyRegistry.fallback
    let storyIndex = requireStory(storyRoute)
    let storyModule = await storyRegistry.load(storyRoute)
    let args: PlaygroundStoryArgs = Object.freeze({...storyModule.defaultArgs})
    let panelMode: PlaygroundStoryPanelMode = "controls"
    let catalogQuery = ""
    let collapsedCatalogGroups = new Set<string>()
    let clickCount = 0
    let selectionRevision = 0

    const backdrop = new PlaygroundBackdropSurface()
    const catalog = new PlaygroundNavigationSurface<string>({
      title: "Библиотека UI",
      items: catalogNavigationItems(collapsedCatalogGroups),
      route: storyRoute,
      onNavigate: (route) => { void selectStory(route) },
      query: catalogQuery,
      searchPlaceholder: "Компонент, API, тег…",
      onQueryChange: handleCatalogQuery,
      onGroupToggle: handleCatalogGroupToggle,
    })
    const sections = new PlaygroundNavigationSurface<string>({
      title: storyIndex.componentLabel,
      items: sectionNavigationItems(storyIndex),
      route: storyRoute,
      onNavigate: (route) => { void selectStory(route) },
    })
    const dock = new PlaygroundDockSurface<string>({
      title: "Варианты",
      items: variantNavigationItems(storyIndex),
      route: storyRoute,
      onNavigate: (route) => { void selectStory(route) },
    })
    const preview = new FixturePreviewSurface(storyIndex, storyModule, args)
    let storyPanel: PlaygroundStoryPanelSurface

    const panelOptions = (): PlaygroundStoryPanelOptions => ({
      source: storyModule.source(args),
      args,
      controls: storyModule.controls,
      events: [{id: "click", label: "Клики", value: String(clickCount)}],
      mode: panelMode,
      onModeChange(mode) {
        panelMode = mode
        storyPanel.setOptions(panelOptions())
        publish()
      },
      onControlChange(key, value) {
        args = Object.freeze({...args, [key]: value})
        preview.setArgs(args)
        storyPanel.setOptions(panelOptions())
        publish()
      },
      async onCopy(source) {
        try {
          await navigator.clipboard.writeText(source)
          document.documentElement.dataset.playgroundCopy = "copied"
        } catch {
          document.documentElement.dataset.playgroundCopy = "error"
        }
      },
    })
    storyPanel = new PlaygroundStoryPanelSurface(panelOptions())

    const frames = (w: number, h: number) => planPlaygroundShell(w, h)
    runtime.addSurface(backdrop, ({w, h}) => ({x: 0, y: 0, w, h}))
    runtime.addSurface(catalog, ({w, h}) => frames(w, h).catalog)
    runtime.addSurface(sections, ({w, h}) => frames(w, h).section)
    runtime.addSurface(preview, ({w, h}) => frames(w, h).preview)
    runtime.addSurface(dock, ({w, h}) => frames(w, h).dock)
    runtime.addSurface(storyPanel, ({w, h}) => frames(w, h).info)

    const snapshot = (): Readonly<Record<string, unknown>> => Object.freeze({
      pageRoute: pageRouter.current,
      storyRoute,
      args,
      source: storyModule.source(args),
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
      document.documentElement.dataset.playgroundRoute = pageRouter.current
      document.documentElement.dataset.playgroundStoryRoute = storyRoute
      document.documentElement.dataset.playgroundRetained = JSON.stringify(current)
      return current
    }

    async function selectStory(route: string): Promise<Readonly<Record<string, unknown>>> {
      const revision = ++selectionRevision
      const nextIndex = requireStory(route)
      const nextModule = await storyRegistry.load(route)
      if (revision !== selectionRevision) return snapshot()
      storyRoute = route
      storyIndex = nextIndex
      storyModule = nextModule
      args = Object.freeze({...storyModule.defaultArgs})
      clickCount = 0
      catalog.setOptions({
        title: "Библиотека UI",
        items: catalogNavigationItems(collapsedCatalogGroups),
        route,
        onNavigate: (next) => { void selectStory(next) },
        query: catalogQuery,
        searchPlaceholder: "Компонент, API, тег…",
        onQueryChange: handleCatalogQuery,
        onGroupToggle: handleCatalogGroupToggle,
      })
      sections.setOptions({title: storyIndex.componentLabel, items: sectionNavigationItems(storyIndex), route, onNavigate: (next) => { void selectStory(next) }})
      dock.setOptions({title: "Варианты", items: variantNavigationItems(storyIndex), route, onNavigate: (next) => { void selectStory(next) }})
      preview.setStory(storyIndex, storyModule, args)
      storyPanel.setOptions(panelOptions())
      return publish()
    }

    recordStoryClick = () => {
      clickCount += 1
      storyPanel.setOptions(panelOptions())
      publish()
    }
    function handleCatalogQuery(query: string): void {
      catalogQuery = query
      catalog.setOptions({
        title: "Библиотека UI",
        items: catalogNavigationItems(collapsedCatalogGroups),
        route: storyRoute,
        onNavigate: (next) => { void selectStory(next) },
        query: catalogQuery,
        searchPlaceholder: "Компонент, API, тег…",
        onQueryChange: handleCatalogQuery,
        onGroupToggle: handleCatalogGroupToggle,
      })
      publish()
    }
    function handleCatalogGroupToggle(groupId: string, collapsed: boolean): void {
      collapsedCatalogGroups = new Set(collapsedCatalogGroups)
      if (collapsed) collapsedCatalogGroups.add(groupId)
      else collapsedCatalogGroups.delete(groupId)
      catalog.setOptions({
        title: "Библиотека UI",
        items: catalogNavigationItems(collapsedCatalogGroups),
        route: storyRoute,
        onNavigate: (next) => { void selectStory(next) },
        query: catalogQuery,
        searchPlaceholder: "Компонент, API, тег…",
        onQueryChange: handleCatalogQuery,
        onGroupToggle: handleCatalogGroupToggle,
      })
      publish()
    }
    pageRouter.subscribe(() => { publish() })
    globalThis.__playgroundWorkbenchObserver = Object.freeze({
      snapshot: publish,
      selectStory,
      setControl(key, value) {
        args = Object.freeze({...args, [key]: value})
        preview.setArgs(args)
        storyPanel.setOptions(panelOptions())
        return publish()
      },
    })
    new ResizeObserver(() => {
      runtime.handleResize()
      publish()
    }).observe(canvas)
    publish()
    document.documentElement.dataset.playgroundReady = "ready"
  } catch (error) {
    document.documentElement.dataset.playgroundReady = "error"
    document.documentElement.dataset.playgroundError = error instanceof Error ? error.stack ?? error.message : String(error)
    throw error
  }
}

function requireStory(route: string): PlaygroundStoryIndexItem {
  const story = storyRegistry.find(route)
  if (story === undefined) throw new Error(`Workbench story not found: ${route}`)
  return story
}

function catalogNavigationItems(collapsedGroups: ReadonlySet<string>): readonly PlaygroundNavigationItem<string>[] {
  const firstByComponent = new Map<string, PlaygroundStoryIndexItem>()
  for (const item of storyRegistry.index) if (!firstByComponent.has(item.componentId)) firstByComponent.set(item.componentId, item)
  return [...firstByComponent.values()].map((item) => ({
    id: item.componentId,
    label: item.componentLabel,
    route: item.route,
    group: {id: item.groupId, label: item.groupLabel, collapsed: collapsedGroups.has(item.groupId)},
    searchText: `${item.apiName} ${item.tags.join(" ")}`,
  }))
}

function sectionNavigationItems(selected: PlaygroundStoryIndexItem): readonly PlaygroundNavigationItem<string>[] {
  const firstBySection = new Map<string, PlaygroundStoryIndexItem>()
  for (const item of storyRegistry.index) {
    if (item.componentId === selected.componentId && !firstBySection.has(item.sectionId)) firstBySection.set(item.sectionId, item)
  }
  return [...firstBySection.values()].map((item) => ({id: item.sectionId, label: item.sectionLabel, route: item.route}))
}

function variantNavigationItems(selected: PlaygroundStoryIndexItem): readonly PlaygroundNavigationItem<string>[] {
  return storyRegistry.variants(selected.route).map((item) => ({id: item.variantId, label: item.variantLabel, route: item.route}))
}

if (typeof document !== "undefined") await startWorkbench()
