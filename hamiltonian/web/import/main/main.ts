/**
 * Window importer, загружаемый через Service Worker cache.
 *
 * @packageDocumentation
 */

import {GridHelper} from "@metafor/engine"
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

/** Создаёт один стандартный explicit-display runtime на static canvas документа. */
async function createVisualEnvironment() {
  const canvas = requiredCanvas()
  const runtime = await UiRuntime.create(canvas, {
    fontUrl: VISUAL_FONT_URL,
    virtualDisplay: {
      grid: false,
      surfaceDisplay: false,
    },
  })

  prepareSpace(runtime)
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

/** Добавляет Engine grid как пол Space и направляет на него стартовую камеру. */
function prepareSpace(runtime: UiRuntime) {
  const grid = new GridHelper(2400, 24)
  grid.name = "SpaceFloorGrid"
  grid.frustumCulled = false
  runtime.space.add(grid)

  runtime.viewPoint.position.set(1600, -1600, 1200)
  runtime.viewPoint.getTarget().set(0, 0, 0)
  runtime.viewPoint.alignUpToWorldZ()
  runtime.viewPoint.update()
}

/** Возвращает единственный canvas, которым владеет static Window host. */
function requiredCanvas() {
  const canvas = document.getElementById(VISUAL_CANVAS_ID)
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error(`Window visual canvas #${VISUAL_CANVAS_ID} is missing`)
  }
  return canvas
}
