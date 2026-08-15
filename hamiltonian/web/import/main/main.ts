/**
 * Window importer, загружаемый через Service Worker cache.
 *
 * @packageDocumentation
 */

import {GridHelper} from "@metafor/engine"
import {UiRuntime} from "@ui/elements"
import {DisplayDockSurface} from "./display-dock.ts"

const VISUAL_CANVAS_ID = "visual-canvas"
const VISUAL_FONT_URL = "/assets/fonts/JetBrainsMono-Bold.ttf"
const VISUAL_DISPLAY_ID = "main"
const VISUAL_DISPLAY_CENTER_MM = {x: 0, y: 0, z: 900} as const

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
      initial: "far",
      grid: false,
      surfaceDisplay: false,
    },
  })

  prepareSpace(runtime)
  runtime.handleResize()
  const display = prepareDisplay(runtime)
  prepareDisplayDock(runtime)
  canvasResizeObserver = new ResizeObserver(() => resizeVisualEnvironment(runtime))
  canvasResizeObserver.observe(canvas)

  console.info("main visual environment", {
    space: runtime.space,
    hud: runtime.hud,
    surfaceDisplay: runtime.display,
    display,
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

/** Создаёт один пустой explicit display стандартного Window environment. */
function prepareDisplay(runtime: UiRuntime) {
  return runtime.createDisplay({
    id: VISUAL_DISPLAY_ID,
    ...runtime.viewportDisplayMetrics(),
    centerMm: VISUAL_DISPLAY_CENTER_MM,
    background: 0x020617,
    border: 0x334155,
  })
}

/** Добавляет display navigation в HUD, не перекрывая input остального Space. */
function prepareDisplayDock(runtime: UiRuntime) {
  const dock = new DisplayDockSurface(() => {
    if (runtime.displayMode === "far") {
      runtime.focusDisplay(VISUAL_DISPLAY_ID)
      return
    }
    runtime.setDisplayMode("far")
  })
  runtime.addHudSurface(dock, ({w, h}) => ({x: 0, y: 0, w, h}))
}

/** Согласует framebuffer и physical display с текущим размером canvas. */
function resizeVisualEnvironment(runtime: UiRuntime) {
  runtime.handleResize()
  runtime.resizeDisplay(VISUAL_DISPLAY_ID, runtime.viewportDisplayMetrics())
  if (runtime.displayMode === "near") runtime.refitDisplay(VISUAL_DISPLAY_ID)
}

/** Возвращает единственный canvas, которым владеет static Window host. */
function requiredCanvas() {
  const canvas = document.getElementById(VISUAL_CANVAS_ID)
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error(`Window visual canvas #${VISUAL_CANVAS_ID} is missing`)
  }
  return canvas
}
