import type {BulkRuntimeProjection} from "@bulk/types/projection"
import {buildStateGraph} from "../src/StateGraph.ts"
import {layoutFieldsInPseudoCircle} from "../src/FieldsLayout.ts"
import {
  describeHermiteEdgeCurve,
  type HermiteEdgeCurve,
} from "../src/HermiteEdge.ts"
import {buildStateGraphRootLayout} from "../src/StateGraphLayout.ts"
import {
  resolveContentTorusForm,
  resolveEmptyTorusForm,
  resolveTorusForm,
  type TorusForm,
} from "../src/Torus.ts"
import {createPageAnnotationLayer} from "./AnnotationLayer.ts"
import {
  createStateGraphViewport,
  stateGraphFieldColor,
  type StateGraphContextField,
  type StateGraphContextCurveBatch,
  type StateGraphContextLabel,
  type StateGraphContextOrbit,
  type StateGraphViewport,
  type StateGraphViewportContext,
} from "./StateGraphViewport.ts"
import {
  PHOTON_STORY_PREPARED_PROJECTION,
  PHOTON_STORY_PROVENANCE,
} from "./fixture/PhotonStoryFixture.ts"

export const STATE_GRAPH_PROCESS_SLUG = "state-graph/process" as const

const ATOM_COLOR = [0.18, 0.78, 1] as const
const ORBIT_COLOR = [0.34, 0.52, 0.72] as const
const RESULT_FLOW_COLOR = [1, 0.72, 0.16] as const
const CONTENT_SURFACE_GAP = 2.2

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
  curves: readonly HermiteEdgeCurve[]
  fieldIds: readonly number[]
  fields: readonly StateGraphProcessField[]
  form: TorusForm
  kind: StateGraphProcessHandlerKind
  label: string
  x: number
  y: number
  z: number
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
  atom: Readonly<{
    form: TorusForm
    x: number
    y: number
    z: number
  }>
  atomFields: readonly StateGraphProcessField[]
  context: StateGraphViewportContext
  graph: ReturnType<typeof buildStateGraph>
  handlers: readonly StateGraphProcessHandler[]
  layout: ReturnType<typeof buildStateGraphRootLayout>
  process: Readonly<{
    id: number
    label: string
    ownerNodeId: string
    ownerStateId: number
    ownerStateLabel: string
  }>
  resultCurves: readonly HermiteEdgeCurve[]
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

const describeResultFlowCurve = (
  from: StateGraphProcessField,
  to: StateGraphProcessField,
  fromAngle: number,
  toAngle: number,
  orbitRadius: number,
): HermiteEdgeCurve => {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const dz = to.z - from.z
  const span = Math.hypot(dx, dy, dz)
  if (span <= Number.EPSILON) {
    throw new RangeError("State Graph Process result handlers must be distinct")
  }
  const curve = describeHermiteEdgeCurve({
    from: {
      x: from.x,
      y: from.y,
      z: from.z,
    },
    leftOuterRadius: from.radius,
    rightOuterRadius: to.radius,
    side: -1,
    to: {
      x: to.x,
      y: to.y,
      z: to.z,
    },
  })
  const angularDelta = Math.atan2(
    Math.sin(toAngle - fromAngle),
    Math.cos(toAngle - fromAngle),
  )
  const orbitDirection = angularDelta < 0 ? -1 : 1
  const orbitTangentLength = 4 * orbitRadius * Math.tan(
    Math.abs(angularDelta) / 4,
  )
  const fromDepth = Math.abs(curve.fromTangent.z)
  const toDepth = Math.abs(curve.toTangent.z)
  return Object.freeze({
    ...curve,
    fromTangent: Object.freeze({
      x: -Math.sin(fromAngle) * orbitDirection * orbitTangentLength,
      y: Math.cos(fromAngle) * orbitDirection * orbitTangentLength,
      z: -fromDepth,
    }),
    toTangent: Object.freeze({
      x: -Math.sin(toAngle) * orbitDirection * orbitTangentLength,
      y: Math.cos(toAngle) * orbitDirection * orbitTangentLength,
      z: -toDepth,
    }),
  })
}

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
  const descriptor = process.descriptor as Record<string, unknown>
  const handlerFacts = (["action", "success", "error"] as const).map(
    (kind) => ({kind, fieldIds: handlerFieldIds(descriptor, kind)}),
  )
  if (handlerFacts.some((handler) => handler.fieldIds.length === 0)) {
    throw new Error(
      `State Graph Process ${process.id} requires action, success and error Fields`,
    )
  }
  const atomFieldRadius = ownerNode.fieldRadius
  const atomFieldLayout = layoutFieldsInPseudoCircle(
    graph.fields.length,
    atomFieldRadius,
  )
  const atomForm = resolveContentTorusForm({
    coreExtent: atomFieldLayout.radius,
    emptyOuterRadius: resolveEmptyTorusForm(2).outerRadius,
    gap: atomFieldRadius * 0.75,
  })
  const atomFields = graph.fields.map((field, index): StateGraphProcessField => {
    const point = atomFieldLayout.points[index] ?? {x: 0, y: 0, z: 0}
    return Object.freeze({
      ...field,
      radius: atomFieldRadius,
      x: ownerNode.x + point.x,
      y: ownerNode.y + point.y,
      z: ownerNode.z + point.z,
    })
  })
  const atomFieldById = new Map(atomFields.map((field) => [field.id, field] as const))
  const emptyStateForm = resolveEmptyTorusForm(1)
  const atomX = ownerNode.x
  const atomY = ownerNode.y
  const atomZ = ownerNode.z
  const handlerFieldRadius = Math.max(0.32, ownerNode.fieldRadius * 0.5)
  const handlerInputs = handlerFacts.map((handler) => ({
    ...handler,
    layout: layoutFieldsInPseudoCircle(
      handler.fieldIds.length,
      handlerFieldRadius,
    ),
  }))
  const handlerForm = resolveContentTorusForm({
    coreExtent: Math.max(...handlerInputs.map(({layout}) => layout.radius)),
    emptyOuterRadius: resolveEmptyTorusForm(3).outerRadius,
    gap: handlerFieldRadius * 0.75,
  })
  const handlerOrbitRadius =
    atomForm.outerRadius + CONTENT_SURFACE_GAP + handlerForm.outerRadius
  const stateContentForm = resolveContentTorusForm({
    emptyOuterRadius: emptyStateForm.outerRadius,
    gap: CONTENT_SURFACE_GAP,
    occupiedOuterExtent: handlerOrbitRadius + handlerForm.outerRadius,
  })
  const stateForm = resolveTorusForm(
    atomForm.innerRadius,
    stateContentForm.outerRadius,
  )
  const ownerLabNode = Object.freeze({
    ...ownerNode,
    fields: Object.freeze([]),
    innerRadius: stateForm.innerRadius,
    label: `State ${ownerState.id}`,
    radius: stateForm.outerRadius,
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
  const handlerAngles: Readonly<Record<StateGraphProcessHandlerKind, number>> = {
    action: Math.PI / 2,
    success: Math.PI * 7 / 6,
    error: Math.PI * 11 / 6,
  }
  const handlers = handlerInputs.map(
    ({kind, fieldIds, layout}): StateGraphProcessHandler => {
    const presentation = HANDLER_PRESENTATION[kind]
    const center = pointOnCircle(
      atomX,
      atomY,
      handlerOrbitRadius,
      handlerAngles[kind],
    )
    const fields = Object.freeze(fieldIds.map((id, index) => {
      const field = atomFieldById.get(id)
      if (!field) throw new Error(`State Graph Process handler Field ${id} is absent`)
      const local = layout.points[index] ?? {x: 0, y: 0, z: 0}
      return Object.freeze({
        ...field,
        radius: handlerFieldRadius,
        x: center.x + local.x,
        y: center.y + local.y,
        z: atomZ + local.z,
      })
    }))
    const curves = Object.freeze(fields.map((field) => {
      const atomField = atomFieldById.get(field.id)!
      const reads = kind === "action"
      const from = reads ? atomField : field
      const to = reads ? field : atomField
      return describeHermiteEdgeCurve({
        from,
        leftOuterRadius: from.radius,
        rightOuterRadius: to.radius,
        side: reads ? 1 : -1,
        to,
      })
    }))
    return Object.freeze({
      color: presentation.color,
      curves,
      fieldIds,
      fields,
      form: handlerForm,
      kind,
      label: presentation.label,
      x: center.x,
      y: center.y,
      z: atomZ,
    })
  })
  const contextFields: StateGraphContextField[] = [
    ...atomFields.map((field) => ({
      color: stateGraphFieldColor(field.type),
      radius: field.radius,
      x: field.x,
      y: field.y,
      z: field.z,
    })),
    ...handlers.flatMap((handler) => handler.fields.map((field) => ({
      color: stateGraphFieldColor(field.type),
      radius: field.radius,
      x: field.x,
      y: field.y,
      z: field.z,
    }))),
  ]
  const contextOrbits: StateGraphContextOrbit[] = [{
    color: ORBIT_COLOR,
    opacity: 0.5,
    radius: handlerOrbitRadius,
    segments: 160,
    x: atomX,
    y: atomY,
    z: atomZ - 0.12,
  }]
  const contextCurves: StateGraphContextCurveBatch[] = handlers.map(
    (handler) => ({
      color: handler.color,
      curves: handler.curves,
      opacity: 0.78,
    }),
  )
  const actionHandler = handlers.find(({kind}) => kind === "action")!
  const actionFieldById = new Map(
    actionHandler.fields.map((field) => [field.id, field] as const),
  )
  const resultHandlers = handlers.filter(({kind}) => kind !== "action")
  const resultCurves = Object.freeze(
    resultHandlers
      .flatMap((handler) => handler.fields.map((field) => {
        const actionField = actionFieldById.get(field.id)
        if (!actionField) {
          throw new Error(
            `State Graph Process action has no result Field ${field.id}`,
          )
        }
        return describeResultFlowCurve(
          actionField,
          field,
          handlerAngles.action,
          handlerAngles[handler.kind],
          handlerOrbitRadius,
        )
      })),
  )
  contextCurves.push({
    color: RESULT_FLOW_COLOR,
    curves: resultCurves,
    opacity: 0.92,
    sphere: {
      fromAngle: handlerAngles.action,
      radius: handlerOrbitRadius,
      toAngles: Object.freeze(resultHandlers.flatMap((handler) =>
        handler.fields.map(() => handlerAngles[handler.kind])
      )),
      x: atomX,
      y: atomY,
      z: atomZ,
    },
  })
  const contextLabels: StateGraphContextLabel[] = [
    {
      color: ATOM_COLOR,
      fontSize: 1.25,
      offset: -atomForm.outerRadius - 1.4,
      text: `Atom projection · ${atomFields.length} Fields`,
      x: atomX,
      y: atomY,
      z: atomZ,
    },
    ...handlers.map((handler) => ({
      color: handler.color,
      fontSize: 0.72,
      offset: -handler.form.outerRadius - 0.8,
      text: handler.kind,
      x: handler.x,
      y: handler.y,
      z: handler.z,
    })),
  ]
  const label = typeof process.descriptor.label === "string" &&
      process.descriptor.label.length > 0
    ? process.descriptor.label
    : process.descriptor.key

  return Object.freeze({
    atom: Object.freeze({
      form: atomForm,
      x: atomX,
      y: atomY,
      z: atomZ,
    }),
    atomFields: Object.freeze(atomFields),
    context: Object.freeze({
      curves: Object.freeze(contextCurves),
      fields: Object.freeze(contextFields),
      labels: Object.freeze(contextLabels),
      orbits: Object.freeze(contextOrbits),
      segments: Object.freeze([]),
      tori: Object.freeze([
        {
          color: ATOM_COLOR,
          radius: atomForm.radius,
          tube: atomForm.tube,
          x: atomX,
          y: atomY,
          z: atomZ,
        },
        ...handlers.map((handler) => ({
          color: handler.color,
          radius: handler.form.radius,
          tube: handler.form.tube,
          x: handler.x,
          y: handler.y,
          z: handler.z,
        })),
      ]),
    }),
    graph,
    handlers: Object.freeze(handlers),
    layout,
    process: Object.freeze({
      id: process.id,
      label,
      ownerNodeId: ownerNode.id,
      ownerStateId: ownerState.id,
      ownerStateLabel: ownerState.name,
    }),
    resultCurves,
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
    `State «${stand.process.ownerStateLabel}» содержит центрированную проекцию ` +
    `того же Atom со всеми ${stand.atomFields.length} Fields в его ядре. ` +
    `Process ${stand.process.id} показан тремя самостоятельными Torus: action, ` +
    "success и error. Они равномерно разнесены по внутренней орбите State, " +
    "а ядро каждого содержит используемые им Fields. Action читает Fields " +
    "Atom по верхним дугам; success и error записывают их по нижним дугам. " +
    "Золотые S-дуги передают совпадающие Fields из action в success или error и одновременно огибают Atom по внутренней орбите State."
  const handlers = document.createElement("div")
  handlers.className = "state-process-handlers"
  handlers.append(...stand.handlers.map(handlerCard))
  const note = document.createElement("p")
  note.className = "state-process-note"
  note.textContent =
    "Каждая золотая дуга соединяет Field action с одноимённым Field результата. " +
    "Затем success или error записывает Fields, а их Conditions разрешают Transition."
  detail.append(eyebrow, title, summary, handlers, note)
  card.append(viewer, detail)
  stage.replaceChildren(card)

  const viewport: StateGraphViewport = await createStateGraphViewport({
    canvas,
    context: stand.context,
    ...canvasSize(canvas),
    fitScale: 0.82,
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
