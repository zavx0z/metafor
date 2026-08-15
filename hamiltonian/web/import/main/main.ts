/**
 * Window importer, загружаемый через Service Worker cache.
 *
 * @packageDocumentation
 */

import {UiRuntime} from "@ui/elements"

const VISUAL_CANVAS_ID = "visual-canvas"
const VISUAL_FONT_URL = "/assets/fonts/JetBrainsMono-Bold.ttf"

let visualEnvironment: Promise<UiRuntime> | null = null
let canvasResizeObserver: ResizeObserver | null = null

/**
 * Создаёт стандартную Window-среду до запуска будущих предметных modules.
 *
 * Повторный вызов использует тот же initialization Promise и не создаёт второй
 * canvas, Renderer, Space или HUD.
 */
export default async function importMain() {
  visualEnvironment ??= createVisualEnvironment()
  await visualEnvironment
}

/** Создаёт один пустой explicit-display runtime на static canvas документа. */
async function createVisualEnvironment() {
  const canvas = requiredCanvas()
  const runtime = await UiRuntime.create(canvas, {
    fontUrl: VISUAL_FONT_URL,
    virtualDisplay: {
      grid: true,
      surfaceDisplay: false,
    },
  })

  runtime.handleResize()
  canvasResizeObserver = new ResizeObserver(() => runtime.handleResize())
  canvasResizeObserver.observe(canvas)

  console.info("main visual environment", {
    space: runtime.space,
    hud: runtime.hud,
    display: runtime.display,
  })
  console.info("main importer")
  return runtime
}

/** Возвращает единственный canvas, которым владеет static Window host. */
function requiredCanvas() {
  const canvas = document.getElementById(VISUAL_CANVAS_ID)
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error(`Window visual canvas #${VISUAL_CANVAS_ID} is missing`)
  }
  return canvas
}
