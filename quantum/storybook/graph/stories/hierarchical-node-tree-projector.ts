/**
Storybook-owned deterministic hierarchical NodeTree view projection.

The module preserves every semantic Frame, Node, Socket and Link supplied by the
Graph adapter. It reuses public `@nodes/ui` measurement, planning and render
contracts, while owning only recursive grid placement and dogleg Link geometry.
It is not a production Graph adapter or a general layout policy.

@packageDocumentation
*/

import type {LayoutResult} from "@nodes/layout/types"
import type {FieldDefinition} from "@ui/components/field"
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
} from "@nodes/ui/node-editor"
import {
  measureNode,
  planNode,
  type FrameView,
  type LinkView,
  type NodeView,
  type NodeMeasurement,
  type NodePlan,
  type SocketView,
  type SocketKind,
} from "@nodes/ui/node"
import type {Parameter as UiParameter} from "@nodes/ui/parameter"

export type ParameterPresentation = NodeJsonObject & Readonly<{
  label: string
  field: NodeJsonObject
  description?: string
  /** Include the current value in intrinsic measurement identity when its shape changes geometry. */
  geometrySensitiveValue?: boolean
}>

export type FrameMetadata = NodeJsonObject & Readonly<{
  label: string
  color?: NodeJsonValue
  labelSize?: number
}>

export type NodeMetadata = NodeJsonObject & Readonly<{
  title: string
  label?: string
  category?: string
  headerColor?: NodeJsonValue
  collapsed?: boolean
}>

export type SocketMetadata = NodeJsonObject & Readonly<{
  label: string
  socketType: SocketKind
  shape?: SocketView["shape"]
  description?: string
  hideValue?: boolean
}>

export type LinkMetadata = NodeJsonObject & Readonly<{
  label?: string
  socketType?: SocketKind
}>

export type RuntimeParameter = Parameter<NodeJsonValue, ParameterPresentation>
export type RuntimeTree = NodeTree<
  RuntimeParameter,
  FrameMetadata,
  NodeMetadata,
  SocketMetadata,
  LinkMetadata
>
export type RuntimeGeneration = NodeTreeGenerationView<
  RuntimeParameter,
  FrameMetadata,
  NodeMetadata,
  SocketMetadata,
  LinkMetadata
>

export type ProjectionContext = Readonly<{
  viewport: Readonly<{width: number; height: number}>
  overlayState?: NodeCanvasOverlayState
  spacing?: number
}>

export type ProjectionDiagnostics = Readonly<{
  measurements: number
  reusedMeasurements: number
  layouts: number
  reusedLayouts: number
  plans: number
  reusedPlans: number
}>

type MeasurementEntry = Readonly<{
  key: string
  measurement: NodeMeasurement
}>

type PlanEntry = Readonly<{
  key: string
  plan: NodePlan
}>

type ProjectionCache = Readonly<{
  measurements: ReadonlyMap<string, MeasurementEntry>
  localPlans: ReadonlyMap<string, PlanEntry>
  positionedPlans: ReadonlyMap<string, PlanEntry>
  layoutKey: string
  layout: LayoutResult
}>

export type NodeTreeProjection = NodeEditorProjection<
  NodeView,
  SocketView,
  LinkView,
  FrameView,
  NodePlan
> & Readonly<{
  revision: number
  topologyRevision: number
  diagnostics: ProjectionDiagnostics
  snapshot: NodeTreeSnapshot<
    RuntimeParameter,
    FrameMetadata,
    NodeMetadata,
    SocketMetadata,
    LinkMetadata
  >
  /** @internal Reuse evidence for the next projection of the same view. */
  cache: ProjectionCache
}>

type RuntimeNodeEntry = NodeTreeGenerationNode<
  RuntimeParameter,
  NodeMetadata,
  SocketMetadata
>
type RuntimeParameterEntry = NodeTreeGenerationParameter<RuntimeParameter>

/** Creates the Storybook-owned hierarchical projection for exact semantic entities. */
export function createGraphNodeTreeHierarchicalProjector(): NodeTreeProjector<
  RuntimeGeneration,
  ReturnType<RuntimeTree["snapshot"]>,
  ProjectionContext,
  NodeTreeProjection
> {
  return Object.freeze({
    project: ({tree, snapshot, context, previous}) => projectNodeTree(
      tree,
      snapshot,
      context,
      previous?.projection,
    ),
  })
}

function projectNodeTree(
  tree: RuntimeGeneration,
  snapshot: ReturnType<RuntimeTree["snapshot"]>,
  context: ProjectionContext,
  previous: NodeTreeProjection | undefined,
): NodeTreeProjection {
  const viewport = normalizeViewport(context.viewport)
  const overlayState = context.overlayState ?? DEFAULT_NODE_CANVAS_OVERLAY_STATE
  const connectedByNode = connectedSocketIdsByNode(tree.links)
  const resolvedSides = new Map<string, "left" | "right">()
  const viewNodes = new Map(tree.nodes.map((node) => [node.id, nodeView(node, resolvedSides)]))
  const measurementEntries = new Map<string, MeasurementEntry>()
  const localPlanEntries = new Map<string, PlanEntry>()
  const localPlans = new Map<string, NodePlan>()
  let measurements = previous?.diagnostics.measurements ?? 0
  let reusedMeasurements = previous?.diagnostics.reusedMeasurements ?? 0
  let plans = previous?.diagnostics.plans ?? 0
  let reusedPlans = previous?.diagnostics.reusedPlans ?? 0

  for (const node of tree.nodes) {
    const view = required(viewNodes.get(node.id), `Missing Node view: ${node.id}`)
    const connected = connectedByNode.get(node.id) ?? EMPTY_IDS
    const key = measurementKey(node, connected)
    const previousMeasurement = previous?.cache.measurements.get(node.id)
    const measurement = previousMeasurement?.key === key
      ? previousMeasurement.measurement
      : measureNode(view, connected)
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
      : planNode(
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

  const layoutKey = hierarchicalLayoutKey(tree, localPlans, viewport, context.spacing)
  let layout: LayoutResult
  let layouts = previous?.diagnostics.layouts ?? 0
  let reusedLayouts = previous?.diagnostics.reusedLayouts ?? 0
  if (previous?.cache.layoutKey === layoutKey) {
    layout = previous.cache.layout
    reusedLayouts += 1
  } else {
    layout = layoutHierarchical(tree, localPlans, viewport, context.spacing)
    layouts += 1
  }

  const positioned = positionedTree(tree, viewNodes, localPlans, layout)
  const nodePlans = new Map<string, NodePlan>()
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

function nodeView(
  node: RuntimeNodeEntry,
  resolvedSides: ReadonlyMap<string, "left" | "right">,
): NodeView {
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
    sockets: Object.freeze((node.sockets ?? []).map((socket) => socketView(
      socket,
      resolvedSides.get(endpointId(node.id, socket.id)),
    ))),
  })
}

function socketView(
  socket: RuntimeSocket<SocketMetadata>,
  resolvedSide: "left" | "right" | undefined,
): SocketView {
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

type MeasuredLayoutItem =
  | Readonly<{kind: "node"; id: string; width: number; height: number}>
  | Readonly<{
      kind: "frame"
      id: string
      width: number
      height: number
      children: readonly MeasuredLayoutItem[]
      grid: GridMeasure
    }>

type GridMeasure = Readonly<{
  columns: number
  columnWidths: readonly number[]
  rowHeights: readonly number[]
  width: number
  height: number
}>

const FRAME_MIN_WIDTH = 220
const FRAME_HEADER_HEIGHT = 42
const FRAME_PADDING = 24
const ROOT_PADDING = 32

function hierarchicalLayoutKey(
  tree: RuntimeGeneration,
  plans: ReadonlyMap<string, NodePlan>,
  viewport: Readonly<{width: number; height: number}>,
  spacing = 28,
): string {
  return JSON.stringify({
    viewport,
    spacing,
    frames: tree.frames.map(({id, parentFrameId}) => ({id, parentFrameId})),
    nodes: tree.nodes.map(({id, frameId}) => {
      const plan = required(plans.get(id), `Missing Node plan: ${id}`)
      return {id, frameId, width: plan.rect.w, height: plan.rect.h}
    }),
    links: tree.links.map(({id, from, to}) => ({id, from, to})),
  })
}

function layoutHierarchical(
  tree: RuntimeGeneration,
  plans: ReadonlyMap<string, NodePlan>,
  viewport: Readonly<{width: number; height: number}>,
  spacing = 28,
): LayoutResult {
  const gap = Math.max(24, spacing)
  const framesByParent = groupBy(tree.frames, (frame) => frame.parentFrameId ?? null)
  const nodesByFrame = groupBy(tree.nodes, (node) => node.frameId ?? null)
  const measuredFrames = new Map<string, MeasuredLayoutItem & {kind: "frame"}>()

  const measureFrame = (frame: RuntimeFrame<FrameMetadata>): MeasuredLayoutItem & {kind: "frame"} => {
    const cached = measuredFrames.get(frame.id)
    if (cached !== undefined) return cached
    const children: MeasuredLayoutItem[] = [
      ...(nodesByFrame.get(frame.id) ?? []).map((node): MeasuredLayoutItem => {
        const plan = required(plans.get(node.id), `Missing Node plan: ${node.id}`)
        return {kind: "node", id: node.id, width: plan.rect.w, height: plan.rect.h}
      }),
      ...(framesByParent.get(frame.id) ?? []).map(measureFrame),
    ]
    const grid = measureGrid(children, gap)
    const measured = Object.freeze({
      kind: "frame" as const,
      id: frame.id,
      width: Math.max(FRAME_MIN_WIDTH, grid.width + FRAME_PADDING * 2),
      height: FRAME_HEADER_HEIGHT + FRAME_PADDING + grid.height + FRAME_PADDING,
      children: Object.freeze(children),
      grid,
    })
    measuredFrames.set(frame.id, measured)
    return measured
  }

  const roots: MeasuredLayoutItem[] = [
    ...(framesByParent.get(null) ?? []).map(measureFrame),
    ...(nodesByFrame.get(null) ?? []).map((node): MeasuredLayoutItem => {
      const plan = required(plans.get(node.id), `Missing Node plan: ${node.id}`)
      return {kind: "node", id: node.id, width: plan.rect.w, height: plan.rect.h}
    }),
  ]
  const rootGrid = measureGrid(roots, gap * 2)
  const originX = Math.max(ROOT_PADDING, (viewport.width - rootGrid.width) / 2)
  const originY = Math.max(ROOT_PADDING, (viewport.height - rootGrid.height) / 2)
  const nodeRects = new Map<string, {x: number; y: number; width: number; height: number}>()
  const frameRects = new Map<string, {x: number; y: number; width: number; height: number}>()

  const placeItem = (item: MeasuredLayoutItem, x: number, y: number): void => {
    if (item.kind === "node") {
      nodeRects.set(item.id, {x, y, width: item.width, height: item.height})
      return
    }
    frameRects.set(item.id, {x, y, width: item.width, height: item.height})
    placeGrid(
      item.children,
      item.grid,
      x + FRAME_PADDING,
      y + FRAME_HEADER_HEIGHT + FRAME_PADDING,
      gap,
      placeItem,
    )
  }
  placeGrid(roots, rootGrid, originX, originY, gap * 2, placeItem)

  const ports = tree.nodes.flatMap((node) => {
    const rect = required(nodeRects.get(node.id), `Layout omitted Node: ${node.id}`)
    const plan = required(plans.get(node.id), `Missing Node plan: ${node.id}`)
    return plan.sockets.map(({socket, center}) => {
      const side = socket.side ?? (socket.direction === "input" ? "left" : "right")
      return {
        id: endpointId(node.id, socket.id),
        x: side === "left" ? rect.x : rect.x + rect.width,
        y: rect.y + center.y,
        side: side === "left" ? "WEST" as const : "EAST" as const,
      }
    })
  })
  const portById = new Map(ports.map((port) => [port.id, port]))
  const edges = tree.links.map((link, index) => {
    const startPoint = required(
      portById.get(endpointId(link.from.nodeId, link.from.socketId)),
      `Layout omitted Link source: ${link.id}`,
    )
    const endPoint = required(
      portById.get(endpointId(link.to.nodeId, link.to.socketId)),
      `Layout omitted Link target: ${link.id}`,
    )
    const lane = 30 + index % 7 * 9
    const sourceExit = {
      x: startPoint.x + (startPoint.side === "EAST" ? lane : -lane),
      y: startPoint.y,
    }
    const targetExit = {
      x: endPoint.x + (endPoint.side === "EAST" ? lane : -lane),
      y: endPoint.y,
    }
    const offset = (index % 9 - 4) * 11
    const middleX = sourceExit.x <= targetExit.x
      ? (sourceExit.x + targetExit.x) / 2 + offset
      : Math.max(sourceExit.x, targetExit.x) + gap + lane
    const candidates = [
      sourceExit,
      {x: middleX, y: sourceExit.y},
      {x: middleX, y: targetExit.y},
      targetExit,
    ]
    const bendPoints = candidates.filter((point, pointIndex) => {
      const previous = pointIndex === 0 ? startPoint : candidates[pointIndex - 1]!
      const next = pointIndex === candidates.length - 1 ? endPoint : candidates[pointIndex + 1]!
      return !(point.x === previous.x && point.y === previous.y) &&
        !(point.x === next.x && point.y === next.y)
    })
    return {
      id: link.id,
      sections: [{
        startPoint: {x: startPoint.x, y: startPoint.y},
        bendPoints,
        endPoint: {x: endPoint.x, y: endPoint.y},
      }] as const,
    }
  })

  const rectangles = [...frameRects.values(), ...nodeRects.values()]
  const points = edges.flatMap(({sections}) => {
    const section = sections[0]
    return [section.startPoint, ...section.bendPoints, section.endPoint]
  })
  const minX = Math.min(...rectangles.map(({x}) => x), ...points.map(({x}) => x), 0)
  const minY = Math.min(...rectangles.map(({y}) => y), ...points.map(({y}) => y), 0)
  const maxX = Math.max(...rectangles.map(({x, width}) => x + width), ...points.map(({x}) => x), viewport.width)
  const maxY = Math.max(...rectangles.map(({y, height}) => y + height), ...points.map(({y}) => y), viewport.height)

  return Object.freeze({
    direction: viewport.width >= viewport.height ? "RIGHT" : "DOWN",
    bounds: {
      x: minX - ROOT_PADDING,
      y: minY - ROOT_PADDING,
      width: maxX - minX + ROOT_PADDING * 2,
      height: maxY - minY + ROOT_PADDING * 2,
    },
    nodes: Object.freeze([
      ...tree.frames.map((frame) => ({id: frame.id, ...required(frameRects.get(frame.id), `Layout omitted Frame: ${frame.id}`)})),
      ...tree.nodes.map((node) => ({id: node.id, ...required(nodeRects.get(node.id), `Layout omitted Node: ${node.id}`)})),
    ]),
    ports: Object.freeze(ports),
    edges: Object.freeze(edges),
  })
}

function measureGrid(items: readonly MeasuredLayoutItem[], gap: number): GridMeasure {
  if (items.length === 0) {
    return Object.freeze({columns: 1, columnWidths: [0], rowHeights: [0], width: 0, height: 0})
  }
  const columns = Math.max(1, Math.ceil(Math.sqrt(items.length)))
  const rows = Math.ceil(items.length / columns)
  const columnWidths = Array.from({length: columns}, () => 0)
  const rowHeights = Array.from({length: rows}, () => 0)
  items.forEach((item, index) => {
    const column = index % columns
    const row = Math.floor(index / columns)
    columnWidths[column] = Math.max(columnWidths[column]!, item.width)
    rowHeights[row] = Math.max(rowHeights[row]!, item.height)
  })
  return Object.freeze({
    columns,
    columnWidths: Object.freeze(columnWidths),
    rowHeights: Object.freeze(rowHeights),
    width: columnWidths.reduce((sum, width) => sum + width, 0) + Math.max(0, columns - 1) * gap,
    height: rowHeights.reduce((sum, height) => sum + height, 0) + Math.max(0, rows - 1) * gap,
  })
}

function placeGrid(
  items: readonly MeasuredLayoutItem[],
  grid: GridMeasure,
  x: number,
  y: number,
  gap: number,
  place: (item: MeasuredLayoutItem, x: number, y: number) => void,
): void {
  const columnOffsets: number[] = []
  const rowOffsets: number[] = []
  let offset = 0
  for (const width of grid.columnWidths) {
    columnOffsets.push(offset)
    offset += width + gap
  }
  offset = 0
  for (const height of grid.rowHeights) {
    rowOffsets.push(offset)
    offset += height + gap
  }
  items.forEach((item, index) => {
    const column = index % grid.columns
    const row = Math.floor(index / grid.columns)
    place(
      item,
      x + columnOffsets[column]! + (grid.columnWidths[column]! - item.width) / 2,
      y + rowOffsets[row]! + (grid.rowHeights[row]! - item.height) / 2,
    )
  })
}

function groupBy<T>(
  values: readonly T[],
  key: (value: T) => string | null,
): Map<string | null, T[]> {
  const result = new Map<string | null, T[]>()
  for (const value of values) {
    const group = key(value)
    const entries = result.get(group)
    if (entries) entries.push(value)
    else result.set(group, [value])
  }
  return result
}

function positionedTree(
  tree: RuntimeGeneration,
  viewNodes: ReadonlyMap<string, NodeView>,
  localPlans: ReadonlyMap<string, NodePlan>,
  layout: LayoutResult,
): PositionedNodeTree<NodeView, SocketView, LinkView, FrameView> {
  const rects = new Map(layout.nodes.map((entry) => [entry.id, {
    x: entry.x,
    y: entry.y,
    w: entry.width,
    h: entry.height,
  }]))
  const portGeometry = new Map(layout.ports.map((port) => [port.id, port]))
  const edgeGeometry = new Map(layout.edges.map((edge) => [edge.id, edge.sections[0]]))
  const frames: PositionedFrame<FrameView>[] = tree.frames.map((frame) => ({
    frame: frameView(frame),
    rect: required(rects.get(frame.id), `Layout omitted Frame: ${frame.id}`),
  }))
  const nodes: PositionedNode<NodeView, SocketView>[] = tree.nodes.map((node) => {
    const view = required(viewNodes.get(node.id), `Missing Node view: ${node.id}`)
    const rect = required(rects.get(node.id), `Layout omitted Node: ${node.id}`)
    const plan = required(localPlans.get(node.id), `Missing local Node plan: ${node.id}`)
    const sockets: PositionedSocket<SocketView>[] = plan.sockets.map(({socket, side, center}) => {
      const geometry = portGeometry.get(endpointId(node.id, socket.id))
      const layoutSide = geometry === undefined ? side : geometry.side === "WEST" ? "left" : "right"
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
  const links: PositionedLink<LinkView>[] = tree.links.map((link) => {
    const section = required(edgeGeometry.get(link.id), `Layout omitted Link: ${link.id}`)
    return {
      link: linkView(link),
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

function frameView(frame: RuntimeFrame<FrameMetadata>): FrameView {
  const metadata = frame.metadata ?? fail(`Frame metadata is required: ${frame.id}`)
  return Object.freeze({
    id: frame.id,
    ...(frame.parentFrameId === undefined ? {} : {parentFrameId: frame.parentFrameId}),
    label: metadata.label,
    ...(metadata.color === undefined ? {} : {color: metadata.color as never}),
    ...(metadata.labelSize === undefined ? {} : {labelSize: metadata.labelSize}),
  })
}

function linkView(link: RuntimeLink<LinkMetadata>): LinkView {
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

function parameterSet(parameter: RuntimeParameter, value: NodeJsonValue): void {
  parameter.set(value)
}

function translatePlan(
  plan: NodePlan,
  dx: number,
  dy: number,
  sockets: readonly PositionedSocket<SocketView>[],
): NodePlan {
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
  links: readonly RuntimeLink<LinkMetadata>[],
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

function endpointId(nodeId: string, socketId: string): string {
  return `${nodeId}\u0000${socketId}`
}

function normalizeViewport(viewport: Readonly<{width: number; height: number}>): Readonly<{width: number; height: number}> {
  if (![viewport.width, viewport.height].every(Number.isFinite) || viewport.width <= 0 || viewport.height <= 0) {
    throw new Error("Node projection viewport must be finite and positive")
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
