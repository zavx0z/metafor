import {layoutFixed, type FixedLayoutGraph} from "@nodes/layout/fixed"
import type {LayoutResult} from "@nodes/layout/types"
import type {FieldDefinition} from "@ui/components"
import {
  type Link as RuntimeLink,
  type NodeTree,
  type NodeTreeGenerationNode,
  type NodeTreeGenerationParameter,
  type NodeTreeGenerationView,
  type NodeTreeSnapshot,
  type Frame as RuntimeFrame,
  type Socket as RuntimeSocket,
} from "@nodes/core/node-tree"
import {Parameter, type NodeJsonObject, type NodeJsonValue} from "@nodes/core/parameter"
import type {NodeTreeProjector} from "@nodes/core/projection-types"
import {
  DEFAULT_NODE_CANVAS_OVERLAY_STATE,
  type NodeCanvasOverlayState,
  type NodeEditorProjection,
  type NodePoint,
  type NodeRect,
  type PositionedFrame,
  type PositionedLink,
  type PositionedNode,
  type PositionedNodeTree,
  type PositionedSocket,
} from "./node-editor.ts"
import {
  measureBlenderNode,
  planBlenderNode,
  type BlenderFrame,
  type BlenderLink,
  type BlenderNode,
  type BlenderNodeMeasurement,
  type BlenderNodePlan,
  type BlenderSocket,
  type BlenderSocketKind,
} from "./blender-node.ts"
import type {Parameter as UiParameter} from "./parameter.ts"

export type BlenderParameterPresentation = NodeJsonObject & Readonly<{
  label: string
  field: NodeJsonObject
  description?: string
  /** Include the current value in intrinsic measurement identity when its shape changes geometry. */
  geometrySensitiveValue?: boolean
}>

export type BlenderFrameMetadata = NodeJsonObject & Readonly<{
  label: string
  color?: NodeJsonValue
  labelSize?: number
}>

export type BlenderNodeMetadata = NodeJsonObject & Readonly<{
  title: string
  label?: string
  category?: string
  headerColor?: NodeJsonValue
  collapsed?: boolean
}>

export type BlenderSocketMetadata = NodeJsonObject & Readonly<{
  label: string
  socketType: BlenderSocketKind
  shape?: BlenderSocket["shape"]
  description?: string
  hideValue?: boolean
}>

export type BlenderLinkMetadata = NodeJsonObject & Readonly<{
  label?: string
  socketType?: BlenderSocketKind
}>

export type BlenderRuntimeParameter = Parameter<NodeJsonValue, BlenderParameterPresentation>
export type BlenderRuntimeTree = NodeTree<
  BlenderRuntimeParameter,
  BlenderFrameMetadata,
  BlenderNodeMetadata,
  BlenderSocketMetadata,
  BlenderLinkMetadata
>
export type BlenderRuntimeGeneration = NodeTreeGenerationView<
  BlenderRuntimeParameter,
  BlenderFrameMetadata,
  BlenderNodeMetadata,
  BlenderSocketMetadata,
  BlenderLinkMetadata
>

export type BlenderProjectionContext = Readonly<{
  viewport: Readonly<{width: number; height: number}>
  overlayState?: NodeCanvasOverlayState
  spacing?: number
}>

export type BlenderProjectionDiagnostics = Readonly<{
  measurements: number
  reusedMeasurements: number
  layouts: number
  reusedLayouts: number
  plans: number
  reusedPlans: number
}>

type MeasurementEntry = Readonly<{
  key: string
  measurement: BlenderNodeMeasurement
}>

type PlanEntry = Readonly<{
  key: string
  plan: BlenderNodePlan
}>

type ProjectionCache = Readonly<{
  measurements: ReadonlyMap<string, MeasurementEntry>
  localPlans: ReadonlyMap<string, PlanEntry>
  positionedPlans: ReadonlyMap<string, PlanEntry>
  layoutKey: string
  layout: LayoutResult
}>

export type BlenderNodeTreeProjection = NodeEditorProjection<
  BlenderNode,
  BlenderSocket,
  BlenderLink,
  BlenderFrame,
  BlenderNodePlan
> & Readonly<{
  revision: number
  topologyRevision: number
  diagnostics: BlenderProjectionDiagnostics
  snapshot: NodeTreeSnapshot<
    BlenderRuntimeParameter,
    BlenderFrameMetadata,
    BlenderNodeMetadata,
    BlenderSocketMetadata,
    BlenderLinkMetadata
  >
  /** @internal Reuse evidence for the next projection of the same view. */
  cache: ProjectionCache
}>

type RuntimeNodeEntry = NodeTreeGenerationNode<
  BlenderRuntimeParameter,
  BlenderNodeMetadata,
  BlenderSocketMetadata
>
type RuntimeParameterEntry = NodeTreeGenerationParameter<BlenderRuntimeParameter>

/** Creates the fixed-policy Blender projection used by the parent runtime. */
export function createBlenderNodeTreeProjector(): NodeTreeProjector<
  BlenderRuntimeGeneration,
  ReturnType<BlenderRuntimeTree["snapshot"]>,
  BlenderProjectionContext,
  BlenderNodeTreeProjection
> {
  return Object.freeze({
    project: ({tree, snapshot, context, previous}) => projectBlenderNodeTree(
      tree,
      snapshot,
      context,
      previous?.projection,
    ),
  })
}

function projectBlenderNodeTree(
  tree: BlenderRuntimeGeneration,
  snapshot: ReturnType<BlenderRuntimeTree["snapshot"]>,
  context: BlenderProjectionContext,
  previous: BlenderNodeTreeProjection | undefined,
): BlenderNodeTreeProjection {
  const viewport = normalizeViewport(context.viewport)
  const overlayState = context.overlayState ?? DEFAULT_NODE_CANVAS_OVERLAY_STATE
  const connectedByNode = connectedSocketIdsByNode(tree.links)
  const resolvedSides = fixedSocketSides(tree)
  const viewNodes = new Map(tree.nodes.map((node) => [node.id, blenderNode(node, resolvedSides)]))
  const measurementEntries = new Map<string, MeasurementEntry>()
  const localPlanEntries = new Map<string, PlanEntry>()
  const localPlans = new Map<string, BlenderNodePlan>()
  let measurements = previous?.diagnostics.measurements ?? 0
  let reusedMeasurements = previous?.diagnostics.reusedMeasurements ?? 0
  let plans = previous?.diagnostics.plans ?? 0
  let reusedPlans = previous?.diagnostics.reusedPlans ?? 0

  for (const node of tree.nodes) {
    const view = required(viewNodes.get(node.id), `Missing Blender Node: ${node.id}`)
    const connected = connectedByNode.get(node.id) ?? EMPTY_IDS
    const key = measurementKey(node, connected)
    const previousMeasurement = previous?.cache.measurements.get(node.id)
    const measurement = previousMeasurement?.key === key
      ? previousMeasurement.measurement
      : measureBlenderNode(view, connected)
    if (previousMeasurement?.key === key) reusedMeasurements += 1
    else measurements += 1
    measurementEntries.set(node.id, Object.freeze({key, measurement}))
    const planKey = JSON.stringify({
      measurement: key,
      parameters: (node.parameters ?? []).map(({id, revision}) => ({id, revision})),
      overlayState,
    })
    const previousPlan = previous?.cache.localPlans.get(node.id)
    const plan = previousPlan?.key === planKey
      ? previousPlan.plan
      : planBlenderNode(
          view,
          {x: 0, y: 0, w: measurement.width, h: measurement.height},
          connected,
          overlayState,
          measurement,
        )
    if (previousPlan?.key === planKey) reusedPlans += 1
    else plans += 1
    localPlanEntries.set(node.id, Object.freeze({key: planKey, plan}))
    localPlans.set(node.id, plan)
  }

  const graph = layoutGraph(tree, viewNodes, localPlans, viewport, context.spacing)
  const layoutKey = JSON.stringify(graph)
  let layout: LayoutResult
  let layouts = previous?.diagnostics.layouts ?? 0
  let reusedLayouts = previous?.diagnostics.reusedLayouts ?? 0
  if (previous?.cache.layoutKey === layoutKey) {
    layout = previous.cache.layout
    reusedLayouts += 1
  } else {
    layout = layoutFixed(graph)
    layouts += 1
  }

  const positioned = positionedTree(tree, viewNodes, localPlans, layout)
  const nodePlans = new Map<string, BlenderNodePlan>()
  const positionedPlanEntries = new Map<string, PlanEntry>()
  for (const entry of positioned.nodes) {
    const local = required(localPlans.get(entry.node.id), `Missing local Node plan: ${entry.node.id}`)
    const localEntry = required(localPlanEntries.get(entry.node.id), `Missing local Node plan key: ${entry.node.id}`)
    const key = JSON.stringify({local: localEntry.key, rect: entry.rect, sockets: entry.sockets.map(({side, center}) => ({side, center}))})
    const previousPlan = previous?.cache.positionedPlans.get(entry.node.id)
    const plan = previousPlan?.key === key
      ? previousPlan.plan
      : translatePlan(local, entry.rect.x, entry.rect.y, entry.sockets)
    positionedPlanEntries.set(entry.node.id, Object.freeze({key, plan}))
    nodePlans.set(entry.node.id, plan)
  }

  return Object.freeze({
    revision: tree.revision,
    topologyRevision: tree.topologyRevision,
    tree: positioned,
    nodePlans,
    diagnostics: Object.freeze({measurements, reusedMeasurements, layouts, reusedLayouts, plans, reusedPlans}),
    snapshot,
    cache: Object.freeze({
      measurements: measurementEntries,
      localPlans: localPlanEntries,
      positionedPlans: positionedPlanEntries,
      layoutKey,
      layout,
    }),
  })
}

function blenderNode(
  node: RuntimeNodeEntry,
  resolvedSides: ReadonlyMap<string, "left" | "right">,
): BlenderNode {
  const metadata = node.metadata ?? fail(`Node metadata is required: ${node.id}`)
  return Object.freeze({
    id: node.id,
    ...(node.frameId === undefined ? {} : {frameId: node.frameId}),
    title: metadata.title,
    ...(metadata.label === undefined ? {} : {label: metadata.label}),
    ...(metadata.category === undefined ? {} : {category: metadata.category}),
    ...(metadata.headerColor === undefined ? {} : {headerColor: metadata.headerColor as never}),
    ...(metadata.collapsed === undefined ? {} : {collapsed: metadata.collapsed}),
    parameters: Object.freeze((node.parameters ?? []).map((parameter): UiParameter => {
      const presentation = parameter.presentation
      return Object.freeze({
        id: parameter.id,
        label: presentation.label,
        field: bindField(presentation.field, parameter),
        ...(presentation.description === undefined ? {} : {description: presentation.description}),
      })
    })),
    sockets: Object.freeze((node.sockets ?? []).map((socket) => blenderSocket(
      socket,
      resolvedSides.get(endpointId(node.id, socket.id)),
    ))),
  })
}

function blenderSocket(
  socket: RuntimeSocket<BlenderSocketMetadata>,
  resolvedSide: "left" | "right" | undefined,
): BlenderSocket {
  const metadata = socket.metadata ?? fail(`Socket metadata is required: ${socket.id}`)
  const side = resolvedSide ?? socket.side
  return Object.freeze({
    id: socket.id,
    direction: socket.direction,
    ...(socket.parameterId === undefined ? {} : {parameterId: socket.parameterId}),
    ...(side === undefined ? {} : {side}),
    label: metadata.label,
    socketType: metadata.socketType,
    ...(metadata.shape === undefined ? {} : {shape: metadata.shape}),
    ...(metadata.description === undefined ? {} : {description: metadata.description}),
    ...(metadata.hideValue === undefined ? {} : {hideValue: metadata.hideValue}),
  })
}

function layoutGraph(
  tree: BlenderRuntimeGeneration,
  viewNodes: ReadonlyMap<string, BlenderNode>,
  plans: ReadonlyMap<string, BlenderNodePlan>,
  viewport: Readonly<{width: number; height: number}>,
  spacing = 28,
): FixedLayoutGraph {
  const nodes = [
    ...tree.frames.map((frame) => ({
      id: frame.id,
      ...(frame.parentFrameId === undefined ? {} : {parentId: frame.parentFrameId}),
      width: 220,
      height: 54,
      contentHeight: 30,
    })),
    ...tree.nodes.map((node) => {
      const measurement = required(plans.get(node.id), `Missing Node plan: ${node.id}`)
      return {
        id: node.id,
        ...(node.frameId === undefined ? {} : {parentId: node.frameId}),
        width: measurement.rect.w,
        height: measurement.rect.h,
        contentHeight: measurement.rect.h,
      }
    }),
  ]
  const ports = tree.nodes.flatMap((node) => {
    const plan = required(plans.get(node.id), `Missing Node plan: ${node.id}`)
    return plan.sockets.map(({socket, center}) => ({
      id: endpointId(node.id, socket.id),
      nodeId: node.id,
      y: center.y,
    }))
  })
  return {
    viewport,
    nodes,
    ports,
    edges: tree.links.map((link) => ({
      id: link.id,
      sourcePortId: endpointId(link.from.nodeId, link.from.socketId),
      targetPortId: endpointId(link.to.nodeId, link.to.socketId),
    })),
    layoutOptions: {spacing, clearance: spacing, layerSpacing: spacing, padding: spacing},
  }
}

function positionedTree(
  tree: BlenderRuntimeGeneration,
  viewNodes: ReadonlyMap<string, BlenderNode>,
  localPlans: ReadonlyMap<string, BlenderNodePlan>,
  layout: LayoutResult,
): PositionedNodeTree<BlenderNode, BlenderSocket, BlenderLink, BlenderFrame> {
  const rects = new Map(layout.nodes.map((entry) => [entry.id, {
    x: entry.x,
    y: entry.y,
    w: entry.width,
    h: entry.height,
  }]))
  const portGeometry = new Map(layout.ports.map((port) => [port.id, port]))
  const edgeGeometry = new Map(layout.edges.map((edge) => [edge.id, edge.sections[0]]))
  const frames: PositionedFrame<BlenderFrame>[] = tree.frames.map((frame) => ({
    frame: blenderFrame(frame),
    rect: required(rects.get(frame.id), `Layout omitted Frame: ${frame.id}`),
  }))
  const nodes: PositionedNode<BlenderNode, BlenderSocket>[] = tree.nodes.map((node) => {
    const view = required(viewNodes.get(node.id), `Missing Blender Node: ${node.id}`)
    const rect = required(rects.get(node.id), `Layout omitted Node: ${node.id}`)
    const plan = required(localPlans.get(node.id), `Missing local Node plan: ${node.id}`)
    const sockets: PositionedSocket<BlenderSocket>[] = plan.sockets.map(({socket, side, center}) => {
      const geometry = portGeometry.get(endpointId(node.id, socket.id))
      const layoutSide = geometry === undefined ? side : geometry.side === "WEST" ? "left" : "right"
      if (geometry !== undefined && layoutSide !== side) {
        throw new Error(`Layout and Node plan Socket sides differ: ${node.id}/${socket.id}`)
      }
      return {
        socket,
        side: layoutSide,
        center: geometry === undefined
          ? {x: rect.x + center.x, y: rect.y + center.y}
          : {x: geometry.x, y: geometry.y},
      }
    })
    return {node: view, rect, sockets}
  })
  const links: PositionedLink<BlenderLink>[] = tree.links.map((link) => {
    const section = required(edgeGeometry.get(link.id), `Layout omitted Link: ${link.id}`)
    return {
      link: blenderLink(link),
      points: [section.startPoint, ...section.bendPoints, section.endPoint],
    }
  })
  return Object.freeze({
    revision: tree.revision,
    bounds: {x: layout.bounds.x, y: layout.bounds.y, w: layout.bounds.width, h: layout.bounds.height},
    frames: Object.freeze(frames),
    nodes: Object.freeze(nodes),
    links: Object.freeze(links),
  })
}

function blenderFrame(frame: RuntimeFrame<BlenderFrameMetadata>): BlenderFrame {
  const metadata = frame.metadata ?? fail(`Frame metadata is required: ${frame.id}`)
  return Object.freeze({
    id: frame.id,
    ...(frame.parentFrameId === undefined ? {} : {parentFrameId: frame.parentFrameId}),
    label: metadata.label,
    ...(metadata.color === undefined ? {} : {color: metadata.color as never}),
    ...(metadata.labelSize === undefined ? {} : {labelSize: metadata.labelSize}),
  })
}

function blenderLink(link: RuntimeLink<BlenderLinkMetadata>): BlenderLink {
  const metadata = link.metadata
  return Object.freeze({
    id: link.id,
    from: link.from,
    to: link.to,
    ...(metadata?.label === undefined ? {} : {label: metadata.label}),
    ...(metadata?.socketType === undefined ? {} : {socketType: metadata.socketType}),
  })
}

function bindField(template: NodeJsonObject, parameter: RuntimeParameterEntry): FieldDefinition {
  const field = template as unknown as FieldDefinition
  if (typeof field.id !== "string" || typeof field.label !== "string" || typeof field.kind !== "string") {
    throw new Error(`Invalid Field presentation: ${parameter.id}`)
  }
  const set = (value: NodeJsonValue): void => { parameterSet(parameter.store, value) }
  if (field.kind === "text") return {...field, value: parameter.value as string, onChange: set}
  if (field.kind === "number") return {...field, value: parameter.value as number, onChange: set}
  if (field.kind === "integer") return {...field, value: parameter.value as number, onChange: set}
  if (field.kind === "boolean") return {...field, value: parameter.value as boolean, onChange: set}
  if (field.kind === "enum") return {...field, value: parameter.value as string, onChange: set}
  if (field.kind === "color") return {...field, value: parameter.value as never, onChange: set}
  if (field.kind === "vector") return {...field, value: parameter.value as readonly number[], onChange: set}
  if (field.kind === "rotation") return {...field, value: parameter.value as readonly number[], onChange: set}
  if (field.kind === "matrix") return {...field, value: parameter.value as readonly (readonly number[])[], onChange: set}
  if (field.kind === "path") return {...field, value: parameter.value as string, onChange: set}
  if (field.kind === "reference") return {
    ...field,
    value: parameter.value as never,
    onClear: () => { set(null) },
  }
  if (field.kind === "collection") {
    const value = parameter.value as NodeJsonObject
    const items = value["items"] as never
    const selectedId = value["selectedId"] as string | null
    return {
      ...field,
      items,
      selectedId,
      onSelect: (id) => { set({items: value["items"]!, selectedId: id}) },
    }
  }
  if (field.kind === "readonly") return {...field, value: parameter.value as string | number}
  throw new Error(`Unsupported Field kind: ${String((field as {kind?: unknown}).kind)}`)
}

function parameterSet(parameter: BlenderRuntimeParameter, value: NodeJsonValue): void {
  parameter.set(value)
}

function translatePlan(
  plan: BlenderNodePlan,
  dx: number,
  dy: number,
  sockets: readonly PositionedSocket<BlenderSocket>[],
): BlenderNodePlan {
  const rect = (value: NodeRect): NodeRect => ({...value, x: value.x + dx, y: value.y + dy})
  return {
    ...plan,
    rect: rect(plan.rect),
    bounds: rect(plan.bounds),
    header: rect(plan.header),
    body: rect(plan.body),
    preview: {
      ...plan.preview,
      panel: plan.preview.panel === null ? null : rect(plan.preview.panel),
      image: plan.preview.image === null ? null : {...rect(plan.preview.image), src: plan.preview.image.src},
    },
    fields: plan.fields.map((entry) => ({...entry, rect: rect(entry.rect), editorRect: rect(entry.editorRect)})),
    parameters: plan.parameters.map((entry) => ({
      ...entry,
      rect: rect(entry.rect),
      labelRect: rect(entry.labelRect),
      editorRect: rect(entry.editorRect),
    })),
    sockets,
  }
}

function measurementKey(node: RuntimeNodeEntry, connected: ReadonlySet<string>): string {
  return JSON.stringify({
    metadata: node.metadata,
    parameters: (node.parameters ?? []).map(({id, presentation, value}) => ({
      id,
      presentation,
      ...(presentation.geometrySensitiveValue === true ? {value} : {}),
    })),
    sockets: node.sockets,
    connected: [...connected].sort(),
  })
}

function connectedSocketIdsByNode(
  links: readonly RuntimeLink<BlenderLinkMetadata>[],
): ReadonlyMap<string, ReadonlySet<string>> {
  const mutable = new Map<string, Set<string>>()
  for (const link of links) {
    for (const endpoint of [link.from, link.to]) {
      const ids = mutable.get(endpoint.nodeId) ?? new Set<string>()
      ids.add(endpoint.socketId)
      mutable.set(endpoint.nodeId, ids)
    }
  }
  return new Map([...mutable].map(([id, values]) => [id, new Set(values)]))
}

function fixedSocketSides(tree: BlenderRuntimeGeneration): ReadonlyMap<string, "left" | "right"> {
  const socketByEndpoint = new Map<string, RuntimeSocket<BlenderSocketMetadata>>()
  for (const node of tree.nodes) {
    for (const socket of node.sockets ?? []) socketByEndpoint.set(endpointId(node.id, socket.id), socket)
  }
  const sides = new Map<string, "left" | "right">()
  const resolve = (
    endpoint: Readonly<{nodeId: string; socketId: string}>,
    side: "left" | "right",
    role: "source" | "target",
    linkId: string,
  ): void => {
    const key = endpointId(endpoint.nodeId, endpoint.socketId)
    const socket = required(socketByEndpoint.get(key), `Unknown Link Socket: ${linkId}/${endpoint.nodeId}/${endpoint.socketId}`)
    if (role === "source" && socket.direction === "input") {
      throw new Error(`Input Socket cannot be a Link source: ${linkId}/${endpoint.nodeId}/${endpoint.socketId}`)
    }
    if (role === "target" && socket.direction === "output") {
      throw new Error(`Output Socket cannot be a Link target: ${linkId}/${endpoint.nodeId}/${endpoint.socketId}`)
    }
    if (socket.side !== undefined && socket.side !== side) {
      throw new Error(`Fixed projection Socket side conflict: ${linkId}/${endpoint.nodeId}/${endpoint.socketId}`)
    }
    const previous = sides.get(key)
    if (previous !== undefined && previous !== side) {
      throw new Error(`Fixed projection Socket has conflicting Link roles: ${endpoint.nodeId}/${endpoint.socketId}`)
    }
    sides.set(key, side)
  }
  for (const link of tree.links) {
    resolve(link.from, "right", "source", link.id)
    resolve(link.to, "left", "target", link.id)
  }
  return sides
}

function endpointId(nodeId: string, socketId: string): string {
  return `${nodeId}\u0000${socketId}`
}

function normalizeViewport(viewport: Readonly<{width: number; height: number}>): Readonly<{width: number; height: number}> {
  if (![viewport.width, viewport.height].every(Number.isFinite) || viewport.width <= 0 || viewport.height <= 0) {
    throw new Error("Blender projection viewport must be finite and positive")
  }
  return {width: Math.round(viewport.width), height: Math.round(viewport.height)}
}

function required<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new Error(message)
  return value
}

function fail(message: string): never {
  throw new Error(message)
}

const EMPTY_IDS: ReadonlySet<string> = new Set()
