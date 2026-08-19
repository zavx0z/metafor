import {UiRuntime} from "@ui/elements"
import {
  PlaygroundBackdropSurface,
  PlaygroundDockSurface,
  PlaygroundInfoSurface,
  PlaygroundNavigationSurface,
  PlaygroundRouter,
} from "@ui/playground"
import {
  BLENDER_SOCKET_KINDS,
  BLENDER_SOCKET_SHAPES,
  createBlenderNodeRenderers,
  type BlenderFrame,
  type BlenderLink,
  type BlenderNode,
  type BlenderSocket,
} from "../blender-node.ts"
import {NodeEditor} from "../node-editor.ts"
import {createCatalogNodeTree, createNoiseComparisonTree} from "./fixtures.ts"
import {planNodeComponentPlaygroundFrames} from "./layout.ts"
import {
  NODE_PLAYGROUND_CATALOG,
  NODE_PLAYGROUND_ROUTES,
  nodePlaygroundCatalogRoute,
  nodePlaygroundGroup,
  nodePlaygroundInfo,
  nodePlaygroundSectionTitle,
  nodePlaygroundSections,
  type NodePlaygroundRoute,
} from "./routes.ts"
import {BlenderReferenceSurface, SocketCatalogSurface} from "./surfaces.ts"

const canvas = document.getElementById("node-component-canvas")
if (!(canvas instanceof HTMLCanvasElement)) throw new Error("Canvas node component playground не найден")

const runtime = await UiRuntime.create(canvas, {
  fontUrl: "/JetBrainsMono-Bold.ttf",
  virtualDisplay: {initial: "near", surfaceDisplay: true, grid: false},
})
const router = new PlaygroundRouter<NodePlaygroundRoute>(NODE_PLAYGROUND_ROUTES, "editor/scene", {mode: "path"})
const navigate = (route: NodePlaygroundRoute): void => router.go(route)
const tree = createCatalogNodeTree()
const comparisonTree = createNoiseComparisonTree()

const backdrop = new PlaygroundBackdropSurface()
const catalog = new PlaygroundNavigationSurface<NodePlaygroundRoute>({
  title: "Компоненты нод",
  items: NODE_PLAYGROUND_CATALOG,
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
  title: "Маршруты",
  items: nodePlaygroundSections(router.current),
  route: router.current,
  onNavigate: navigate,
})
const initialInfo = nodePlaygroundInfo(router.current)
const info = new PlaygroundInfoSurface(initialInfo)
const sockets = new SocketCatalogSurface("types")
const reference = new BlenderReferenceSurface()
const detail = new NodeEditor<BlenderNode, BlenderSocket, BlenderLink, BlenderFrame>({
  renderers: createBlenderNodeRenderers(),
  title: "СРАВНЕНИЕ · ЖИВАЯ НОДА",
  minScale: 0.6,
  maxScale: 2.4,
  onCanvasTransformChange(transform) {
    document.documentElement.dataset.comparisonScale = String(transform.scale)
  },
})
detail.setTree(comparisonTree)
const editor = new NodeEditor<BlenderNode, BlenderSocket, BlenderLink, BlenderFrame>({
  renderers: createBlenderNodeRenderers(),
  title: "РЕДАКТОР НОД · КОМПОНЕНТНАЯ СЦЕНА",
  minScale: 0.26,
  maxScale: 2.4,
  onSelectionChange(selection) {
    document.documentElement.dataset.selectedKind = selection?.kind ?? ""
    document.documentElement.dataset.selectedId = selection?.id ?? ""
  },
  onCanvasTransformChange(transform) {
    document.documentElement.dataset.canvasX = String(transform.x)
    document.documentElement.dataset.canvasY = String(transform.y)
    document.documentElement.dataset.canvasScale = String(transform.scale)
  },
})
editor.setTree(tree)

const frames = (w: number, h: number) => planNodeComponentPlaygroundFrames(w, h, router.current)
runtime.addSurface(backdrop, ({w, h}) => frames(w, h).backdrop)
runtime.addSurface(catalog, ({w, h}) => frames(w, h).catalog)
runtime.addSurface(sections, ({w, h}) => frames(w, h).section)
runtime.addSurface(editor, ({w, h}) => frames(w, h).editor)
runtime.addSurface(sockets, ({w, h}) => frames(w, h).sockets)
runtime.addSurface(reference, ({w, h}) => frames(w, h).reference)
runtime.addSurface(detail, ({w, h}) => frames(w, h).detail)
runtime.addSurface(dock, ({w, h}) => frames(w, h).dock)
runtime.addSurface(info, ({w, h}) => frames(w, h).info)

const applyRoute = (route: NodePlaygroundRoute): void => {
  const sectionItems = nodePlaygroundSections(route)
  catalog.setOptions({title: "Компоненты нод", items: NODE_PLAYGROUND_CATALOG, route: nodePlaygroundCatalogRoute(route), onNavigate: navigate})
  sections.setOptions({title: nodePlaygroundSectionTitle(route), items: sectionItems, route, onNavigate: navigate})
  dock.setOptions({title: "Маршруты", items: sectionItems, route, onNavigate: navigate})
  info.setOptions(nodePlaygroundInfo(route))
  if (route === "socket/shapes") sockets.setMode("shapes")
  else if (route === "socket/states") sockets.setMode("states")
  else sockets.setMode("types")
  if (route === "editor/frames") editor.select({kind: "frame", id: "data-frame"})
  else if (route === "editor/links") editor.select({kind: "link", id: "matrix-shader"})
  else if (route === "editor/scene") editor.select(null)
  document.documentElement.dataset.nodePlaygroundRoute = route
  document.documentElement.dataset.nodePlaygroundGroup = nodePlaygroundGroup(route)
  document.documentElement.dataset.comparison = nodePlaygroundGroup(route) === "comparison" ? "blender-reference-live-editor" : ""
  runtime.handleResize()
}

router.subscribe(applyRoute)
applyRoute(router.current)
new ResizeObserver(() => runtime.handleResize()).observe(canvas)
runtime.handleResize()
document.documentElement.dataset.nodeComponentPlayground = "ready"
document.documentElement.dataset.socketKinds = String(BLENDER_SOCKET_KINDS.length)
document.documentElement.dataset.socketShapes = String(BLENDER_SOCKET_SHAPES.length)
document.documentElement.dataset.nodeCount = String(tree.nodes.length)
document.documentElement.dataset.linkCount = String(tree.links.length)
document.documentElement.dataset.comparisonNodeCount = String(comparisonTree.nodes.length)
document.documentElement.dataset.comparisonLinkCount = String(comparisonTree.links.length)
