import {GridHelper} from "@metafor/engine"
import {UiRuntime} from "@ui/elements"
import {DisplayDockSurface} from "./display-dock.ts"

const VISUAL_CANVAS_ID = "visual-canvas"
const VISUAL_FONT_URL = "/assets/fonts/JetBrainsMono-Bold.ttf"
const VISUAL_DISPLAY_ID = "main"
const VISUAL_DISPLAY_CENTER_MM = {x: 0, y: 0, z: 900} as const

export const environment = "main" as const

const canvas = document.getElementById(VISUAL_CANVAS_ID)
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error(`Window visual canvas #${VISUAL_CANVAS_ID} is missing`)
}

export const runtime = await UiRuntime.create(canvas, {
  fontUrl: VISUAL_FONT_URL,
  virtualDisplay: {
    initial: "far",
    grid: false,
    surfaceDisplay: false,
  },
})

const grid = new GridHelper(2400, 24)
grid.name = "SpaceFloorGrid"
grid.frustumCulled = false
runtime.space.add(grid)

runtime.viewPoint.position.set(0, -1600, 900)
runtime.viewPoint.getTarget().set(0, 0, 900)
runtime.viewPoint.alignUpToWorldZ()
runtime.viewPoint.update()

runtime.handleResize()
const display = runtime.createDisplay({
  id: VISUAL_DISPLAY_ID,
  ...runtime.viewportDisplayMetrics(),
  centerMm: VISUAL_DISPLAY_CENTER_MM,
  background: 0x020617,
  border: 0x334155,
})

const dock = new DisplayDockSurface(() => {
  if (runtime.displayMode === "far") {
    runtime.focusDisplay(VISUAL_DISPLAY_ID)
    return
  }
  runtime.setDisplayMode("far")
})
runtime.addHudSurface(dock, ({w, h}) => ({x: 0, y: 0, w, h}))

const canvasResizeObserver = new ResizeObserver(() => {
  runtime.handleResize()
  runtime.resizeDisplay(VISUAL_DISPLAY_ID, runtime.viewportDisplayMetrics())
  if (runtime.displayMode === "near") runtime.refitDisplay(VISUAL_DISPLAY_ID)
})
canvasResizeObserver.observe(canvas)

console.debug("[@internal/visual:main]", "основное visual-окружение создано", {
  space: runtime.space,
  hud: runtime.hud,
  surfaceDisplay: runtime.display,
  display,
})
