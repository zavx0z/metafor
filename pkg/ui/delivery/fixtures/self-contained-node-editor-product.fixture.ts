import {UiRuntime} from "@ui/elements/runtime"
import {NodeEditor} from "@nodes/ui/node-editor"

export async function createNodeEditorProduct(canvas: HTMLCanvasElement) {
  const runtime = await UiRuntime.create(canvas)
  return Object.freeze({runtime, NodeEditor})
}
