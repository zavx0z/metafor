import type {BulkRuntimeProjection} from "@metafor/types/bulk/runtime"
import {buildStateGraph} from "../src/StateGraph.ts"
import {layoutFieldsInPseudoCircle} from "../src/FieldsLayout.ts"
import {buildStateGraphRootLayout} from "../src/StateGraphLayout.ts"
import {resolveContentTorusForm, type TorusForm} from "../src/Torus.ts"
import {createPageAnnotationLayer} from "./AnnotationLayer.ts"
import {
  createStateGraphViewport,
  stateGraphFieldColor,
  type StateGraphContextField,
  type StateGraphContextLabel,
  type StateGraphContextSegment,
  type StateGraphViewport,
  type StateGraphViewportContext,
} from "./StateGraphViewport.ts"
import {
  PHOTON_STORY_PREPARED_PROJECTION,
  PHOTON_STORY_PROVENANCE,
} from "./fixture/PhotonStoryFixture.ts"

export const STATE_GRAPH_PROCESS_SLUG = "state-graph/process" as const

const PROCESS_COLOR = [0.72, 0.28, 1] as const
const OWNER_COLOR = [0.72, 0.58, 1] as const
const PROCESS_SURFACE_GAP = 2.2

export type StateGraphProcessHandlerKind = "action" | "success" | "error"

const HANDLER_PRESENTATION = Object.freeze({
  action: Object.freeze({
    color: [0.12, 0.84, 1] as const,
    label: "action · read",
  }),
  success: Object.freeze({
    color: [0.16, 1, 0.52] as const,
    label: "success · write",
  }),
  error: Object.freeze({
    color: [1, 0.35, 0.16] as const,
    label: "error · write",
  }),
})

export type StateGraphProcessHandler = Readonly<{
  color: readonly [number, number, number]
  fieldIds: readonly number[]
  fields: readonly StateGraphProcessField[]
  kind: StateGraphProcessHandlerKind
  label: string
}>

export type StateGraphProcessField = Readonly<{
  id: number
  key: string
  label: string
  type: "string" | "number" | "boolean" | "array" | "enum"
  radius: number
  x: number
  y: number
  z: number
}>

export type StateGraphProcessStand = Readonly<{
  context: StateGraphViewportContext
  graph: ReturnType<typeof buildStateGraph>
  handlers: readonly StateGraphProcessHandler[]
  layout: ReturnType<typeof buildStateGraphRootLayout>
  process: Readonly<{
    form: TorusForm
    id: number
    label: string
    ownerNodeId: string
    ownerStateId: number
    ownerStateLabel: string
    x: number
    y: number
    z: number
  }>
  processFields: readonly StateGraphProcessField[]
}>

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const fieldIds = (value: unknown): readonly number[] => {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) =>
    Array.isArray(entry) &&
      Number.isSafeInteger(entry[0]) &&
      typeof entry[1] === "string"
      ? [Number(entry[0])]
      : []
  )
}

const handlerFieldIds = (
  descriptor: Record<string, unknown>,
  kind: StateGraphProcessHandlerKind,
): readonly number[] => {
  const handler = descriptor[kind]
  if (!isRecord(handler)) return []
  const access = kind === "action" ? handler.readFields : handler.writeFields
  return [...new Set(fieldIds(access))]
}

const pointOnCircle = (
  x: number,
  y: number,
  radius: number,
  angle: number,
): Readonly<{x: number; y: number; z: number}> => ({
  x: x + Math.cos(angle) * radius,
  y: y + Math.sin(angle) * radius,
  z: 0,
})

export const buildStateGraphProcessStand = (
  projection: BulkRuntimeProjection =
    PHOTON_STORY_PREPARED_PROJECTION.runtime,
  atomId: number = PHOTON_STORY_PROVENANCE.targetAtomId,
): StateGraphProcessStand => {
  const graph = buildStateGraph(projection, atomId)
  const process = projection.processes.find((candidate) =>
    candidate.wimp === graph.src && candidate.descriptor.type === "action"
  )
  if (!process) {
    throw new Error(`State Graph Process stand has no action Process for ${graph.src}`)
  }
  const ownerState = graph.states.find((state) => state.name === process.state)
  if (!ownerState) {
    throw new Error(
      `State Graph Process ${process.id} has no owner State ${process.state}`,
    )
  }
  const graphLayout = buildStateGraphRootLayout(graph, ownerState.id)
  const ownerNode = graphLayout.nodes.find((node) =>
    node.stateId === ownerState.id && node.step === 0
  )
  if (!ownerNode) {
    throw new Error(`State Graph Process ${process.id} owner node is absent`)
  }
  const ownerLabNode = Object.freeze({
    ...ownerNode,
    label: `State ${ownerState.id}`,
  })
  const layout = Object.freeze({
    edges: Object.freeze([]),
    levels: Object.freeze([{
      nodeIds: Object.freeze([ownerLabNode.id]),
      step: 0,
      x: ownerLabNode.x,
    }]),
    nodes: Object.freeze([ownerLabNode]),
    rootStateId: ownerState.id,
  })
  const descriptor = process.descriptor as Record<string, unknown>
  const handlerFacts = (["action", "success", "error"] as const).map(
    (kind) => ({kind, fieldIds: handlerFieldIds(descriptor, kind)}),
  )
  if (handlerFacts.some((handler) => handler.fieldIds.length === 0)) {
    throw new Error(
      `State Graph Process ${process.id} requires action, success and error Fields`,
    )
  }
  const uniqueFieldIds = [...new Set(handlerFacts.flatMap((handler) =>
    handler.fieldIds
  ))].sort((left, right) => left - right)
  const fieldById = new Map(graph.fields.map((field) => [field.id, field] as const))
  const processFieldRadius = Math.max(0.55, ownerNode.fieldRadius * 0.92)
  const fieldLayout = layoutFieldsInPseudoCircle(
    uniqueFieldIds.length,
    processFieldRadius,
  )
  const form = resolveContentTorusForm({
    coreExtent: fieldLayout.radius,
    emptyOuterRadius: ownerNode.radius * 0.92,
    gap: processFieldRadius * 0.75,
  })
  const processX =
    ownerNode.x - ownerNode.radius - PROCESS_SURFACE_GAP - form.outerRadius
  const processY = ownerNode.y
  const processZ = ownerNode.z
  const processFields = uniqueFieldIds.map((id, index): StateGraphProcessField => {
    const field = fieldById.get(id)
    if (!field) {
      throw new Error(`State Graph Process ${process.id} Field ${id} is absent`)
    }
    const point = fieldLayout.points[index] ?? {x: 0, y: 0, z: 0}
    return Object.freeze({
      ...field,
      radius: processFieldRadius,
      x: processX + point.x,
      y: processY + point.y,
      z: processZ + point.z,
    })
  })
  const processFieldById = new Map(processFields.map((field) =>
    [field.id, field] as const
  ))
  const handlers = handlerFacts.map(({kind, fieldIds}): StateGraphProcessHandler => {
    const presentation = HANDLER_PRESENTATION[kind]
    return Object.freeze({
      color: presentation.color,
      fieldIds,
      fields: fieldIds.map((id) => {
        const field = processFieldById.get(id)
        if (!field) throw new Error(`State Graph Process handler Field ${id} is absent`)
        return field
      }),
      kind,
      label: presentation.label,
    })
  })
  const handlerAngles: Readonly<Record<StateGraphProcessHandlerKind, number>> = {
    action: Math.PI,
    success: Math.PI * 1.5,
    error: 0,
  }
  const handlerAnchors = new Map(handlers.map((handler) => [
    handler.kind,
    pointOnCircle(
      processX,
      processY,
      form.radius,
      handlerAngles[handler.kind],
    ),
  ] as const))
  const contextFields: StateGraphContextField[] = [
    ...processFields.map((field) => ({
      color: stateGraphFieldColor(field.type),
      radius: field.radius,
      x: field.x,
      y: field.y,
      z: field.z,
    })),
    ...handlers.map((handler) => {
      const anchor = handlerAnchors.get(handler.kind)!
      return {
        color: handler.color,
        radius: processFieldRadius * 0.42,
        ...anchor,
      }
    }),
  ]
  const contextSegments: StateGraphContextSegment[] = [
    {
      color: OWNER_COLOR,
      from: {
        x: ownerNode.x - ownerNode.radius,
        y: ownerNode.y,
        z: ownerNode.z,
      },
      opacity: 0.62,
      to: {
        x: processX + form.outerRadius,
        y: processY,
        z: processZ,
      },
    },
    ...handlers.flatMap((handler) => {
      const anchor = handlerAnchors.get(handler.kind)!
      return handler.fields.map((field) => ({
        color: handler.color,
        from: anchor,
        opacity: 0.78,
        to: {x: field.x, y: field.y, z: field.z},
      }))
    }),
  ]
  const contextLabels: StateGraphContextLabel[] = [
    {
      color: PROCESS_COLOR,
      fontSize: 1.05,
      offset: -form.outerRadius - 1.4,
      text: `Process ${process.id}`,
      x: processX,
      y: processY,
      z: processZ,
    },
    ...handlers.map((handler) => ({
      color: handler.color,
      fontSize: 0.72,
      offset: 0.75,
      text: handler.kind,
      ...handlerAnchors.get(handler.kind)!,
    })),
  ]
  const label = typeof process.descriptor.label === "string" &&
      process.descriptor.label.length > 0
    ? process.descriptor.label
    : process.descriptor.key

  return Object.freeze({
    context: Object.freeze({
      fields: Object.freeze(contextFields),
      labels: Object.freeze(contextLabels),
      segments: Object.freeze(contextSegments),
      tori: Object.freeze([{
        color: PROCESS_COLOR,
        radius: form.radius,
        tube: form.tube,
        x: processX,
        y: processY,
        z: processZ,
      }]),
    }),
    graph,
    handlers: Object.freeze(handlers),
    layout,
    process: Object.freeze({
      form,
      id: process.id,
      label,
      ownerNodeId: ownerNode.id,
      ownerStateId: ownerState.id,
      ownerStateLabel: ownerState.name,
      x: processX,
      y: processY,
      z: processZ,
    }),
    processFields: Object.freeze(processFields),
  })
}

export type StateGraphProcessLab = Readonly<{
  dispose(): void
  hide(): void
  show(): void
  stand: StateGraphProcessStand
}>

const canvasSize = (canvas: HTMLCanvasElement): {width: number; height: number} => {
  const rect = canvas.getBoundingClientRect()
  return {
    width: Math.max(1, Math.floor(rect.width)),
    height: Math.max(1, Math.floor(rect.height)),
  }
}

const handlerCard = (handler: StateGraphProcessHandler): HTMLElement => {
  const card = document.createElement("section")
  card.className = `state-process-handler ${handler.kind}`
  const heading = document.createElement("h3")
  heading.textContent = handler.label
  const fields = document.createElement("ul")
  for (const field of handler.fields) {
    const item = document.createElement("li")
    item.textContent = `${field.label} · Field ${field.id}`
    fields.append(item)
  }
  card.append(heading, fields)
  return card
}

export const createStateGraphProcessLab = async (
  stage: HTMLElement,
): Promise<StateGraphProcessLab> => {
  const stand = buildStateGraphProcessStand()
  const card = document.createElement("article")
  card.className = "state-process-card"
  const viewer = document.createElement("section")
  viewer.className = "state-process-viewer"
  const canvas = document.createElement("canvas")
  canvas.id = "state-graph-process-canvas"
  const hint = document.createElement("span")
  hint.className = "state-process-hint"
  hint.textContent = "drag — вращение · wheel — масштаб"
  viewer.append(canvas, hint)

  const detail = document.createElement("section")
  detail.className = "state-process-detail"
  const eyebrow = document.createElement("span")
  eyebrow.className = "state-process-experiment"
  eyebrow.textContent = "эксперимент раскладки"
  const title = document.createElement("h2")
  title.textContent = stand.process.label
  const summary = document.createElement("p")
  summary.textContent =
    `Process ${stand.process.id} принадлежит State «${stand.process.ownerStateLabel}», ` +
    "но его Torus расположен снаружи поверхности State. Тонкая фиолетовая связь " +
    "показывает владение; цветные связи показывают точный доступ обработчиков к Fields."
  const handlers = document.createElement("div")
  handlers.className = "state-process-handlers"
  handlers.append(...stand.handlers.map(handlerCard))
  const note = document.createElement("p")
  note.className = "state-process-note"
  note.textContent =
    "success и error не являются переходами State: они записывают Fields, а уже Conditions этих Fields разрешают соответствующие Transition."
  detail.append(eyebrow, title, summary, handlers, note)
  card.append(viewer, detail)
  stage.replaceChildren(card)

  const viewport: StateGraphViewport = await createStateGraphViewport({
    canvas,
    context: stand.context,
    ...canvasSize(canvas),
    fitScale: 0.64,
    layout: stand.layout,
    showGuides: false,
    showLabels: true,
  })
  const annotation = createPageAnnotationLayer({
    sourceCanvas: canvas,
    viewer,
    capturePng: () => viewport.capturePng(),
    surface: () => ({
      canvasId: canvas.id,
      kind: "playground-page",
      route: window.location.hash,
      slug: STATE_GRAPH_PROCESS_SLUG,
      title: "State Graph · Процесс снаружи State",
    }),
  })
  annotation.hide()
  const resize = (): void => {
    const next = canvasSize(canvas)
    viewport.setSize(next.width, next.height)
    annotation.resize()
  }
  const observer = new ResizeObserver(resize)
  observer.observe(canvas)
  let disposed = false

  return {
    dispose(): void {
      if (disposed) return
      disposed = true
      observer.disconnect()
      annotation.dispose()
      viewport.dispose()
      stage.replaceChildren()
    },
    hide(): void {
      if (disposed) return
      annotation.hide()
    },
    show(): void {
      if (disposed) return
      resize()
      annotation.show()
    },
    stand,
  }
}
