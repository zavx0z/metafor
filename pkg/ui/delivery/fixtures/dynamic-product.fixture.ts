import {UiRuntime} from "@ui/elements/runtime"
import type {UiSurface} from "@ui/elements/surface"

export async function createDynamicProduct(canvas: HTMLCanvasElement) {
  const runtime = await UiRuntime.create(canvas)
  const [{Button}, {Field}, {NodeEditor}] = await Promise.all([
    import("@ui/components/button"),
    import("@ui/components/field"),
    import("@nodes/ui/node-editor"),
  ])
  return Object.freeze({runtime, Button, Field, NodeEditor})
}

export function attachProductSurface(runtime: UiRuntime, surface: UiSurface): void {
  runtime.addSurface(surface, ({w, h}) => ({x: 0, y: 0, w, h}))
}
