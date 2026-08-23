import {UiRuntime} from "@ui/elements/runtime"
import {Field} from "@ui/components/field"

export async function createFieldProduct(canvas: HTMLCanvasElement) {
  const runtime = await UiRuntime.create(canvas)
  return Object.freeze({runtime, Field})
}
