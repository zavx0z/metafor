import {
  Color,
  Mesh,
  Renderer,
  Space,
  TorusGeometry,
  ViewPoint,
} from "@engine/core"
import {createPageAnnotationLayer} from "./AnnotationLayer.ts"
import type {FieldsV2Source} from "./FieldsV2Lab.ts"
import {createQuantumFilmMaterial} from "./QuantumFilm.ts"

export const FIELDS_V3_SLUG = "analysis-fields-v3"

export type FieldsV3Lab = Readonly<{
  dispose(): void
  hide(): void
  show(): void
}>

const canvasSize = (
  canvas: HTMLCanvasElement,
): Readonly<{height: number; width: number}> => {
  const rect = canvas.getBoundingClientRect()
  return {
    height: Math.max(1, Math.floor(rect.height)),
    width: Math.max(1, Math.floor(rect.width)),
  }
}

export const createFieldsV3Lab = async (
  stage: HTMLElement,
  source: FieldsV2Source,
): Promise<FieldsV3Lab> => {
  const canvas = document.createElement("canvas")
  canvas.id = "fields-v3-canvas"
  canvas.setAttribute(
    "aria-label",
    "Стандартный корневой Torus lada из snapshot, вид сверху",
  )
  const card = document.createElement("section")
  card.className = "fields-v3-card"
  const title = document.createElement("h2")
  title.textContent = "Fields v3 · lada"
  const description = document.createElement("p")
  description.textContent =
    "Стандартный корневой Torus из snapshot · вид сверху · без Fields."
  card.append(title, description)
  stage.replaceChildren(canvas, card)

  const renderer = new Renderer()
  await renderer.init(canvas)
  renderer.setPixelRatio(window.devicePixelRatio || 1)
  const space = new Space()
  space.background = new Color(0.006, 0.014, 0.024)
  const geometry = new TorusGeometry({
    radius: source.root.torusRadius,
    tube: source.root.torusTube,
    radialSegments: source.meshDetail.radialSegments,
    tubularSegments: source.meshDetail.tubularSegments,
  })
  const torus = new Mesh(
    geometry,
    createQuantumFilmMaterial(new Color(...source.material.color), {
      glowIntensity: source.material.glowIntensity,
      highlightSize: source.material.highlightSize,
      opacity: source.material.opacity,
    }),
  )
  torus.position.set(
    source.root.localX,
    source.root.localY,
    source.root.localZ,
  )
  torus.frustumCulled = false
  torus.updateMatrix()
  space.add(torus)

  const outerRadius = source.root.torusRadius + source.root.torusTube
  const topViewDistance = (): number => {
    const size = canvasSize(canvas)
    const aspect = size.width / size.height
    return outerRadius * 2.35 / Math.min(1, aspect)
  }
  const viewPoint = new ViewPoint({
    element: canvas,
    fov: Math.PI / 3.4,
    near: 1,
    far: 10000,
    position: {x: 0, y: 0, z: topViewDistance()},
    target: {x: 0, y: 0, z: 0},
  })
  const resetTopView = (): void => {
    viewPoint.position.set(0, 0, topViewDistance())
    viewPoint.getTarget().set(0, 0, 0)
    viewPoint.getUp().set(0, 1, 0)
    viewPoint.update()
  }
  resetTopView()

  let active = false
  let disposed = false
  let frame = 0
  let warmupFrames = 0
  const annotation = createPageAnnotationLayer({
    sourceCanvas: canvas,
    viewer: stage,
    capturePng: () => renderer.captureLastPresentedFramePng(),
    surface: () => ({
      canvasId: canvas.id,
      kind: "playground-page",
      route: window.location.hash,
      slug: FIELDS_V3_SLUG,
      title: "Fields v3 · lada · root Torus",
    }),
  })

  const resize = (): void => {
    const next = canvasSize(canvas)
    if (next.width < 2 || next.height < 2) return
    renderer.setSize(next.width, next.height)
    viewPoint.setAspectRatio(next.width / next.height)
    viewPoint.update()
  }
  const requestRender = (): void => {
    if (!active || disposed || frame !== 0) return
    frame = requestAnimationFrame(renderOnce)
  }
  const renderOnce = (): void => {
    frame = 0
    if (!active || disposed) return
    space.updateWorldMatrix()
    renderer.renderFrame(space, viewPoint)
    if (warmupFrames > 0) {
      warmupFrames -= 1
      requestRender()
    }
  }
  const observer = new ResizeObserver(() => {
    resize()
    annotation.resize()
    requestRender()
  })
  observer.observe(canvas)
  const requestRenderFromDrag = (event: MouseEvent): void => {
    if (event.buttons !== 0) requestRender()
  }
  const requestRenderFromCamera = (): void => requestRender()
  canvas.addEventListener("mousemove", requestRenderFromDrag)
  canvas.addEventListener("wheel", requestRenderFromCamera)
  canvas.addEventListener("touchmove", requestRenderFromCamera)

  return {
    dispose(): void {
      if (disposed) return
      disposed = true
      active = false
      if (frame !== 0) cancelAnimationFrame(frame)
      observer.disconnect()
      annotation.dispose()
      canvas.removeEventListener("mousemove", requestRenderFromDrag)
      canvas.removeEventListener("wheel", requestRenderFromCamera)
      canvas.removeEventListener("touchmove", requestRenderFromCamera)
      viewPoint.dispose()
      renderer.invalidateGeometry(geometry)
      stage.replaceChildren()
    },
    hide(): void {
      active = false
      if (frame !== 0) cancelAnimationFrame(frame)
      frame = 0
      warmupFrames = 0
      annotation.hide()
    },
    show(): void {
      active = true
      warmupFrames = 1
      annotation.show()
      resize()
      resetTopView()
      requestRender()
    },
  }
}
