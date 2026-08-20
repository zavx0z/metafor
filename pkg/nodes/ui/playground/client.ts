import {TextureLoader} from "@metafor/engine"
import {UiRuntime} from "@ui/elements"
import {
  PlaygroundBackdropSurface,
  PlaygroundDockSurface,
  PlaygroundNavigationSurface,
  PlaygroundRouter,
  PlaygroundStoryPanelSurface,
  playgroundRouteUrl,
  type PlaygroundStoryArgs,
  type PlaygroundStoryModule,
  type PlaygroundStoryPanelMode,
  type PlaygroundStoryPanelOptions,
} from "@ui/playground"
import {
  BLENDER_SOCKET_SHAPES,
  createBlenderNodeRenderers,
  type BlenderFrame,
  type BlenderLink,
  type BlenderNode,
  type BlenderNodePlan,
  type BlenderSocket,
} from "../blender-node.ts"
import {NodeEditor} from "../node-editor.ts"
import {createCatalogNodeTree, createNoiseComparisonTree} from "./fixtures.ts"
import {planNodeComponentPlaygroundFrames} from "./layout.ts"
import {waitForReferenceFrame} from "./reference-readiness.ts"
import {createPlaygroundRetainedObserver, type PlaygroundRetainedObserver} from "./retained-observer.ts"
import {
  NODE_PLAYGROUND_ROUTE_DECLARATION,
  isNodeEditorStoryRoute,
  isNodeFrameStoryRoute,
  isNodeLinkStoryRoute,
  loadNodePlaygroundStory,
  normalizeNodePlaygroundPath,
  nodePlaygroundCatalog,
  nodePlaygroundCatalogRoute,
  nodePlaygroundDockItems,
  nodePlaygroundGroup,
  nodePlaygroundSectionTitle,
  nodePlaygroundSections,
  nodePlaygroundStoryIndex,
  type NodePlaygroundRoute,
} from "./routes.ts"
import {
  NODE_SOCKET_KINDS,
  isNodeSocketStoryRoute,
  nodeEditorStoryRoute,
  nodeEditorStoryState,
} from "./stories.ts"
import {applyNodeEditorStoryState} from "./story-state.ts"
import {NodeStoryPreviewSurface} from "./story-preview.ts"
import {BLENDER_REFERENCE_SRC, BlenderReferenceSurface} from "./surfaces.ts"

const canvas = document.getElementById("node-component-canvas")
if (!(canvas instanceof HTMLCanvasElement)) throw new Error("Canvas node component playground не найден")

document.documentElement.dataset.nodeComponentPlayground = "starting"
document.documentElement.dataset.nodeReferenceReady = "loading"

try {
  let retainedObserver: PlaygroundRetainedObserver | null = null
  let preparingReference = true
  const runtime = await UiRuntime.create(canvas, {
    fontUrl: "/JetBrainsMono-Bold.ttf",
    virtualDisplay: {initial: "near", surfaceDisplay: true, grid: false},
  })
  const legacyRoute = normalizeNodePlaygroundPath(window.location.pathname)
  if (legacyRoute !== null) history.replaceState(null, "", playgroundRouteUrl(legacyRoute))
  const router = new PlaygroundRouter(NODE_PLAYGROUND_ROUTE_DECLARATION)
  const resolvedPath = playgroundRouteUrl(router.current)
  if (window.location.pathname !== resolvedPath) history.replaceState(null, "", resolvedPath)
  const navigate = (route: NodePlaygroundRoute): void => router.go(route)
  const tree = createCatalogNodeTree()
  const comparisonTree = createNoiseComparisonTree()
  let storyModule: PlaygroundStoryModule | null = null
  let storyArgs: PlaygroundStoryArgs = Object.freeze({})
  let storyPanelMode: PlaygroundStoryPanelMode = "controls"
  let storyRevision = 0

  const backdrop = new PlaygroundBackdropSurface()
  const catalog = new PlaygroundNavigationSurface<NodePlaygroundRoute>({
    title: "Компоненты нод",
    items: nodePlaygroundCatalog(router.current),
    route: nodePlaygroundCatalogRoute(router.current),
    onNavigate: navigate,
  })
  const sections = new PlaygroundNavigationSurface<NodePlaygroundRoute>({
    title: nodePlaygroundSectionTitle(router.current),
    items: nodePlaygroundSections(router.current),
    route: router.current,
    onNavigate: navigate,
  })
  const dock = new PlaygroundDockSurface<NodePlaygroundRoute>({
    title: isNodeSocketStoryRoute(router.current) ? "Направление" : "Варианты",
    items: nodePlaygroundDockItems(router.current),
    route: router.current,
    onNavigate: navigate,
  })
  const storyPreview = new NodeStoryPreviewSurface()
  let storyPanel: PlaygroundStoryPanelSurface
  const storyPanelOptions = (): PlaygroundStoryPanelOptions => ({
    source: storyModule?.source(storyArgs) ?? "// Загрузка сценария…",
    args: storyArgs,
    controls: storyModule?.controls ?? [],
    events: [{
      id: "state",
      label: "Состояние",
      value: storyArgs.selected === true ? "выбран" : "обычный",
    }],
    mode: storyPanelMode,
    onModeChange(mode) {
      storyPanelMode = mode
      storyPanel.setOptions(storyPanelOptions())
      publishStoryState()
    },
    onControlChange(key, value) {
      if (storyModule === null) return
      const nextArgs = Object.freeze({...storyArgs, [key]: value})
      if (isNodeEditorStoryRoute(router.current) && (key === "target" || key === "selected")) {
        const state = nodeEditorStoryState(nextArgs)
        const nextRoute = nodeEditorStoryRoute(state.target, state.selected)
        if (nextRoute !== router.current) {
          navigate(nextRoute)
          return
        }
      }
      storyArgs = nextArgs
      if (isNodeSocketStoryRoute(router.current)) storyPreview.setArgs(storyArgs)
      applyProductionStoryState(router.current)
      storyPanel.setOptions(storyPanelOptions())
      publishStoryState()
    },
    async onCopy(source) {
      try {
        await navigator.clipboard.writeText(source)
        document.documentElement.dataset.nodeStoryCopy = "copied"
      } catch {
        document.documentElement.dataset.nodeStoryCopy = "error"
      }
    },
  })
  storyPanel = new PlaygroundStoryPanelSurface(storyPanelOptions())
  const reference = new BlenderReferenceSurface()
  const detail = new NodeEditor<BlenderNode, BlenderSocket, BlenderLink, BlenderFrame, BlenderNodePlan>({
    renderers: createBlenderNodeRenderers(),
    title: "СРАВНЕНИЕ · ЖИВАЯ НОДА",
    minScale: 0.6,
    maxScale: 2.4,
    onCanvasTransformChange(transform) {
      document.documentElement.dataset.comparisonScale = String(transform.scale)
    },
  })
  detail.setTree(comparisonTree)
  const editor = new NodeEditor<BlenderNode, BlenderSocket, BlenderLink, BlenderFrame, BlenderNodePlan>({
    renderers: createBlenderNodeRenderers(),
    title: "РЕДАКТОР НОД · КОМПОНЕНТНАЯ СЦЕНА",
    minScale: 0.26,
    maxScale: 2.4,
    onSelectionChange(selection) {
      document.documentElement.dataset.selectedKind = selection?.kind ?? ""
      document.documentElement.dataset.selectedId = selection?.id ?? ""
      retainedObserver?.publishAfterFrame()
    },
    onCanvasTransformChange(transform) {
      document.documentElement.dataset.canvasX = String(transform.x)
      document.documentElement.dataset.canvasY = String(transform.y)
      document.documentElement.dataset.canvasScale = String(transform.scale)
      retainedObserver?.publishAfterFrame()
    },
  })
  editor.setTree(tree)

  const frames = (w: number, h: number) => {
    const planned = planNodeComponentPlaygroundFrames(w, h, router.current)
    if (!preparingReference || planned.reference.visible !== false) return planned
    return {...planned, reference: {x: 0, y: 0, w: 1, h: 1}}
  }
  runtime.addSurface(backdrop, ({w, h}) => frames(w, h).backdrop)
  runtime.addSurface(catalog, ({w, h}) => frames(w, h).catalog)
  runtime.addSurface(sections, ({w, h}) => frames(w, h).section)
  runtime.addSurface(editor, ({w, h}) => frames(w, h).editor)
  runtime.addSurface(storyPreview, ({w, h}) => frames(w, h).storyPreview)
  runtime.addSurface(reference, ({w, h}) => frames(w, h).reference)
  runtime.addSurface(detail, ({w, h}) => frames(w, h).detail)
  runtime.addSurface(dock, ({w, h}) => frames(w, h).dock)
  runtime.addSurface(storyPanel, ({w, h}) => frames(w, h).story)

  retainedObserver = createPlaygroundRetainedObserver(editor)
  globalThis.__nodeComponentRetainedObserver = retainedObserver

  const applyRoute = async (route: NodePlaygroundRoute): Promise<void> => {
    const revision = ++storyRevision
    const sectionItems = nodePlaygroundSections(route)
    catalog.setOptions({title: "Компоненты нод", items: nodePlaygroundCatalog(route), route: nodePlaygroundCatalogRoute(route), onNavigate: navigate})
    sections.setOptions({title: nodePlaygroundSectionTitle(route), items: sectionItems, route, onNavigate: navigate})
    dock.setOptions({
      title: isNodeSocketStoryRoute(route) ? "Направление" : "Варианты",
      items: nodePlaygroundDockItems(route),
      route,
      onNavigate: navigate,
    })
    const group = nodePlaygroundGroup(route)
    document.documentElement.dataset.nodePlaygroundRoute = route
    document.documentElement.dataset.nodePlaygroundGroup = group
    document.documentElement.dataset.comparison = group === "comparison" ? "blender-reference-live-editor" : ""
    runtime.relayout()
    retainedObserver?.publishAfterFrame()
    const index = nodePlaygroundStoryIndex(route)
    const loaded = await loadNodePlaygroundStory(route)
    if (revision !== storyRevision || router.current !== route) return
    storyModule = loaded
    storyArgs = Object.freeze({...loaded.defaultArgs})
    if (isNodeSocketStoryRoute(route)) storyPreview.setStory(index, loaded, storyArgs)
    applyProductionStoryState(route)
    storyPanel.setOptions(storyPanelOptions())
    publishStoryState()
    renderPlaygroundFrame()
  }

  router.subscribe((route) => {
    void applyRoute(route).catch(publishPlaygroundError)
  })
  runtime.handleResize()
  await applyRoute(router.current)
  new ResizeObserver(() => {
    runtime.handleResize()
    retainedObserver?.publishAfterFrame()
  }).observe(canvas)
  document.documentElement.dataset.socketKinds = String(NODE_SOCKET_KINDS.length)
  document.documentElement.dataset.socketShapes = String(BLENDER_SOCKET_SHAPES.length)
  document.documentElement.dataset.nodeCount = String(tree.nodes.length)
  document.documentElement.dataset.linkCount = String(tree.links.length)
  document.documentElement.dataset.comparisonNodeCount = String(comparisonTree.nodes.length)
  document.documentElement.dataset.comparisonLinkCount = String(comparisonTree.links.length)
  renderPlaygroundFrame()
  void waitForReferenceFrame({
    readStatus: () => {
      const status = TextureLoader.status(BLENDER_REFERENCE_SRC)
      document.documentElement.dataset.nodeReferenceTexture = status
      return status
    },
    renderNextFrame: async () => {
      preparingReference = false
      renderPlaygroundFrame()
    },
  }).then(() => {
    document.documentElement.dataset.nodeReferenceReady = "ready"
    document.documentElement.dataset.nodeComponentPlayground = "ready"
  }).catch((error: unknown) => {
    publishPlaygroundError(error)
  })

  function renderPlaygroundFrame(): void {
    runtime.relayout()
    runtime.space.updateWorldMatrix()
    runtime.renderer.renderFrame(runtime.space, runtime.hud, runtime.viewPoint)
  }

  function publishStoryState(): void {
    const route = router.current
    document.documentElement.dataset.nodeStoryRoute = route
    document.documentElement.dataset.nodeStorySource = storyModule !== null
      ? storyModule.source(storyArgs)
      : ""
    document.documentElement.dataset.nodeStoryArgs = JSON.stringify(storyArgs)
    document.documentElement.dataset.nodeStoryTarget = isNodeEditorStoryRoute(route)
      ? nodeEditorStoryState(storyArgs).target
      : ""
    document.documentElement.dataset.nodeStoryTargetId = isNodeEditorStoryRoute(route)
      ? nodeEditorStoryState(storyArgs).nodeId
      : ""
    document.documentElement.dataset.nodeStorySections = String(nodePlaygroundSections(route).length)
    document.documentElement.dataset.nodeStoryVariants = String(nodePlaygroundDockItems(route).length)
    document.documentElement.dataset.nodeSocketSections = isNodeSocketStoryRoute(route) ? String(nodePlaygroundSections(route).length) : ""
    document.documentElement.dataset.nodeSocketVariants = isNodeSocketStoryRoute(route) ? String(nodePlaygroundDockItems(route).length) : ""
  }

  function applyProductionStoryState(route: NodePlaygroundRoute): void {
    if (isNodeSocketStoryRoute(route)) return
    if (isNodeEditorStoryRoute(route)) {
      applyNodeEditorStoryState(storyArgs, {
        select: (selection) => editor.select(selection),
        publish(state) {
          document.documentElement.dataset.nodeStoryTarget = state.target
          document.documentElement.dataset.nodeStoryTargetId = state.nodeId
          document.documentElement.dataset.selectedKind = state.selection?.kind ?? ""
          document.documentElement.dataset.selectedId = state.selection?.id ?? ""
        },
      })
      return
    }
    if (isNodeFrameStoryRoute(route) && storyArgs.selected === true) {
      editor.select({kind: "frame", id: "data-frame"})
      return
    }
    if (isNodeLinkStoryRoute(route) && storyArgs.selected === true) {
      editor.select({kind: "link", id: "matrix-shader"})
      return
    }
    editor.select(null)
  }
} catch (error) {
  publishPlaygroundError(error)
  throw error
}

function publishPlaygroundError(error: unknown): void {
  document.documentElement.dataset.nodeReferenceReady = "error"
  document.documentElement.dataset.nodeComponentPlayground = "error"
  document.documentElement.dataset.nodeComponentError = error instanceof Error ? error.message : String(error)
}
