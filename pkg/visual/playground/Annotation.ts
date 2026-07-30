import type {StateGraphRootLayout} from "../StateGraphLayout.ts"
import type {StateGraphViewportPose} from "../StateGraphViewport.ts"

export const VISUAL_ANNOTATION_SCHEMA = "metafor/visual-annotation@1" as const

export type VisualAnnotationPoint = Readonly<{
  normalizedX: number
  normalizedY: number
  screenX: number
  screenY: number
  timeMs: number
}>

export type VisualAnnotationStroke = Readonly<{
  camera: StateGraphViewportPose | null
  color: string
  points: readonly VisualAnnotationPoint[]
  width: number
}>

export type VisualAnnotationAtom = Readonly<{
  currentStateId: number | null
  id: number
  label: string
  src: string
}>

export type VisualAnnotationGraph = Readonly<{
  cardIndex: number
  dslPath: string | null
  layout: StateGraphRootLayout
  paths: readonly string[]
  rootStateId: number
  rootStateLabel: string
}>

export type VisualAnnotationSurface = Readonly<{
  canvasId: string
  kind: "playground-page" | "state-graph-card"
  route: string
  slug: string
  title: string
}>

export type VisualAnnotationDraft = Readonly<{
  atom: VisualAnnotationAtom | null
  capturedAt: string
  clientId: string
  graph: VisualAnnotationGraph | null
  pageUrl: string
  schema: typeof VISUAL_ANNOTATION_SCHEMA
  strokes: readonly VisualAnnotationStroke[]
  surface: VisualAnnotationSurface
  viewport: Readonly<{
    camera: StateGraphViewportPose | null
    cssHeight: number
    cssWidth: number
    devicePixelRatio: number
    pixelHeight: number
    pixelWidth: number
  }>
}>

export type StoredVisualAnnotation = VisualAnnotationDraft & Readonly<{
  id: string
  pngBytes: number
  pngUrl: string
}>

const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value)

const isPoint = (value: unknown): value is VisualAnnotationPoint => {
  if (typeof value !== "object" || value === null) return false
  const point = value as Record<string, unknown>
  return finite(point.normalizedX) &&
    finite(point.normalizedY) &&
    point.normalizedX >= 0 &&
    point.normalizedX <= 1 &&
    point.normalizedY >= 0 &&
    point.normalizedY <= 1 &&
    finite(point.screenX) &&
    finite(point.screenY) &&
    finite(point.timeMs)
}

export const parseVisualAnnotationDraft = (
  value: unknown,
): VisualAnnotationDraft | null => {
  if (typeof value !== "object" || value === null) return null
  const draft = value as Record<string, unknown>
  if (
    draft.schema !== VISUAL_ANNOTATION_SCHEMA ||
    typeof draft.clientId !== "string" ||
    draft.clientId.length === 0 ||
    draft.clientId.length > 160 ||
    typeof draft.capturedAt !== "string" ||
    !Number.isFinite(Date.parse(draft.capturedAt)) ||
    typeof draft.pageUrl !== "string" ||
    !Array.isArray(draft.strokes) ||
    draft.strokes.length > 256
  ) return null

  let pointCount = 0
  for (const candidate of draft.strokes) {
    if (typeof candidate !== "object" || candidate === null) return null
    const stroke = candidate as Record<string, unknown>
    if (
      typeof stroke.color !== "string" ||
      !(
        stroke.camera === null ||
        (typeof stroke.camera === "object" && stroke.camera !== null)
      ) ||
      !finite(stroke.width) ||
      stroke.width <= 0 ||
      !Array.isArray(stroke.points) ||
      stroke.points.length === 0
    ) return null
    pointCount += stroke.points.length
    if (pointCount > 100_000 || !stroke.points.every(isPoint)) return null
  }

  const atom = draft.atom
  const graph = draft.graph
  const surface = draft.surface
  const viewport = draft.viewport
  if (
    typeof surface !== "object" ||
    surface === null ||
    typeof viewport !== "object" ||
    viewport === null
  ) return null
  const surfaceRecord = surface as Record<string, unknown>
  const viewportRecord = viewport as Record<string, unknown>
  if (
    !(
      surfaceRecord.kind === "playground-page" ||
      surfaceRecord.kind === "state-graph-card"
    ) ||
    typeof surfaceRecord.canvasId !== "string" ||
    typeof surfaceRecord.route !== "string" ||
    typeof surfaceRecord.slug !== "string" ||
    typeof surfaceRecord.title !== "string" ||
    !finite(viewportRecord.cssWidth) ||
    !finite(viewportRecord.cssHeight) ||
    !Number.isSafeInteger(viewportRecord.pixelWidth) ||
    !Number.isSafeInteger(viewportRecord.pixelHeight) ||
    !finite(viewportRecord.devicePixelRatio) ||
    !(
      viewportRecord.camera === null ||
      (
        typeof viewportRecord.camera === "object" &&
        viewportRecord.camera !== null
      )
    )
  ) return null

  if (surfaceRecord.kind === "playground-page") {
    if (atom !== null || graph !== null) return null
  } else {
    if (
      typeof atom !== "object" ||
      atom === null ||
      typeof graph !== "object" ||
      graph === null
    ) return null
    const atomRecord = atom as Record<string, unknown>
    const graphRecord = graph as Record<string, unknown>
    if (
      !Number.isSafeInteger(atomRecord.id) ||
      typeof atomRecord.label !== "string" ||
      typeof atomRecord.src !== "string" ||
      !(
        atomRecord.currentStateId === null ||
        Number.isSafeInteger(atomRecord.currentStateId)
      ) ||
      !Number.isSafeInteger(graphRecord.cardIndex) ||
      !Number.isSafeInteger(graphRecord.rootStateId) ||
      typeof graphRecord.rootStateLabel !== "string" ||
      !(
        graphRecord.dslPath === null ||
        typeof graphRecord.dslPath === "string"
      ) ||
      !Array.isArray(graphRecord.paths) ||
      typeof graphRecord.layout !== "object" ||
      graphRecord.layout === null
    ) return null
  }

  return structuredClone(value) as VisualAnnotationDraft
}
