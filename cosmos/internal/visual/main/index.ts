/**
Browser entrypoint готовой визуальной среды Cosmos.

Initial evaluation требует принадлежащий приложению canvas, получает
Engine-owned default font и создаёт один document SpaceRuntime. Основная
поверхность является world-space DOM plane, а навигационный dock — отдельным
camera-locked DOM overlay того же Engine frame. Отсутствующий canvas либо font
declaration завершает запуск до экспорта готового runtime.

Пользовательский [закон визуальной среды](../README.md#визуальная-среда-main)
отделяет эту инфраструктуру от смысла показываемых Quantum/metafor данных.
Состав package и build boundaries проверяет
[visual regression](../../../tests/ham-005.boundary.spec.ts).

@packageDocumentation
*/

import {GridHelper} from "@engine/core"
import {loadDocumentDefaultFont} from "@engine/core/default-font"
import {createDocument} from "@zavx0z/dom"
import {
  createDocumentSpaceRuntime,
  type DocumentSpaceViewPointSnapshot,
} from "@zavx0z/renderer-browser"
import {createDisplayDock, type DisplayMode} from "./display-dock.ts"

const VISUAL_CANVAS_ID = "visual-canvas"
const VISUAL_DISPLAY_ID = "main"
const VISUAL_DOCK_ID = "main-display-dock"
const VISUAL_DISPLAY_CENTER_MM = Object.freeze({x: 0, y: 0, z: 900})
const VISUAL_DISPLAY_NEAR_DISTANCE_MM = 600
const VISUAL_DISPLAY_FAR_DISTANCE_MM = 1_600
const VISUAL_FOV = Math.PI / 4
const VISUAL_DISPLAY_QUATERNION = Object.freeze({
  x: Math.sin(Math.PI / 4),
  y: 0,
  z: 0,
  w: Math.cos(Math.PI / 4),
})

/** Точный browser environment этого platform entrypoint. */
export const environment = "main" as const

const canvas = globalThis.document.getElementById(VISUAL_CANVAS_ID)
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error(`Window visual canvas #${VISUAL_CANVAS_ID} is missing`)
}

const font = await loadDocumentDefaultFont()
const visualDocument = createDocument()
const surface = visualDocument.createElement("div")
surface.id = VISUAL_DISPLAY_ID
surface.title = "Основная поверхность Cosmos"
surface.setAttribute("style", [
  "box-sizing: border-box",
  "width: 100%",
  "height: 100%",
  "background: #020617",
  "border: 1px solid #334155",
].join("; "))
visualDocument.appendChild(surface)

const initialViewPoint = Object.freeze({
  position: Object.freeze({
    x: VISUAL_DISPLAY_CENTER_MM.x,
    y: VISUAL_DISPLAY_CENTER_MM.y - VISUAL_DISPLAY_FAR_DISTANCE_MM,
    z: VISUAL_DISPLAY_CENTER_MM.z,
  }),
  target: VISUAL_DISPLAY_CENTER_MM,
  up: Object.freeze({x: 0, y: 0, z: 1}),
  fov: VISUAL_FOV,
  near: 1,
  far: 5_000,
}) satisfies DocumentSpaceViewPointSnapshot

/** Готовый shared visual runtime после обязательной initial materialization. */
export const runtime = await createDocumentSpaceRuntime({
  canvas,
  viewPoint: initialViewPoint,
  cameraGestures: true,
})

const grid = new GridHelper(2400, 24)
grid.name = "SpaceFloorGrid"
grid.frustumCulled = false
runtime.space.add(grid)

const displayViewport = readCanvasViewport(canvas)
runtime.addPlane({
  id: VISUAL_DISPLAY_ID,
  document: visualDocument,
  root: surface,
  styleSheets: [],
  font,
  viewport: displayViewport,
  worldUnitsPerPixel: displayWorldUnitsPerPixel(displayViewport.height),
  transform: {
    position: VISUAL_DISPLAY_CENTER_MM,
    quaternion: VISUAL_DISPLAY_QUATERNION,
  },
})

let displayMode: DisplayMode = "far"
let farViewPoint = runtime.snapshotViewPoint()
const dockDocument = createDocument()
const dock = createDisplayDock(dockDocument, () => {
  if (displayMode === "far") {
    farViewPoint = runtime.snapshotViewPoint()
    runtime.restoreViewPoint(focusedViewPoint(farViewPoint))
    runtime.setCameraGesturesEnabled(false)
    displayMode = "near"
  } else {
    runtime.restoreViewPoint(farViewPoint)
    runtime.setCameraGesturesEnabled(true)
    displayMode = "far"
  }
  dock.setMode(displayMode)
})
dock.resize(displayViewport.width)
dockDocument.appendChild(dock.root)
runtime.addOverlay({
  id: VISUAL_DOCK_ID,
  document: dockDocument,
  root: dockDocument,
  styleSheets: [],
  font,
})

const canvasResizeObserver = new ResizeObserver(() => {
  const viewport = readCanvasViewport(canvas)
  dock.resize(viewport.width)
  runtime.updatePlane(VISUAL_DISPLAY_ID, {
    viewport,
    worldUnitsPerPixel: displayWorldUnitsPerPixel(viewport.height),
  })
})
canvasResizeObserver.observe(canvas)
runtime.render()

console.debug("[@internal/visual:main]", "основное visual-окружение создано", {
  space: runtime.space,
  viewPoint: runtime.viewPoint,
  display: runtime.getPlane(VISUAL_DISPLAY_ID)?.plane,
  dock: runtime.getOverlay(VISUAL_DOCK_ID)?.overlay,
})

function readCanvasViewport(owner: HTMLCanvasElement): Readonly<{width: number; height: number}> {
  const rect = owner.getBoundingClientRect()
  return Object.freeze({
    width: positiveExtent(rect.width),
    height: positiveExtent(rect.height),
  })
}

function displayWorldUnitsPerPixel(viewportHeight: number): number {
  const heightMm = 2 * VISUAL_DISPLAY_NEAR_DISTANCE_MM * Math.tan(VISUAL_FOV / 2)
  return heightMm / positiveExtent(viewportHeight)
}

function focusedViewPoint(
  source: DocumentSpaceViewPointSnapshot,
): DocumentSpaceViewPointSnapshot {
  const offset = {
    x: source.position.x - VISUAL_DISPLAY_CENTER_MM.x,
    y: source.position.y - VISUAL_DISPLAY_CENTER_MM.y,
    z: source.position.z - VISUAL_DISPLAY_CENTER_MM.z,
  }
  const length = Math.hypot(offset.x, offset.y, offset.z)
  const scale = VISUAL_DISPLAY_NEAR_DISTANCE_MM / Math.max(length, 0.001)
  return Object.freeze({
    ...source,
    position: Object.freeze({
      x: VISUAL_DISPLAY_CENTER_MM.x + offset.x * scale,
      y: VISUAL_DISPLAY_CENTER_MM.y + offset.y * scale,
      z: VISUAL_DISPLAY_CENTER_MM.z + offset.z * scale,
    }),
    target: VISUAL_DISPLAY_CENTER_MM,
  })
}

function positiveExtent(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.max(1, Math.round(value)) : 1
}
