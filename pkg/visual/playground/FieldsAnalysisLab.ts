import type {BulkFieldParticle} from "@metafor/types/bulk/manifest"
import {
  BufferAttribute,
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
import {
  distributeOnPseudoSphere,
  layoutFieldsInPseudoCircle as resolvePseudoCircleLayout,
  pseudoSphereRadiusForFieldCount as resolvePseudoSphereRadius,
  type PseudoCircleLayout,
  type PseudoSpherePoint,
} from "../src/FieldsLayout.ts"
import {createQuantumSphereMaterial} from "./QuantumFilm.ts"
import {visualFieldParticleColor} from "../src/SemanticVisual.ts"
import {createPageAnnotationLayer} from "./AnnotationLayer.ts"

export const FIELDS_PSEUDO_SPHERE_MARKER_RADIUS = 1.35

export {distributeOnPseudoSphere, type PseudoSpherePoint}

export type FieldsAnalysisMode = "circle" | "sphere"

export const pseudoSphereRadiusForFieldCount = (count: number): number => {
  return resolvePseudoSphereRadius(
    count,
    FIELDS_PSEUDO_SPHERE_MARKER_RADIUS,
  )
}

export const layoutFieldsInPseudoCircle = (
  count: number,
): PseudoCircleLayout => resolvePseudoCircleLayout(
  Number.isFinite(count) ? Math.max(1, Math.floor(count)) : 1,
  FIELDS_PSEUDO_SPHERE_MARKER_RADIUS,
)

export type FieldsAnalysisLab = Readonly<{
  dispose(): void
  hide(): void
  show(mode: FieldsAnalysisMode): void
}>

type LabElements = Readonly<{
  canvas: HTMLCanvasElement
  count: HTMLOutputElement
  countControl: HTMLInputElement
  countControlOutput: HTMLOutputElement
  description: HTMLParagraphElement
  distributionLabel: HTMLSpanElement
  markerRadius: HTMLOutputElement
  distributionRadius: HTMLOutputElement
  title: HTMLHeadingElement
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
  description:
    requireElement<HTMLParagraphElement>("fields-analysis-description"),
  distributionLabel:
    requireElement<HTMLSpanElement>("fields-analysis-distribution-label"),
  markerRadius:
    requireElement<HTMLOutputElement>("fields-analysis-marker-radius"),
  distributionRadius:
    requireElement<HTMLOutputElement>("fields-analysis-distribution-radius"),
  title: requireElement<HTMLHeadingElement>("fields-analysis-title"),
  types: requireElement<HTMLOutputElement>("fields-analysis-types"),
})

const colorKey = (field: BulkFieldParticle): string =>
  visualFieldParticleColor(field).map((value) => value.toFixed(6)).join(":")

const circleGuideGeometry = (
  radius: number,
  segments = 128,
): BufferGeometry => {
  const positions = new Float32Array(segments * 6)
  let offset = 0
  for (let index = 0; index < segments; index += 1) {
    const from = index / segments * Math.PI * 2
    const to = (index + 1) / segments * Math.PI * 2
    positions[offset++] = Math.cos(from) * radius
    positions[offset++] = Math.sin(from) * radius
    positions[offset++] = 0
    positions[offset++] = Math.cos(to) * radius
    positions[offset++] = Math.sin(to) * radius
    positions[offset++] = 0
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute("position", new BufferAttribute(positions, 3))
  return geometry
}

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
  const maximumSphereOuterRadius =
    pseudoSphereRadiusForFieldCount(maximumCount) +
    FIELDS_PSEUDO_SPHERE_MARKER_RADIUS
  const maximumCircleOuterRadius =
    layoutFieldsInPseudoCircle(maximumCount).radius
  const viewPoint = new ViewPoint({
    element: elements.canvas,
    fov: Math.PI / 3.4,
    near: 0.01,
    far: 10000,
    position: {
      x: 0,
      y: -maximumSphereOuterRadius * 2.25,
      z: maximumSphereOuterRadius * 0.8,
    },
    target: {x: 0, y: 0, z: 0},
  })
  viewPoint.getUp().set(0, 0, 1)

  const fieldGeometry = new SphereGeometry({
    radius: FIELDS_PSEUDO_SPHERE_MARKER_RADIUS,
    widthSegments: 24,
    heightSegments: 16,
  })
  const materials = new Map<
    string,
    ReturnType<typeof createQuantumSphereMaterial>
  >()
  const materialFor = (
    field: BulkFieldParticle | undefined,
  ): ReturnType<typeof createQuantumSphereMaterial> => {
    const key = field ? colorKey(field) : "fallback"
    const existing = materials.get(key)
    if (existing) return existing
    const material = createQuantumSphereMaterial(
      field
        ? new Color(...visualFieldParticleColor(field))
        : new Color(0.2, 0.82, 1),
      {
        glowIntensity: 3.1,
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
  let mode: FieldsAnalysisMode = "sphere"
  const resetView = (): void => {
    viewPoint.getTarget().set(0, 0, 0)
    if (mode === "circle") {
      viewPoint.position.set(0, 0, maximumCircleOuterRadius * 2.25)
      viewPoint.getUp().set(0, 1, 0)
    } else {
      viewPoint.position.set(
        0,
        -maximumSphereOuterRadius * 2.25,
        maximumSphereOuterRadius * 0.8,
      )
      viewPoint.getUp().set(0, 0, 1)
    }
    viewPoint.update()
  }
  const syncPresentation = (): void => {
    const circle = mode === "circle"
    elements.title.textContent = circle
      ? "Fields · псевдокруг"
      : "Fields · псевдосфера"
    elements.description.textContent = circle
      ? "Fields заполняют всю площадь плоского круга гексагональной плотной упаковкой. Ближайшие сферы касаются без пересечений."
      : "Центры Field равномерно распределены по поверхности Фибоначчиевой псевдосферы. Выбирается минимальный радиус без пересечений."
    elements.distributionLabel.textContent = circle
      ? "Радиус внешнего круга"
      : "Радиус псевдосферы"
  }
  const rebuild = (): void => {
    for (const child of [...space.children]) space.remove(child)
    if (guideGeometry) renderer.invalidateGeometry(guideGeometry)
    const count = Math.max(1, Math.floor(Number(elements.countControl.value)))
    const circleLayout = mode === "circle"
      ? layoutFieldsInPseudoCircle(count)
      : null
    const distributionRadius = mode === "circle"
      ? circleLayout!.radius
      : pseudoSphereRadiusForFieldCount(count)
    guideGeometry = mode === "circle"
      ? circleGuideGeometry(distributionRadius)
      : new SphereGeometry({
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
    const points = mode === "circle"
      ? circleLayout!.points
      : distributeOnPseudoSphere(count, distributionRadius)
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
      slug: mode === "circle" ? "analysis-fields-circle" : "analysis-fields",
      title: mode === "circle"
        ? "Fields · площадь плоского псевдокруга"
        : "Fields · поверхность псевдосферы",
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
    show(nextMode) {
      const changed = mode !== nextMode
      mode = nextMode
      active = true
      annotation.show()
      syncPresentation()
      if (changed) {
        resetView()
        rebuild()
      }
      resize()
      requestRender()
    },
  }
}
