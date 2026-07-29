import type {BulkFieldParticle} from "@metafor/types/bulk/manifest"
import {
  BufferGeometry,
  Color,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  Renderer,
  Space,
  SphereGeometry,
  ViewPoint,
} from "@metafor/engine"
import {createQuantumFilmMaterial} from "../QuantumFilm.ts"
import {createPageAnnotationLayer} from "./AnnotationLayer.ts"

export const FIELDS_PSEUDO_SPHERE_MARKER_RADIUS = 1.35

export type PseudoSpherePoint = Readonly<{
  x: number
  y: number
  z: number
}>

export const distributeOnPseudoSphere = (
  count: number,
  radius: number,
): readonly PseudoSpherePoint[] => {
  const safeCount = Math.max(0, Math.floor(count))
  const safeRadius = Math.max(0, radius)
  if (safeCount === 0) return []
  const goldenAngle = Math.PI * (3 - Math.sqrt(5))
  return Array.from({length: safeCount}, (_, index) => {
    const z = 1 - 2 * (index + 0.5) / safeCount
    const planarRadius = Math.sqrt(Math.max(0, 1 - z * z))
    const angle = index * goldenAngle
    return {
      x: Math.cos(angle) * planarRadius * safeRadius,
      y: Math.sin(angle) * planarRadius * safeRadius,
      z: z * safeRadius,
    }
  })
}

export const pseudoSphereRadiusForFieldCount = (count: number): number => {
  const safeCount = Math.max(1, Math.floor(count))
  if (safeCount === 1) return 0
  const unitPoints = distributeOnPseudoSphere(safeCount, 1)
  let minimumChord = Number.POSITIVE_INFINITY
  for (let left = 0; left < unitPoints.length; left += 1) {
    const from = unitPoints[left]!
    for (let right = left + 1; right < unitPoints.length; right += 1) {
      const to = unitPoints[right]!
      minimumChord = Math.min(
        minimumChord,
        Math.hypot(from.x - to.x, from.y - to.y, from.z - to.z),
      )
    }
  }
  return FIELDS_PSEUDO_SPHERE_MARKER_RADIUS * 2 / minimumChord
}

export type FieldsAnalysisLab = Readonly<{
  dispose(): void
  hide(): void
  show(): void
}>

type LabElements = Readonly<{
  canvas: HTMLCanvasElement
  count: HTMLOutputElement
  countControl: HTMLInputElement
  countControlOutput: HTMLOutputElement
  markerRadius: HTMLOutputElement
  distributionRadius: HTMLOutputElement
  types: HTMLOutputElement
}>

const requireElement = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id)
  if (!element) throw new Error(`Fields Analysis element #${id} is missing`)
  return element as T
}

const labElements = (): LabElements => ({
  canvas: requireElement<HTMLCanvasElement>("fields-analysis-canvas"),
  count: requireElement<HTMLOutputElement>("fields-analysis-count"),
  countControl:
    requireElement<HTMLInputElement>("fields-analysis-count-control"),
  countControlOutput:
    requireElement<HTMLOutputElement>("fields-analysis-count-control-output"),
  markerRadius:
    requireElement<HTMLOutputElement>("fields-analysis-marker-radius"),
  distributionRadius:
    requireElement<HTMLOutputElement>("fields-analysis-distribution-radius"),
  types: requireElement<HTMLOutputElement>("fields-analysis-types"),
})

const colorKey = (field: BulkFieldParticle): string =>
  `${field.colorR.toFixed(6)}:${field.colorG.toFixed(6)}:${field.colorB.toFixed(6)}`

export const createFieldsAnalysisLab = async (
  fields: readonly BulkFieldParticle[],
): Promise<FieldsAnalysisLab> => {
  const elements = labElements()
  const renderer = new Renderer()
  await renderer.init(elements.canvas)
  renderer.setPixelRatio(window.devicePixelRatio || 1)
  const space = new Space()
  space.background = new Color(0.006, 0.014, 0.024)
  const maximumCount = Math.max(1, Number(elements.countControl.max))
  const maximumOuterRadius =
    pseudoSphereRadiusForFieldCount(maximumCount) +
    FIELDS_PSEUDO_SPHERE_MARKER_RADIUS
  const viewPoint = new ViewPoint({
    element: elements.canvas,
    fov: Math.PI / 3.4,
    near: 0.01,
    far: 10000,
    position: {
      x: 0,
      y: -maximumOuterRadius * 2.25,
      z: maximumOuterRadius * 0.8,
    },
    target: {x: 0, y: 0, z: 0},
  })
  viewPoint.getUp().set(0, 0, 1)

  const fieldGeometry = new SphereGeometry({
    radius: FIELDS_PSEUDO_SPHERE_MARKER_RADIUS,
    widthSegments: 24,
    heightSegments: 16,
  })
  const materials = new Map<string, ReturnType<typeof createQuantumFilmMaterial>>()
  const materialFor = (
    field: BulkFieldParticle | undefined,
  ): ReturnType<typeof createQuantumFilmMaterial> => {
    const key = field ? colorKey(field) : "fallback"
    const existing = materials.get(key)
    if (existing) return existing
    const material = createQuantumFilmMaterial(
      field
        ? new Color(field.colorR, field.colorG, field.colorB)
        : new Color(0.2, 0.82, 1),
      {
        glowIntensity: 3.1,
        highlightSize: 0,
        opacity: 0.7,
      },
    )
    materials.set(key, material)
    return material
  }

  let guideGeometry: BufferGeometry | null = null
  let active = false
  let disposed = false
  let frame = 0
  const rebuild = (): void => {
    for (const child of [...space.children]) space.remove(child)
    if (guideGeometry) renderer.invalidateGeometry(guideGeometry)
    const count = Math.max(1, Math.floor(Number(elements.countControl.value)))
    const distributionRadius = pseudoSphereRadiusForFieldCount(count)
    guideGeometry = new SphereGeometry({
      radius: distributionRadius,
      widthSegments: 32,
      heightSegments: 20,
    }).toWireframe()
    const guide = new LineSegments(
      guideGeometry,
      new LineBasicMaterial({
        color: new Color(1, 1, 1, 0.12),
        opacity: 1,
      }),
    )
    guide.frustumCulled = false
    space.add(guide)
    const points = distributeOnPseudoSphere(count, distributionRadius)
    for (let index = 0; index < count; index += 1) {
      const field = fields.length === 0
        ? undefined
        : fields[index % fields.length]
      const marker = new Mesh(fieldGeometry, materialFor(field))
      const point = points[index]!
      marker.position.set(point.x, point.y, point.z)
      marker.frustumCulled = false
      marker.updateMatrix()
      space.add(marker)
    }
    elements.count.value = count.toLocaleString("ru-RU")
    elements.countControlOutput.value = count.toLocaleString("ru-RU")
    elements.distributionRadius.value = `${distributionRadius.toFixed(2)} мм`
    elements.markerRadius.value =
      `${FIELDS_PSEUDO_SPHERE_MARKER_RADIUS.toFixed(2)} мм`
    requestRender()
  }

  elements.countControl.value = String(Math.max(1, fields.length))
  elements.types.value = new Set(fields.map((field) => field.fieldParticleKind))
    .size.toLocaleString("ru-RU")

  const annotation = createPageAnnotationLayer({
    sourceCanvas: elements.canvas,
    viewer: elements.canvas.parentElement ??
      (() => {
        throw new Error("Fields Analysis canvas parent is missing")
      })(),
    capturePng: () => renderer.captureLastPresentedFramePng(),
    surface: () => ({
      canvasId: elements.canvas.id,
      kind: "playground-page",
      route: window.location.hash,
      slug: "analysis-fields",
      title: "Fields · поверхность псевдосферы",
    }),
  })

  const resize = (): void => {
    const rect = elements.canvas.getBoundingClientRect()
    if (rect.width < 2 || rect.height < 2) return
    renderer.setSize(Math.floor(rect.width), Math.floor(rect.height))
    viewPoint.setAspectRatio(rect.width / rect.height)
    viewPoint.update()
  }

  const renderOnce = (): void => {
    frame = 0
    if (!active || disposed) return
    space.updateWorldMatrix()
    renderer.render(space, viewPoint)
  }

  const requestRender = (): void => {
    if (!active || disposed || frame !== 0) return
    frame = requestAnimationFrame(renderOnce)
  }

  const observer = new ResizeObserver(() => {
    resize()
    annotation.resize()
    requestRender()
  })
  observer.observe(elements.canvas)
  const requestRenderFromDrag = (event: MouseEvent): void => {
    if (event.buttons !== 0) requestRender()
  }
  const requestRenderFromCamera = (): void => requestRender()
  elements.canvas.addEventListener("mousemove", requestRenderFromDrag)
  elements.canvas.addEventListener("wheel", requestRenderFromCamera)
  elements.canvas.addEventListener("touchmove", requestRenderFromCamera)
  elements.countControl.addEventListener("input", rebuild)
  rebuild()

  return {
    dispose() {
      if (disposed) return
      disposed = true
      active = false
      if (frame !== 0) cancelAnimationFrame(frame)
      observer.disconnect()
      annotation.dispose()
      elements.canvas.removeEventListener("mousemove", requestRenderFromDrag)
      elements.canvas.removeEventListener("wheel", requestRenderFromCamera)
      elements.canvas.removeEventListener("touchmove", requestRenderFromCamera)
      elements.countControl.removeEventListener("input", rebuild)
      if (guideGeometry) renderer.invalidateGeometry(guideGeometry)
      renderer.invalidateGeometry(fieldGeometry)
    },
    hide() {
      active = false
      if (frame !== 0) cancelAnimationFrame(frame)
      frame = 0
      annotation.hide()
    },
    show() {
      active = true
      annotation.show()
      resize()
      requestRender()
    },
  }
}
