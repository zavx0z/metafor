import {UiRuntime} from "@ui/elements"
import {
  BLENDER_SOCKET_KINDS,
  BLENDER_SOCKET_SHAPES,
  createBlenderNodeRenderers,
  type BlenderLink,
  type BlenderNode,
  type BlenderSocket,
} from "../blender-node.ts"
import {NodeEditor} from "../node-editor.ts"
import {STANDALONE_FIELD_KINDS, createCatalogNodeTree} from "./fixtures.ts"
import {planNodeComponentPlaygroundFrames} from "./layout.ts"
import {FieldCatalogSurface, SocketCatalogSurface} from "./surfaces.ts"

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
  const sockets = new SocketCatalogSurface()
  const editor = new NodeEditor<BlenderNode, BlenderSocket, BlenderLink>({
    renderers: createBlenderNodeRenderers(),
    title: "NODE EDITOR · COMPONENT COMPOSITION",
    minScale: 0.58,
    maxScale: 2.4,
    onSelectionChange(nodeId) {
      document.documentElement.dataset.selectedNode = nodeId ?? ""
    },
  })
  editor.setTree(createCatalogNodeTree())

  runtime.addSurface(fields, ({w, h}) => planNodeComponentPlaygroundFrames(w, h).fields)
  runtime.addSurface(editor, ({w, h}) => planNodeComponentPlaygroundFrames(w, h).editor)
  runtime.addSurface(sockets, ({w, h}) => planNodeComponentPlaygroundFrames(w, h).sockets)

  const resizeObserver = new ResizeObserver(() => runtime.handleResize())
  resizeObserver.observe(canvas)
  document.documentElement.dataset.nodeComponentPlayground = "ready"
  document.documentElement.dataset.fieldKinds = String(STANDALONE_FIELD_KINDS.length)
  document.documentElement.dataset.socketKinds = String(BLENDER_SOCKET_KINDS.length)
  document.documentElement.dataset.socketShapes = String(BLENDER_SOCKET_SHAPES.length)
  document.documentElement.dataset.nodeCount = String(editor.tree.nodes.length)
  document.documentElement.dataset.linkCount = String(editor.tree.links.length)
  status.value = `${STANDALONE_FIELD_KINDS.length} fields · ${BLENDER_SOCKET_KINDS.length} sockets · ${BLENDER_SOCKET_SHAPES.length} shapes`
} catch (error) {
  status.dataset.state = "error"
  status.value = error instanceof Error ? error.message : String(error)
  document.documentElement.dataset.nodeComponentPlayground = "error"
  throw error
}
