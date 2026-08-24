import {UiRuntime} from "@ui/elements/runtime"
import {Button} from "@ui/components/button"

export async function createButtonProduct(canvas: HTMLCanvasElement) {
  const runtime = await UiRuntime.create(canvas)
  return Object.freeze({runtime, Button})
}
