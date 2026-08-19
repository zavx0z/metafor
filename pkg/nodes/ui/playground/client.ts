import {UiRuntime} from "@ui/elements"
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
import {STANDALONE_FIELD_KINDS, createCatalogNodeTree, createNoiseComparisonTree} from "./fixtures.ts"
import {planNodeComponentPlaygroundFrames} from "./layout.ts"
import {BlenderReferenceSurface, FieldCatalogSurface, SocketCatalogSurface} from "./surfaces.ts"

const canvas = document.getElementById("node-component-canvas")
const status = document.getElementById("status")
if (!(canvas instanceof HTMLCanvasElement)) throw new Error("Canvas node component playground не найден")
if (!(status instanceof HTMLOutputElement)) throw new Error("Status node component playground не найден")

try {
  const runtime = await UiRuntime.create(canvas, {
    fontUrl: "/engine-static/JetBrainsMono-Bold.ttf",
    virtualDisplay: {initial: "near", surfaceDisplay: true, grid: false},
  })
  runtime.handleResize()

  const fields = new FieldCatalogSurface()
  const reference = new BlenderReferenceSurface()
  const sockets = new SocketCatalogSurface()
  const detail = new NodeEditor<BlenderNode, BlenderSocket, BlenderLink, BlenderFrame>({
    renderers: createBlenderNodeRenderers(),
    title: "СРАВНЕНИЕ · ЖИВАЯ НОДА",
    minScale: 0.6,
    maxScale: 2.4,
    onCanvasTransformChange(transform) {
      document.documentElement.dataset.comparisonScale = String(transform.scale)
    },
  })
  detail.setTree(createNoiseComparisonTree())
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
  editor.setTree(createCatalogNodeTree())
  editor.select({kind: "link", id: "matrix-shader"})

  runtime.addSurface(fields, ({w, h}) => planNodeComponentPlaygroundFrames(w, h).fields)
  runtime.addSurface(reference, ({w, h}) => planNodeComponentPlaygroundFrames(w, h).reference)
  runtime.addSurface(detail, ({w, h}) => planNodeComponentPlaygroundFrames(w, h).detail)
  runtime.addSurface(editor, ({w, h}) => planNodeComponentPlaygroundFrames(w, h).editor)
  runtime.addSurface(sockets, ({w, h}) => planNodeComponentPlaygroundFrames(w, h).sockets)

  const resizeObserver = new ResizeObserver(() => runtime.handleResize())
  resizeObserver.observe(canvas)
  document.documentElement.dataset.nodeComponentPlayground = "ready"
  document.documentElement.dataset.comparison = "blender-reference-live-editor"
  document.documentElement.dataset.fieldKinds = String(STANDALONE_FIELD_KINDS.length)
  document.documentElement.dataset.socketKinds = String(BLENDER_SOCKET_KINDS.length)
  document.documentElement.dataset.socketShapes = String(BLENDER_SOCKET_SHAPES.length)
  document.documentElement.dataset.nodeCount = String(editor.tree.nodes.length)
  document.documentElement.dataset.linkCount = String(editor.tree.links.length)
  document.documentElement.dataset.comparisonNodeCount = String(detail.tree.nodes.length)
  document.documentElement.dataset.comparisonLinkCount = String(detail.tree.links.length)
  status.value = `${STANDALONE_FIELD_KINDS.length} fields · ${BLENDER_SOCKET_KINDS.length} sockets · ${BLENDER_SOCKET_SHAPES.length} shapes`
} catch (error) {
  status.dataset.state = "error"
  status.value = error instanceof Error ? error.message : String(error)
  document.documentElement.dataset.nodeComponentPlayground = "error"
  throw error
}
