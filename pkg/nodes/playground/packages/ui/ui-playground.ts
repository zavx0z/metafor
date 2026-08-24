import {TextureLoader} from "@metafor/engine"
import {UiRuntime} from "@ui/elements"
import {
  PlaygroundBackdropSurface,
  PlaygroundDockSurface,
  PlaygroundNavigationSurface,
  PlaygroundRouteTreeRouter,
  PlaygroundStoryPanelSurface,
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
} from "@nodes/ui/blender-node"
import {NodeEditor} from "@nodes/ui/node-editor"
import {
  bindNodeFieldValueState,
  createNodeFieldValueState,
  updateNodeFieldValueState,
  type NodeFieldAction,
  type NodeFieldValueState,
} from "./state/controlled-field-state.ts"
import {createCatalogNodeTree, createNoiseComparisonTree} from "./fixtures/ui-fixtures.ts"
import {planNodeComponentPlaygroundFrames} from "./ui-workbench-layout.ts"
import {waitForReferenceFrame} from "./evidence/reference-readiness.ts"
import {createPlaygroundRetainedObserver, type PlaygroundRetainedObserver} from "./evidence/retained-observer.ts"
import {
  NODE_PLAYGROUND_ROUTE_TREE,
  NODE_UI_PLAYGROUND_BASE_PATH,
  isNodeEditorStoryRoute,
  isNodeFrameStoryRoute,
  isNodeLinkStoryRoute,
  isNodeParameterStoryRoute,
  loadNodePlaygroundStory,
  nodePlaygroundCatalog,
  nodePlaygroundCatalogRoute,
  nodePlaygroundDockTitle,
  nodePlaygroundDockItems,
  nodePlaygroundGroup,
  nodePlaygroundSectionRoute,
  nodePlaygroundSectionTitle,
  nodePlaygroundSections,
  nodePlaygroundStoryIndex,
  nodePlaygroundWorkbenchStoryRoute,
  type NodePlaygroundRoute,
  type NodePlaygroundStoryRoute,
} from "./ui-navigation.ts"
import {
  NODE_SOCKET_KINDS,
  isNodeSocketStoryRoute,
  nodeEditorStoryRoute,
  nodeEditorStoryState,
} from "./ui-story-catalog.ts"
import {applyNodeEditorStoryState} from "./state/node-editor-story-state.ts"
import {NodeStoryPreviewSurface} from "./surfaces/story-preview-surface.ts"
import {BLENDER_REFERENCE_SRC, BlenderReferenceSurface} from "./surfaces/reference-surfaces.ts"

const canvas = document.getElementById("nodes-playground-canvas")
if (!(canvas instanceof HTMLCanvasElement)) throw new Error("Canvas node component playground не найден")

document.documentElement.dataset.nodesPlayground = "starting"
document.documentElement.dataset.nodesPlaygroundPage = "ui"
document.documentElement.dataset.nodeComponentPlayground = "starting"
document.documentElement.dataset.nodeReferenceReady = "loading"

try {
  let retainedObserver: PlaygroundRetainedObserver | null = null
  let preparingReference = true
  const runtime = await UiRuntime.create(canvas, {
    fontUrl: "/JetBrainsMono-Bold.ttf",
    virtualDisplay: {initial: "near", surfaceDisplay: true, grid: false},
  })
  const router = new PlaygroundRouteTreeRouter(NODE_PLAYGROUND_ROUTE_TREE, {
    basePath: NODE_UI_PLAYGROUND_BASE_PATH,
  })
  const currentRoute = (): NodePlaygroundRoute => router.current.path
  const navigate = (route: NodePlaygroundRoute): void => {
    if (!router.go(route)) throw new Error(`Unknown Node playground route: ${route}`)
  }
  const tree = createCatalogNodeTree()
  const comparisonTree = createNoiseComparisonTree()
  let nodeFieldRoute: NodePlaygroundRoute | null = null
  let nodeFieldValues: NodeFieldValueState = createNodeFieldValueState(tree)
  let nodeFieldActions: readonly NodeFieldAction[] = Object.freeze([])
  let previewRoute: NodePlaygroundRoute | null = null
  let previewEnabledByNode: Readonly<Record<string, boolean>> = Object.freeze({})
  let storyModule: PlaygroundStoryModule | null = null
  let storyArgs: PlaygroundStoryArgs = Object.freeze({})
  let workbenchStoryRoute: NodePlaygroundStoryRoute = nodePlaygroundWorkbenchStoryRoute(currentRoute())
  let storyPanelMode: PlaygroundStoryPanelMode = "controls"
  let storyRevision = 0
  let collapsedCatalogGroups = new Set<string>()

  const backdrop = new PlaygroundBackdropSurface()
  const catalog = new PlaygroundNavigationSurface<NodePlaygroundRoute>({
    title: "Компоненты нод",
    items: nodePlaygroundCatalog(currentRoute(), collapsedCatalogGroups),
    route: nodePlaygroundCatalogRoute(currentRoute()),
    onNavigate: navigate,
    onGroupToggle: handleCatalogGroupToggle,
  })
  const sections = new PlaygroundNavigationSurface<NodePlaygroundRoute>({
    title: nodePlaygroundSectionTitle(workbenchStoryRoute),
    items: nodePlaygroundSections(workbenchStoryRoute),
    route: nodePlaygroundSectionRoute(currentRoute()) ?? "",
    onNavigate: navigate,
  })
  const dock = new PlaygroundDockSurface<NodePlaygroundRoute>({
    title: nodePlaygroundDockTitle(workbenchStoryRoute),
    items: nodePlaygroundDockItems(workbenchStoryRoute),
    route: router.current.kind === "leaf" ? currentRoute() : "",
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
      if (isNodeEditorStoryRoute(workbenchStoryRoute) && (key === "target" || key === "selected")) {
        const state = nodeEditorStoryState(nextArgs)
        const nextRoute = nodeEditorStoryRoute(state.target, state.selected)
        if (nextRoute !== workbenchStoryRoute) {
          navigate(nextRoute)
          return
        }
      }
      storyArgs = nextArgs
      if (isNodeParameterStoryRoute(workbenchStoryRoute) || isNodeSocketStoryRoute(workbenchStoryRoute)) {
        storyPreview.setArgs(storyArgs)
      }
      applyProductionStoryState(workbenchStoryRoute)
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
    const planned = planNodeComponentPlaygroundFrames(w, h, workbenchStoryRoute)
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
    const storyRoute = nodePlaygroundWorkbenchStoryRoute(route)
    const routeNode = NODE_PLAYGROUND_ROUTE_TREE.find(route)
    if (routeNode === undefined) throw new Error(`Unknown Node playground route: ${route}`)
    const sectionItems = nodePlaygroundSections(storyRoute)
    catalog.setOptions({
      title: "Компоненты нод",
      items: nodePlaygroundCatalog(route, collapsedCatalogGroups),
      route: nodePlaygroundCatalogRoute(route),
      onNavigate: navigate,
      onGroupToggle: handleCatalogGroupToggle,
    })
    sections.setOptions({
      title: nodePlaygroundSectionTitle(storyRoute),
      items: sectionItems,
      route: nodePlaygroundSectionRoute(route) ?? "",
      onNavigate: navigate,
    })
    dock.setOptions({
      title: nodePlaygroundDockTitle(storyRoute),
      items: nodePlaygroundDockItems(storyRoute),
      route: routeNode.kind === "leaf" ? route : "",
      onNavigate: navigate,
    })
    const group = nodePlaygroundGroup(storyRoute)
    document.documentElement.dataset.nodePlaygroundRoute = route
    document.documentElement.dataset.nodePlaygroundRouteKind = routeNode.kind
    document.documentElement.dataset.nodePlaygroundGroup = group
    document.documentElement.dataset.comparison = group === "comparison" ? "blender-reference-live-editor" : ""
    const index = nodePlaygroundStoryIndex(storyRoute)
    const loaded = await loadNodePlaygroundStory(storyRoute)
    if (revision !== storyRevision || currentRoute() !== route) return
    workbenchStoryRoute = storyRoute
    storyModule = loaded
    storyArgs = Object.freeze({...loaded.defaultArgs})
    if (isNodeParameterStoryRoute(storyRoute) || isNodeSocketStoryRoute(storyRoute)) {
      storyPreview.setStory(index, loaded, storyArgs)
    }
    applyProductionStoryState(storyRoute)
    storyPanel.setOptions(storyPanelOptions())
    publishStoryState()
    renderPlaygroundFrame()
  }

  router.subscribe((node) => {
    void applyRoute(node.path).catch(publishPlaygroundError)
  })

  function handleCatalogGroupToggle(groupId: string, collapsed: boolean): void {
    collapsedCatalogGroups = new Set(collapsedCatalogGroups)
    if (collapsed) collapsedCatalogGroups.add(groupId)
    else collapsedCatalogGroups.delete(groupId)
    catalog.setOptions({
      title: "Компоненты нод",
      items: nodePlaygroundCatalog(currentRoute(), collapsedCatalogGroups),
      route: nodePlaygroundCatalogRoute(currentRoute()),
      onNavigate: navigate,
      onGroupToggle: handleCatalogGroupToggle,
    })
    runtime.relayout()
  }
  runtime.handleResize()
  await applyRoute(currentRoute())
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
    document.documentElement.dataset.nodesPlayground = "ready"
  }).catch((error: unknown) => {
    publishPlaygroundError(error)
  })

  function renderPlaygroundFrame(): void {
    runtime.relayout()
    runtime.space.updateWorldMatrix()
    runtime.renderer.renderFrame(runtime.space, runtime.hud, runtime.viewPoint)
  }

  function publishStoryState(): void {
    const navigationRoute = currentRoute()
    const route = workbenchStoryRoute
    document.documentElement.dataset.nodePlaygroundRoute = navigationRoute
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
    document.documentElement.dataset.nodeFieldValues = JSON.stringify(nodeFieldValues)
    document.documentElement.dataset.nodeFieldActions = JSON.stringify(nodeFieldActions)
    document.documentElement.dataset.nodePreviewEnabled = storyArgs["preview-enabled"] === true ? "true" : "false"
    document.documentElement.dataset.nodeOverlaysVisible = storyArgs["overlays-visible"] === false ? "false" : "true"
    document.documentElement.dataset.nodePreviewsVisible = storyArgs["previews-visible"] === false ? "false" : "true"
    document.documentElement.dataset.nodePreviewBuffer = String(storyArgs["preview-buffer"] ?? "")
    document.documentElement.dataset.nodePreviewFlags = JSON.stringify(previewEnabledByNode)
    document.documentElement.dataset.nodeParameterSections = isNodeParameterStoryRoute(route) ? String(nodePlaygroundSections(route).length) : ""
    document.documentElement.dataset.nodeParameterVariants = isNodeParameterStoryRoute(route) ? String(nodePlaygroundDockItems(route).length) : ""
    document.documentElement.dataset.nodeSocketSections = isNodeSocketStoryRoute(route) ? String(nodePlaygroundSections(route).length) : ""
    document.documentElement.dataset.nodeSocketVariants = isNodeSocketStoryRoute(route) ? String(nodePlaygroundDockItems(route).length) : ""
  }

  function applyProductionStoryState(route: NodePlaygroundRoute): void {
    const previewable = storyArgs["previewable"] === true
    const previewNodeIds = previewable && Array.isArray(storyArgs["preview-nodes"])
      ? storyArgs["preview-nodes"].filter((value): value is string => typeof value === "string")
      : []
    if (previewRoute !== route) {
      previewRoute = route
      previewEnabledByNode = Object.freeze(Object.fromEntries(previewNodeIds.map((nodeId) => [
        nodeId,
        nodeId === "scalar" ? storyArgs["preview-enabled"] === true : true,
      ])))
    }
    editor.setOverlayState({
      overlays: storyArgs["overlays-visible"] !== false,
      previews: storyArgs["previews-visible"] !== false,
    })
    const baseTree = createCatalogNodeTree({
      openSelect: isNodeEditorStoryRoute(route) && storyArgs["select-open"] === true,
      translationLinked: storyArgs["translation-linked"] !== false,
      rotationLinked: storyArgs["rotation-linked"] === true,
      rotationOutput: storyArgs["rotation-output"] === true,
      colorLinked: storyArgs["color-linked"] !== false,
      ...(previewable ? {
        previewEnabled: storyArgs["preview-enabled"] === true,
        previewNodeIds,
        previewEnabledByNode,
        previewBuffer: (storyArgs["preview-buffer"] ?? "primary") as "primary" | "alternate" | "missing" | "zero",
        onPreviewToggle(nodeId: string, enabled: boolean) {
          if (workbenchStoryRoute !== route) return
          previewEnabledByNode = Object.freeze({...previewEnabledByNode, [nodeId]: enabled})
          if (nodeId === "scalar") storyArgs = Object.freeze({...storyArgs, "preview-enabled": enabled})
          applyProductionStoryState(route)
          storyPanel.setOptions(storyPanelOptions())
          publishStoryState()
          retainedObserver?.publishAfterFrame()
        },
      } : {}),
    })
    if (nodeFieldRoute !== route) {
      nodeFieldRoute = route
      nodeFieldValues = createNodeFieldValueState(baseTree)
      nodeFieldActions = Object.freeze([])
    }
    editor.setTree(bindNodeFieldValueState(baseTree, nodeFieldValues, (nodeId, fieldId, value) => {
      if (workbenchStoryRoute !== route) return
      nodeFieldValues = updateNodeFieldValueState(nodeFieldValues, nodeId, fieldId, value)
      applyProductionStoryState(route)
      publishStoryState()
      retainedObserver?.publishAfterFrame()
    }, (action) => {
      if (workbenchStoryRoute !== route) return
      nodeFieldActions = Object.freeze([...nodeFieldActions, action].slice(-32))
      publishStoryState()
    }))
    document.documentElement.dataset.nodeFieldValues = JSON.stringify(nodeFieldValues)
    document.documentElement.dataset.nodeFieldActions = JSON.stringify(nodeFieldActions)
    document.documentElement.dataset.nodePreviewEnabled = storyArgs["preview-enabled"] === true ? "true" : "false"
    document.documentElement.dataset.nodeOverlaysVisible = storyArgs["overlays-visible"] === false ? "false" : "true"
    document.documentElement.dataset.nodePreviewsVisible = storyArgs["previews-visible"] === false ? "false" : "true"
    document.documentElement.dataset.nodePreviewBuffer = String(storyArgs["preview-buffer"] ?? "")
    document.documentElement.dataset.nodePreviewFlags = JSON.stringify(previewEnabledByNode)
    if (isNodeParameterStoryRoute(route) || isNodeSocketStoryRoute(route)) return
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
  document.documentElement.dataset.nodesPlayground = "error"
  document.documentElement.dataset.nodeComponentError = error instanceof Error ? error.message : String(error)
}
