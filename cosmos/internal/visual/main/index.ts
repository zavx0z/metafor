/**
Browser entrypoint готовой визуальной среды Cosmos.

Initial evaluation требует принадлежащий приложению canvas, создаёт один
semantic Experience Document и подключает к нему exact linked public theme.
Только после готовности native stylesheet и Engine-owned default font он
создаёт один SpaceRuntime. Основная поверхность является world-space root, а
compiled production Button dock — sibling camera-locked overlay root того же
Document и Engine frame. Отсутствующий canvas, package version, font declaration
либо stylesheet завершает запуск до экспорта готового runtime и освобождает
созданный stylesheet host.

Пользовательский [закон визуальной среды](../README.md#визуальная-среда-main)
отделяет эту инфраструктуру от смысла показываемых Quantum/metafor данных.
Состав package и build boundaries проверяет
[visual regression](../../../tests/ham-005.boundary.spec.ts).

@packageDocumentation
*/

import {GridHelper} from "@engine/core"
import {loadDocumentDefaultFont} from "@engine/core/default-font"
import {
  createBrowserLinkedAuthorStyleSheetHost,
  createDocumentSpaceRuntime,
  type DocumentSpaceRuntime,
  type DocumentSpaceViewPointSnapshot,
} from "@zavx0z/renderer-browser"
import {createDisplayDock, type DisplayDock, type DisplayMode} from "./display-dock.tsx"
import {createMainExperienceDocument} from "./experience-document.ts"

const VISUAL_CANVAS_ID = "visual-canvas"
const VISUAL_DISPLAY_ID = "main"
const VISUAL_DOCK_ID = "main-display-dock"
const VISUAL_THEME_ID = "@internal/visual/theme.css"
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

const canvasElement = globalThis.document.getElementById(VISUAL_CANVAS_ID)
if (!(canvasElement instanceof HTMLCanvasElement)) {
  throw new Error(`Window visual canvas #${VISUAL_CANVAS_ID} is missing`)
}
const canvas: HTMLCanvasElement = canvasElement

const experience = createMainExperienceDocument()
const experienceDocument = experience.document
const packageVersion = import.meta.env.COSMOS_PACKAGE_VERSION
if (typeof packageVersion !== "string" || packageVersion.length === 0) {
  throw new Error("Window visual package version is missing")
}
const surface = experience.surface
surface.id = VISUAL_DISPLAY_ID
surface.title = "Основная поверхность Cosmos"
surface.setAttribute("style", [
  "box-sizing: border-box",
  "width: 100%",
  "height: 100%",
  "background: #020617",
  "border: 1px solid #334155",
].join("; "))

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

const {
  canvasResizeObserver,
  dock,
  documentRuntime,
  grid,
  themeHost,
  themeLink,
} = await initializeVisual()

let visualDisposed = false
const disposeVisual = (): void => {
  if (visualDisposed) return
  visualDisposed = true
  canvasResizeObserver.disconnect()
  dock.dispose()
  documentRuntime.space.remove(grid)
  documentRuntime.dispose()
  themeHost.dispose()
  themeLink.remove()
}

/**
Готовый shared visual runtime после обязательной initial materialization.

`dispose()` освобождает component roots и runtime до linked stylesheet host.
*/
export const runtime = Object.freeze(Object.create(
  Object.getPrototypeOf(documentRuntime),
  {
    ...Object.getOwnPropertyDescriptors(documentRuntime),
    dispose: Object.freeze({
      configurable: false,
      enumerable: true,
      value: disposeVisual,
      writable: false,
    }),
  },
)) as DocumentSpaceRuntime

console.debug("[@internal/visual:main]", "основное visual-окружение создано", {
  space: documentRuntime.space,
  viewPoint: documentRuntime.viewPoint,
  display: documentRuntime.getPlane(VISUAL_DISPLAY_ID)?.plane,
  dock: documentRuntime.getOverlay(VISUAL_DOCK_ID)?.overlay,
})

async function initializeVisual() {
  const themeLink = globalThis.document.createElement("link")
  themeLink.rel = "stylesheet"
  themeLink.href = `/@internal/visual/theme.css?env=main&version=${import.meta.env.COSMOS_PACKAGE_VERSION}`
  globalThis.document.head.append(themeLink)
  let themeHost: ReturnType<typeof createBrowserLinkedAuthorStyleSheetHost> | null = null
  let documentRuntime: DocumentSpaceRuntime | null = null
  let grid: GridHelper | null = null
  let dock: DisplayDock | null = null
  let canvasResizeObserver: ResizeObserver | null = null

  try {
    const linkedThemeHost = createBrowserLinkedAuthorStyleSheetHost({
      canvas,
      document: experienceDocument,
      sources: [{id: VISUAL_THEME_ID, link: themeLink}],
    })
    themeHost = linkedThemeHost
    const [font] = await Promise.all([
      loadDocumentDefaultFont(),
      linkedThemeHost.ready,
    ])
    const createdRuntime = await createDocumentSpaceRuntime({
      canvas,
      document: experienceDocument,
      font,
      styleSheets: [],
      viewPoint: initialViewPoint,
      cameraGestures: true,
    })
    documentRuntime = createdRuntime

    const createdGrid = new GridHelper(2400, 24)
    grid = createdGrid
    createdGrid.name = "SpaceFloorGrid"
    createdGrid.frustumCulled = false
    createdRuntime.space.add(createdGrid)

    const displayViewport = readCanvasViewport(canvas)
    createdRuntime.addPlane({
      id: VISUAL_DISPLAY_ID,
      root: surface,
      viewport: displayViewport,
      worldUnitsPerPixel: displayWorldUnitsPerPixel(displayViewport.height),
      transform: {
        position: VISUAL_DISPLAY_CENTER_MM,
        quaternion: VISUAL_DISPLAY_QUATERNION,
      },
    })

    let displayMode: DisplayMode = "far"
    let farViewPoint = createdRuntime.snapshotViewPoint()
    const mountedDock = createDisplayDock(experienceDocument, () => {
      if (displayMode === "far") {
        farViewPoint = createdRuntime.snapshotViewPoint()
        createdRuntime.restoreViewPoint(focusedViewPoint(farViewPoint))
        createdRuntime.setCameraGesturesEnabled(false)
        displayMode = "near"
      } else {
        createdRuntime.restoreViewPoint(farViewPoint)
        createdRuntime.setCameraGesturesEnabled(true)
        displayMode = "far"
      }
      mountedDock.setMode(displayMode)
    })
    dock = mountedDock
    mountedDock.resize(displayViewport.width)
    experience.mountOverlay(mountedDock.root)
    createdRuntime.addOverlay({
      id: VISUAL_DOCK_ID,
      root: mountedDock.container,
    })

    const resizeObserver = new ResizeObserver(() => {
      const viewport = readCanvasViewport(canvas)
      mountedDock.resize(viewport.width)
      createdRuntime.updatePlane(VISUAL_DISPLAY_ID, {
        viewport,
        worldUnitsPerPixel: displayWorldUnitsPerPixel(viewport.height),
      })
    })
    canvasResizeObserver = resizeObserver
    resizeObserver.observe(canvas)
    createdRuntime.render()
    return Object.freeze({
      canvasResizeObserver: resizeObserver,
      dock: mountedDock,
      documentRuntime: createdRuntime,
      grid: createdGrid,
      themeHost: linkedThemeHost,
      themeLink,
    })
  } catch (error) {
    canvasResizeObserver?.disconnect()
    dock?.dispose()
    if (documentRuntime !== null) {
      if (grid !== null) documentRuntime.space.remove(grid)
      documentRuntime.dispose()
    }
    themeHost?.dispose()
    themeLink.remove()
    throw error
  }
}

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
