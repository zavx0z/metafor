import {Color, Mesh, PlaneGeometry, RoundedRectMaterial} from "@metafor/engine"
import {TextField, Typography} from "@ui/components"
import {
  UiSurface,
  Z,
  flexColumn,
  flexRow,
  palette,
  toneBorder,
  toneFill,
  type CssColor,
  type UiSurfaceOpts,
} from "@ui/elements"
import type {
  NodeSystemTone,
  PositionedNodeSystem,
  PositionedNodeSystemEdge,
  PositionedNodeSystemNode,
} from "nodes/types"
import {
  NODE_SYSTEM_CARD_METRICS,
  NODE_SYSTEM_PORT_PITCH,
  measureNodeSystemCard,
  planNodeSystemCard,
  type NodeSystemTextMeasurer,
} from "./card-layout.ts"
import {
  hitTestNodeSystemEdges,
  planNodeSystemEdgeHitRects,
  sampleNodeSystemBezierPath,
} from "./edge-curve.ts"
import {
  NODE_SYSTEM_EDGE_FLOW_MARKER_DURATION_MS,
  planNodeSystemEdgeFlowMarker,
  type NodeSystemEdgeMessage,
} from "./edge-flow-marker.ts"
import {
  defaultNodeSystemConnectionColor,
  type NodeSystemConnectionColorResolver,
} from "./connection-color.ts"
import {
  DEFAULT_NODE_SYSTEM_CANVAS_TRANSFORM,
  fitNodeSystemCanvasTransform,
  panNodeSystemCanvasTransform,
  planNodeSystemCanvasViewport,
  zoomNodeSystemCanvasTransformAt,
} from "./viewport.ts"
import {
  moveNodeSystemNodes,
  resizeNodeSystemNode,
} from "nodes/incremental-layout"
import type {
  NodeSystemCanvasTransform,
  NodeSystemCanvasTransformLimits,
  NodeSystemRenderPlan,
} from "nodes/types"

export type NodeSystemSurfaceOptions = UiSurfaceOpts & Readonly<{
  title?: string
  toolbar?: boolean
  /** Allow direct node move/resize. Keep false when the layout engine owns geometry. */
  editable?: boolean
  minScale?: number
  maxScale?: number
  /** Consumer-owned mapping from semantic connection identity to presentation color. */
  connectionColor?: NodeSystemConnectionColorResolver
  onSelectionChange?: (nodeId: string | null) => void
  onNodeMove?: (event: NodeSystemNodeMoveEvent) => void
  onNodeResize?: (event: NodeSystemNodeResizeEvent) => void
  onCanvasTransformChange?: (transform: NodeSystemCanvasTransform) => void
  onEdgeMessageCountChange?: (count: number) => void
}>

export type NodeSystemNodeMoveEvent = Readonly<{
  nodeId: string
  nodeIds: readonly string[]
  phase: "move" | "end"
  layout: PositionedNodeSystem
}>

export type NodeSystemNodeResizeEvent = Readonly<{
  nodeId: string
  side: "left" | "right"
  phase: "resize" | "end"
  layout: PositionedNodeSystem
}>

export type NodeSystemWheelGesture =
  | Readonly<{kind: "pan"; dx: number; dy: number}>
  | Readonly<{kind: "zoom"; factor: number}>

const EMPTY_LAYOUT: PositionedNodeSystem = Object.freeze({
  bounds: {x: 0, y: 0, w: 1, h: 1},
  nodes: [],
  edges: [],
})
const HEADER_HEIGHT = 38
const NODE_BODY_OPACITY = 0.94
const NODE_HEADER_OPACITY = 0.96
const EDGE_FLOW_MARKER_TAIL_SEGMENTS = 12

export type NodeSystemScreenPresentationMetrics = Readonly<{
  titleFontPx: number
  bodyFontPx: number
  metaFontPx: number
  nodeBorderPx: number
  selectedNodeBorderPx: number
  edgeThicknessPx: number
  socketDiameterPx: number
  fieldPaddingPx: number
}>

/**
 * Auto-fit may make world geometry small, but topology must remain visible in
 * screen pixels. These are presentation-only minima: they never feed layout or
 * alter node/port coordinates.
 */
export function nodeSystemScreenPresentationMetrics(scale: number): NodeSystemScreenPresentationMetrics {
  const unit = Number.isFinite(scale) && scale > 0 ? scale : 1
  return {
    titleFontPx: NODE_SYSTEM_CARD_METRICS.titleFontPx * unit,
    bodyFontPx: NODE_SYSTEM_CARD_METRICS.bodyFontPx * unit,
    metaFontPx: NODE_SYSTEM_CARD_METRICS.metaFontPx * unit,
    nodeBorderPx: Math.max(1.25, unit),
    selectedNodeBorderPx: Math.max(1.75, 2 * unit),
    edgeThicknessPx: Math.max(1.8, 1.6 * unit),
    socketDiameterPx: Math.max(5.5, NODE_SYSTEM_CARD_METRICS.markerSize * unit),
    fieldPaddingPx: NODE_SYSTEM_CARD_METRICS.rowGap * unit,
  }
}

type RetainedFlowMarkerShape = Readonly<{
  mesh: Mesh
  material: RoundedRectMaterial
}>

type RetainedFlowMarkerVisual = Readonly<{
  tail: readonly RetainedFlowMarkerShape[]
  head: RetainedFlowMarkerShape
}>

type EdgeFlowMarkerRoute = Readonly<{
  entry: PositionedNodeSystemEdge
  stroke: readonly Readonly<{x: number; y: number}>[]
}>

export type NodeSystemContainmentPaintStep =
  | Readonly<{kind: "owner-background"; nodeId: string}>
  | Readonly<{kind: "edges"}>
  | Readonly<{kind: "node-foreground"; nodeId: string; includeBackground: boolean}>

/**
 * Places transport between owner chrome and child cards. An edge may cross an
 * owner boundary, so drawing every node after every edge would hide the part
 * of the real route that lies inside the owner.
 */
export function planNodeSystemContainmentPaintSteps(
  allNodes: readonly PositionedNodeSystemNode[],
  visibleNodes: readonly PositionedNodeSystemNode[] = allNodes,
): readonly NodeSystemContainmentPaintStep[] {
  const byId = new Map(allNodes.map((entry) => [entry.node.id, entry] as const))
  const ownerIds = new Set(allNodes.flatMap(({node}) => node.parentId === undefined ? [] : [node.parentId]))
  const depthMemo = new Map<string, number>()
  const depth = (nodeId: string, visiting = new Set<string>()): number => {
    const memoized = depthMemo.get(nodeId)
    if (memoized !== undefined) return memoized
    if (visiting.has(nodeId)) return 0
    const parentId = byId.get(nodeId)?.node.parentId
    if (parentId === undefined || !byId.has(parentId)) {
      depthMemo.set(nodeId, 0)
      return 0
    }
    const nextVisiting = new Set(visiting)
    nextVisiting.add(nodeId)
    const result = depth(parentId, nextVisiting) + 1
    depthMemo.set(nodeId, result)
    return result
  }
  const visibleOrder = new Map(visibleNodes.map((entry, index) => [entry.node.id, index] as const))
  const ordered = [...visibleNodes].sort((left, right) => (
    depth(left.node.id) - depth(right.node.id) ||
    (visibleOrder.get(left.node.id) ?? 0) - (visibleOrder.get(right.node.id) ?? 0)
  ))
  return [
    ...ordered
      .filter(({node}) => ownerIds.has(node.id))
      .map(({node}) => ({kind: "owner-background" as const, nodeId: node.id})),
    {kind: "edges" as const},
    ...ordered.map(({node}) => ({
      kind: "node-foreground" as const,
      nodeId: node.id,
      includeBackground: !ownerIds.has(node.id),
    })),
  ]
}

/** Compound containment is structural chrome, not a transport or live-state stroke. */
export function nodeSystemNodeBorderColor(
  tone: NodeSystemTone,
  selected: boolean,
  compound: boolean,
): Color {
  if (selected) return palette.windowActiveBorder
  return compound ? palette.border : toneBorder(tone)
}

/** Infinite 2D graph canvas that can be mounted on a UIDisplay or another surface target. */
export class NodeSystemSurface extends UiSurface {
  /** Bound exact text metrics for layout and geometry-key callers. */
  readonly textMeasurer: NodeSystemTextMeasurer = (value, fontPx) => this.measureText(value, fontPx)
  readonly #title: string
  readonly #toolbar: boolean
  readonly #editable: boolean
  readonly #limits: NodeSystemCanvasTransformLimits
  readonly #connectionColor: NodeSystemConnectionColorResolver
  readonly #onSelectionChange: ((nodeId: string | null) => void) | undefined
  readonly #onNodeMove: ((event: NodeSystemNodeMoveEvent) => void) | undefined
  readonly #onNodeResize: ((event: NodeSystemNodeResizeEvent) => void) | undefined
  readonly #onCanvasTransformChange: ((transform: NodeSystemCanvasTransform) => void) | undefined
  readonly #onEdgeMessageCountChange: ((count: number) => void) | undefined
  #layout: PositionedNodeSystem = EMPTY_LAYOUT
  #canvasTransform: NodeSystemCanvasTransform = DEFAULT_NODE_SYSTEM_CANVAS_TRANSFORM
  #selectedNodeId: string | null = null
  #selectedNodeIds = new Set<string>()
  #fitPending = true
  #notifyCanvasTransformAfterFit = false
  #canvasTransformLayout: PositionedNodeSystem | null = null
  #lastFrame = {w: 0, h: 0}
  #panDrag: Readonly<{x: number; y: number; origin: NodeSystemCanvasTransform}> | null = null
  #nodeDrag: Readonly<{
    nodeIds: readonly string[]
    pointerX: number
    pointerY: number
    origins: ReadonlyMap<string, Readonly<{x: number; y: number}>>
    moved: boolean
  }> | null = null
  #nodeResize: Readonly<{
    nodeId: string
    side: "left" | "right"
    pointerX: number
    originWidth: number
    moved: boolean
  }> | null = null
  #marquee: Readonly<{
    startX: number
    startY: number
    currentX: number
    currentY: number
    additive: boolean
  }> | null = null
  #edgeMessages = new Map<string, NodeSystemEdgeMessage>()
  #seenEdgeMessageIds = new Set<string>()
  #flowMarkerFrameId: number | null = null
  #edgeAnimationEnabled = true
  #edgeFlowMarkerRoutes = new Map<string, EdgeFlowMarkerRoute>()
  readonly #edgeFlowMarkerGeometry = new PlaneGeometry({width: 1, height: 1})
  #flowMarkerVisuals: RetainedFlowMarkerVisual[] = []

  constructor(options: NodeSystemSurfaceOptions = {}) {
    super({
      bgColor: options.bgColor ?? palette.bg,
      borderColor: options.borderColor ?? null,
      ...(options.borderWidthPx === undefined ? {} : {borderWidthPx: options.borderWidthPx}),
      ...(options.borderRadiusPx === undefined ? {} : {borderRadiusPx: options.borderRadiusPx}),
      ...(options.padding === undefined ? {} : {padding: options.padding}),
    })
    this.#title = options.title ?? "NODE SYSTEM"
    this.#toolbar = options.toolbar ?? true
    this.#editable = options.editable ?? true
    this.#limits = {
      ...(options.minScale === undefined ? {} : {minScale: options.minScale}),
      ...(options.maxScale === undefined ? {} : {maxScale: options.maxScale}),
    }
    this.#connectionColor = options.connectionColor ?? defaultNodeSystemConnectionColor
    this.#onSelectionChange = options.onSelectionChange
    this.#onNodeMove = options.onNodeMove
    this.#onNodeResize = options.onNodeResize
    this.#onCanvasTransformChange = options.onCanvasTransformChange
    this.#onEdgeMessageCountChange = options.onEdgeMessageCountChange
    this.node.name = "NodeSystemSurface"
  }

  get layout(): PositionedNodeSystem {
    return this.#layout
  }

  get canvasTransform(): NodeSystemCanvasTransform {
    return this.#canvasTransform
  }

  get selectedNodeId(): string | null {
    return this.#selectedNodeId
  }

  get selectedNodeIds(): ReadonlySet<string> {
    return new Set(this.#selectedNodeIds)
  }

  get selectedNode(): PositionedNodeSystemNode | null {
    return this.#layout.nodes.find((entry) => entry.node.id === this.#selectedNodeId) ?? null
  }

  get toolbarVisible(): boolean {
    return this.#toolbar
  }

  get activeEdgeMessageCount(): number {
    this.#pruneEdgeMessages(Date.now())
    return this.#edgeMessages.size
  }

  get edgeAnimationEnabled(): boolean {
    return this.#edgeAnimationEnabled
  }

  override onPointerMove(event: MouseEvent, localX: number, localY: number): void {
    super.onPointerMove(event, localX, localY)
    // A compound owns one large hit rectangle, while edge hover inside its
    // empty body depends on the exact pointer coordinate. requestRender is
    // frame-coalesced by UiSurface, so rapid mouse events still produce at
    // most one pending redraw.
    this.requestRender()
  }

  /** Number of retained visual slots allocated for the peak concurrent load. */
  get retainedEdgeFlowMarkerVisualCount(): number {
    return this.#flowMarkerVisuals.length
  }

  /** Suspends transient traffic rendering without pausing the owning topology. */
  setEdgeAnimationEnabled(enabled: boolean): boolean {
    if (this.#edgeAnimationEnabled === enabled) return false
    this.#edgeAnimationEnabled = enabled
    if (!enabled) {
      if (this.#flowMarkerFrameId !== null && typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(this.#flowMarkerFrameId)
      }
      this.#flowMarkerFrameId = null
      const hadMessages = this.#edgeMessages.size > 0
      this.#edgeMessages.clear()
      this.#hideFlowMarkerVisuals()
      if (hadMessages) this.#onEdgeMessageCountChange?.(0)
      this.requestPresentationFrame()
      return true
    }
    // Clear any retained terminal marker before accepting fresh traffic.
    this.#updateFlowMarkerVisuals(Date.now())
    this.requestPresentationFrame()
    return true
  }

  /** Adds one already-observed transport message without mutating topology or layout. */
  emitEdgeMessage(message: NodeSystemEdgeMessage): boolean {
    const now = Date.now()
    if (
      !this.#edgeAnimationEnabled ||
      !message.id || !message.edgeId ||
      (message.direction !== "forward" && message.direction !== "reverse") ||
      !Number.isFinite(message.at) ||
      now - message.at >= NODE_SYSTEM_EDGE_FLOW_MARKER_DURATION_MS ||
      this.#seenEdgeMessageIds.has(message.id)
    ) return false
    this.#seenEdgeMessageIds.add(message.id)
    if (this.#seenEdgeMessageIds.size > 2_048) {
      const oldest = this.#seenEdgeMessageIds.values().next().value
      if (oldest !== undefined) this.#seenEdgeMessageIds.delete(oldest)
    }
    this.#edgeMessages.set(message.id, Object.freeze({...message}))
    this.#pruneEdgeMessages(now)
    this.#onEdgeMessageCountChange?.(this.#edgeMessages.size)
    if (this.#edgeFlowMarkerRoutes.size === 0) this.requestRender()
    else {
      this.#updateFlowMarkerVisuals(now)
      this.requestPresentationFrame()
    }
    this.#ensureFlowMarkerAnimation()
    return true
  }

  /** True only after the current layout has received a real canvas transform. */
  get hasMaterializedCanvasTransform(): boolean {
    return !this.#fitPending && this.#canvasTransformLayout === this.#layout
  }

  setLayout(layout: PositionedNodeSystem): void {
    this.#layout = layout
    this.#canvasTransformLayout = null
    const available = new Set(layout.nodes.map(({node}) => node.id))
    const surviving = [...this.#selectedNodeIds].filter((nodeId) => available.has(nodeId))
    if (surviving.length !== this.#selectedNodeIds.size) this.#setSelections(surviving)
    this.#fitPending = true
    this.requestRender()
  }

  select(nodeId: string | null): boolean {
    if (nodeId !== null && !this.#layout.nodes.some((entry) => entry.node.id === nodeId)) return false
    this.#setSelections(nodeId === null ? [] : [nodeId], nodeId)
    return true
  }

  selectMany(nodeIds: Iterable<string>): boolean {
    const requested = [...new Set(nodeIds)]
    if (requested.some((nodeId) => !this.#layout.nodes.some(({node}) => node.id === nodeId))) return false
    this.#setSelections(requested, requested.at(-1) ?? null)
    return true
  }

  /** Programmatic counterpart of pointer drag, also used by focused tests. */
  moveNode(nodeId: string, position: Readonly<{x: number; y: number}>, phase: "move" | "end" = "end"): boolean {
    return this.moveNodes(new Map([[nodeId, position]]), phase, nodeId)
  }

  /** Programmatic group-move contract used by the marquee interaction and tests. */
  moveNodes(
    positions: ReadonlyMap<string, Readonly<{x: number; y: number}>>,
    phase: "move" | "end" = "end",
    primaryNodeId = positions.keys().next().value as string | undefined,
  ): boolean {
    if (positions.size === 0 || [...positions].some(([nodeId]) => !this.#layout.nodes.some(({node}) => node.id === nodeId))) {
      return false
    }
    this.#layout = moveNodeSystemNodes(this.#layout, positions)
    this.#fitPending = false
    this.#notifyCanvasTransformAfterFit = false
    this.#canvasTransformLayout = this.#layout
    const nodeIds = [...positions.keys()]
    this.#onNodeMove?.({nodeId: primaryNodeId ?? nodeIds[0]!, nodeIds, phase, layout: this.#layout})
    this.requestRender()
    return true
  }

  /** Resizes a card from one side without changing the opposite edge. */
  resizeNode(
    nodeId: string,
    width: number,
    side: "left" | "right" = "right",
    phase: "resize" | "end" = "end",
  ): boolean {
    const current = this.#layout.nodes.find(({node}) => node.id === nodeId)
    if (current === undefined || current.node.parentId !== undefined || !Number.isFinite(width)) return false
    const childMinimum = Math.max(
      0,
      ...this.#layout.nodes
        .filter(({node}) => node.parentId === nodeId)
        .map(({rect}) => rect.w + NODE_SYSTEM_PORT_PITCH * 2),
    )
    const minimum = Math.max(measureNodeSystemCard(current.node, this.textMeasurer).width, childMinimum)
    const nextWidth = Math.max(minimum, width)
    const x = side === "left" ? current.rect.x + current.rect.w - nextWidth : current.rect.x
    this.#layout = resizeNodeSystemNode(this.#layout, nodeId, {x, w: nextWidth})
    this.#fitPending = false
    this.#notifyCanvasTransformAfterFit = false
    this.#canvasTransformLayout = this.#layout
    this.#onNodeResize?.({nodeId, side, phase, layout: this.#layout})
    this.requestRender()
    return true
  }

  fitToView(): void {
    this.#fitPending = true
    this.#notifyCanvasTransformAfterFit = true
    this.#canvasTransformLayout = null
    this.requestRender()
  }

  setCanvasTransform(transform: NodeSystemCanvasTransform): boolean {
    if (![transform.x, transform.y, transform.scale].every(Number.isFinite) || transform.scale <= 0) return false
    this.#canvasTransform = zoomNodeSystemCanvasTransformAt(
      {x: transform.x, y: transform.y, scale: 1},
      transform.scale,
      {x: transform.x, y: transform.y},
      this.#limits,
    )
    this.#fitPending = false
    this.#notifyCanvasTransformAfterFit = false
    this.#canvasTransformLayout = this.#layout
    this.requestRender()
    return true
  }

  renderPlan(): NodeSystemRenderPlan {
    return planNodeSystemCanvasViewport(this.#layout, this.#canvasTransform, this.#contentRect())
  }

  override onWheel(event: WheelEvent, localX: number, localY: number): void {
    if (localY < this.#headerHeight()) return
    event.preventDefault()
    const gesture = nodeSystemWheelGesture(event)
    this.#canvasTransform = gesture.kind === "zoom"
      ? zoomNodeSystemCanvasTransformAt(this.#canvasTransform, gesture.factor, {x: localX, y: localY}, this.#limits)
      : panNodeSystemCanvasTransform(this.#canvasTransform, -gesture.dx, -gesture.dy)
    this.#fitPending = false
    this.#notifyCanvasTransformAfterFit = false
    this.#canvasTransformLayout = this.#layout
    this.#onCanvasTransformChange?.(this.#canvasTransform)
    this.requestRender()
  }

  protected override render(): void {
    if (this.rectW !== this.#lastFrame.w || this.rectH !== this.#lastFrame.h) {
      this.#lastFrame = {w: this.rectW, h: this.rectH}
      // The generic infinite canvas does not own an application's auto-fit
      // policy. Once a transform is materialized, a display resize preserves
      // it until the owner explicitly calls fitToView/setCanvasTransform.
      if (!this.hasMaterializedCanvasTransform) {
        this.#fitPending = true
        this.#canvasTransformLayout = null
      }
    }
    if (this.#fitPending) this.#applyFit()

    // The canvas fill must precede owner chrome and relation strokes. Drawing
    // it in the default `main` layer would composite the opaque fill after the
    // `underlay`/`contentUnderlay` layers and visually erase compound frames
    // and edges while leaving only leaf-card foregrounds visible.
    this.withLayer("underlay", () => {
      this.drawRect(0, 0, this.rectW, this.rectH, palette.bg, Z.CONTAINER)
    })
    if (this.#toolbar) this.#drawToolbar()

    const content = this.#contentRect()
    this.pushClip(content.x, content.y, content.w, content.h)
    try {
      const plan = this.renderPlan()
      this.#registerBackground(content)
      this.#edgeFlowMarkerRoutes.clear()
      const visibleById = new Map(plan.nodes.map((entry) => [entry.node.id, entry] as const))
      for (const step of planNodeSystemContainmentPaintSteps(this.#layout.nodes, plan.nodes)) {
        if (step.kind === "owner-background") {
          const node = visibleById.get(step.nodeId)
          if (node !== undefined) {
            this.withLayer("underlay", () => this.#drawNodeBackground(node, plan.canvasTransform.scale, true))
          }
          continue
        }
        if (step.kind === "edges") {
          this.withLayer("contentUnderlay", () => {
            const routes = plan.edges.map((edge) => {
              const stroke = sampleNodeSystemBezierPath(edge.points, 10 * plan.canvasTransform.scale, 6)
              const thickness = nodeSystemScreenPresentationMetrics(plan.canvasTransform.scale).edgeThicknessPx
              return {
                edge,
                stroke,
                hitRects: planNodeSystemEdgeHitRects(stroke, Math.max(5, thickness * 2)),
              }
            })
            const compoundNodeIds = new Set(this.#layout.nodes.flatMap(({node}) => (
              node.parentId === undefined ? [] : [node.parentId]
            )))
            const pointer = this.hoveredPointer()
            const hoveredEdgeIds = new Set(pointer === null ? [] : hitTestNodeSystemEdges(
              routes.map(({edge, hitRects}) => ({edgeId: edge.edge.id, rects: hitRects})),
              pointer,
              plan.nodes.flatMap(({node, rect}) => compoundNodeIds.has(node.id) ? [] : [rect]),
            ))
            for (const {edge, stroke, hitRects} of routes) {
              this.#edgeFlowMarkerRoutes.set(edge.edge.id, {entry: edge, stroke})
              drawEdge(
                this,
                edge,
                plan.canvasTransform.scale,
                stroke,
                hitRects,
                hoveredEdgeIds.has(edge.edge.id),
                this.#connectionColor,
              )
            }
          })
          continue
        }
        const node = visibleById.get(step.nodeId)
        if (node === undefined) continue
        if (step.includeBackground) this.#drawNodeBackground(node, plan.canvasTransform.scale)
        this.#drawNodeForeground(node, plan.canvasTransform.scale)
      }
      const now = Date.now()
      this.#pruneEdgeMessages(now)
      this.#updateFlowMarkerVisuals(now)
      this.#drawMarquee()
      if (plan.nodes.length === 0) {
        flexColumn({
          x: content.x,
          y: content.y,
          w: content.w,
          h: content.h,
          items: [{height: "grow", draw: (slotX, slotY, slotW, slotH) => {
            flexRow({
              x: slotX,
              y: slotY,
              w: slotW,
              h: slotH,
              paddingLeft: 20,
              paddingRight: 20,
              alignItems: "center",
              items: [{width: "grow", height: 24, draw: (textX, textY, textW, textH) => {
                Typography(this, textX, textY, textW, textH, {
                  children: "Нет нод",
                  color: "muted",
                  sx: {textAlign: "center"},
                })
              }}],
            })
          }}],
        })
      }
    } finally {
      this.popClip()
    }
  }

  override dispose(): void {
    if (this.#flowMarkerFrameId !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(this.#flowMarkerFrameId)
    }
    this.#flowMarkerFrameId = null
    this.#edgeMessages.clear()
    this.#edgeFlowMarkerRoutes.clear()
    this.#hideFlowMarkerVisuals()
    super.dispose()
  }

  #pruneEdgeMessages(now: number): void {
    const previousSize = this.#edgeMessages.size
    for (const [id, message] of this.#edgeMessages) {
      if (now - message.at >= NODE_SYSTEM_EDGE_FLOW_MARKER_DURATION_MS) this.#edgeMessages.delete(id)
    }
    if (this.#edgeMessages.size !== previousSize) this.#onEdgeMessageCountChange?.(this.#edgeMessages.size)
  }

  #ensureFlowMarkerAnimation(): void {
    if (
      this.#flowMarkerFrameId !== null ||
      !this.#edgeAnimationEnabled ||
      this.#edgeMessages.size === 0 ||
      typeof requestAnimationFrame !== "function"
    ) return
    this.#flowMarkerFrameId = requestAnimationFrame(() => {
      this.#flowMarkerFrameId = null
      this.#pruneEdgeMessages(Date.now())
      // The terminal frame is as important as every movement frame: without
      // it the retained canvas keeps showing the last marker position until
      // some unrelated UI event invalidates the scene.
      this.#updateFlowMarkerVisuals(Date.now())
      this.requestPresentationFrame()
      if (this.#edgeMessages.size === 0) return
      this.#ensureFlowMarkerAnimation()
    })
  }

  #updateFlowMarkerVisuals(now: number): void {
    let visualIndex = 0
    for (const message of this.#edgeMessages.values()) {
      const route = this.#edgeFlowMarkerRoutes.get(message.edgeId)
      if (route === undefined) continue
      const marker = planNodeSystemEdgeFlowMarker(
        route.stroke,
        message,
        now,
        NODE_SYSTEM_EDGE_FLOW_MARKER_DURATION_MS,
        undefined,
        EDGE_FLOW_MARKER_TAIL_SEGMENTS,
      )
      if (marker === null) continue
      const visual = this.#flowMarkerVisuals[visualIndex] ?? this.#createFlowMarkerVisual()
      updateFlowMarkerVisual(visual, marker, this.#connectionColor(route.entry.edge.connectionType), this.pixelScale)
      visualIndex += 1
    }
    for (let index = visualIndex; index < this.#flowMarkerVisuals.length; index += 1) {
      setFlowMarkerVisualVisible(this.#flowMarkerVisuals[index]!, false)
    }
  }

  #createFlowMarkerVisual(): RetainedFlowMarkerVisual {
    const tail = Array.from({length: EDGE_FLOW_MARKER_TAIL_SEGMENTS}, () => this.#createFlowMarkerShape())
    const head = this.#createFlowMarkerShape(true)
    const visual = {tail, head}
    this.#flowMarkerVisuals.push(visual)
    return visual
  }

  #createFlowMarkerShape(head = false): RetainedFlowMarkerShape {
    const material = new RoundedRectMaterial({
      width: 1,
      height: 1,
      radius: 0.5,
      fill: palette.transparent,
      border: head ? new Color(1, 1, 1, 0.72) : null,
      borderWidth: 0,
    })
    // Every retained marker shape is a transformed unit quad. Sharing the
    // immutable geometry keeps peak traffic concurrency from multiplying the
    // same vertex/index GPU buffers for every head and tail segment.
    const mesh = new Mesh(this.#edgeFlowMarkerGeometry, material)
    mesh.visible = false
    mesh.frustumCulled = false
    this.addRetainedObject(mesh)
    return {mesh, material}
  }

  #hideFlowMarkerVisuals(): void {
    for (const visual of this.#flowMarkerVisuals) setFlowMarkerVisualVisible(visual, false)
  }

  #drawNodeBackground(entry: PositionedNodeSystemNode, scale: number, compound = false): void {
    const {node, rect} = entry
    const selected = this.#selectedNodeIds.has(node.id)
    const tone = node.tone ?? "neutral"
    const border = nodeSystemNodeBorderColor(tone, selected, compound)
    const fill = nodeBodyFill(selected)
    const card = planNodeSystemCard(node, rect, scale, this.textMeasurer)
    const screen = nodeSystemScreenPresentationMetrics(scale)
    const radius = 10 * scale

    this.drawRoundedRect(rect.x, rect.y, rect.w, rect.h, {
      radius,
      fill,
      border: null,
      opacity: NODE_BODY_OPACITY,
      z: Z.ELEMENT,
    })
    this.drawRoundedRect(rect.x, rect.y, rect.w, rect.h, {
      radius,
      fill: palette.transparent,
      border,
      borderWidth: selected ? screen.selectedNodeBorderPx : screen.nodeBorderPx,
      z: Z.ELEMENT + 0.005,
    })
    this.drawRoundedRect(card.header.x, card.header.y, card.header.w, card.header.h, {
      radius,
      fill: nodeHeaderFill(tone, selected),
      border: null,
      opacity: NODE_HEADER_OPACITY,
      z: Z.ELEMENT + 0.01,
    })
    this.drawRoundedRect(card.header.x, card.header.y, card.header.w, card.header.h, {
      radius,
      fill: palette.transparent,
      border,
      borderWidth: screen.nodeBorderPx,
      z: Z.ELEMENT + 0.015,
    })
  }

  #drawNodeForeground(entry: PositionedNodeSystemNode, scale: number): void {
    const {node, rect} = entry
    const contained = node.parentId !== undefined
    const selected = this.#selectedNodeIds.has(node.id)
    const card = planNodeSystemCard(node, rect, scale, this.textMeasurer)
    const screen = nodeSystemScreenPresentationMetrics(scale)
    Typography(this, card.title.x, card.title.y, card.title.w, card.title.h, {
      children: node.title,
      fontPx: screen.titleFontPx,
      color: selected ? "cyan" : "text",
    })
    if (node.kind !== undefined && card.kind !== undefined) {
      Typography(this, card.kind.x, card.kind.y, card.kind.w, card.kind.h, {
        children: node.kind,
        fontPx: screen.metaFontPx,
        color: "muted",
        sx: {textAlign: "right"},
      })
    }
    if (node.summary !== undefined && card.summary !== undefined) {
      Typography(this, card.summary.x, card.summary.y, card.summary.w, card.summary.h, {
        children: node.summary,
        fontPx: screen.bodyFontPx,
        color: scale < 0.55 ? "text" : "muted",
      })
    }
    for (const {fact, label, value} of card.facts) {
      Typography(this, label.x, label.y, label.w, label.h, {
        children: fact.label,
        fontPx: screen.bodyFontPx,
        color: scale < 0.55 ? "text" : "muted",
      })
      TextField(this, value.x, value.y + scale, value.w, Math.max(1, value.h - scale * 2), {
        key: `node-system:field:${node.id}:${fact.id}`,
        value: fact.value,
        disabled: true,
        fontPx: screen.bodyFontPx,
        sx: {
          color: toneTextColor(fact.tone ?? "neutral"),
          borderRadius: 5 * scale,
          paddingX: screen.fieldPaddingPx,
        },
      })
    }
    for (const {port, marker} of card.ports) {
      const socket = visibleSocketRect(marker, screen.socketDiameterPx)
      this.drawRoundedRect(socket.x, socket.y, socket.w, socket.h, {
        radius: socket.w / 2,
        fill: this.#connectionColor(port.connectionType),
        border: palette.bg,
        borderWidth: Math.max(0.8, scale),
        z: Z.TEXT + 0.02,
      })
    }
    this.hit(rect.x, rect.y, rect.w, rect.h, () => {}, {
      key: `node-system:node:${node.id}`,
      cursor: contained || !this.#editable ? "default" : "grab",
      activeCursor: contained || !this.#editable ? "default" : "grabbing",
      tooltip: {label: node.summary ?? node.title, delayMs: 450},
      onPointerDown: (x, y, event) => {
        const original = this.#layout.nodes.find((entry) => entry.node.id === node.id)
        if (original === undefined) return
        if (event?.shiftKey === true) {
          const next = new Set(this.#selectedNodeIds)
          if (next.has(node.id)) next.delete(node.id)
          else next.add(node.id)
          this.#setSelections(next, next.has(node.id) ? node.id : [...next].at(-1) ?? null)
        } else if (!this.#selectedNodeIds.has(node.id)) {
          this.#setSelections([node.id], node.id)
        } else {
          this.#selectedNodeId = node.id
          this.#onSelectionChange?.(node.id)
        }
        if (contained || !this.#editable) return
        if (!this.#selectedNodeIds.has(node.id)) return
        const nodeIds = [...this.#selectedNodeIds]
        const origins = new Map(nodeIds.map((selectedId) => {
          const entry = this.#layout.nodes.find(({node: selected}) => selected.id === selectedId)!
          return [selectedId, {x: entry.rect.x, y: entry.rect.y}] as const
        }))
        this.#nodeDrag = {
          nodeIds,
          pointerX: x,
          pointerY: y,
          origins,
          moved: false,
        }
      },
      onPointerMove: (x, y) => {
        const drag = this.#nodeDrag
        if (drag === null || !drag.nodeIds.includes(node.id)) return
        const dx = (x - drag.pointerX) / this.#canvasTransform.scale
        const dy = (y - drag.pointerY) / this.#canvasTransform.scale
        const moved = drag.moved || Math.hypot(x - drag.pointerX, y - drag.pointerY) >= 2
        this.#nodeDrag = {...drag, moved}
        if (!moved) return
        this.moveNodes(new Map([...drag.origins].map(([selectedId, origin]) => [
          selectedId,
          {x: origin.x + dx, y: origin.y + dy},
        ])), "move", node.id)
      },
      onPointerUp: () => {
        const drag = this.#nodeDrag
        this.#nodeDrag = null
        if (drag === null || !drag.nodeIds.includes(node.id) || !drag.moved) return
        this.#onNodeMove?.({nodeId: node.id, nodeIds: drag.nodeIds, phase: "end", layout: this.#layout})
      },
    })
    if (!contained && this.#editable) {
      this.#registerResizeHandle(entry, rect, scale, "left")
      this.#registerResizeHandle(entry, rect, scale, "right")
    }
  }

  #registerResizeHandle(
    entry: PositionedNodeSystemNode,
    rect: Readonly<{x: number; y: number; w: number; h: number}>,
    scale: number,
    side: "left" | "right",
  ): void {
    const handleWidth = Math.max(8, 10 * scale)
    const edgeX = side === "left" ? rect.x : rect.x + rect.w
    const key = `node-system:resize:${entry.node.id}:${side}`
    const state = this.hitState(edgeX - handleWidth / 2, rect.y, handleWidth, rect.h, key)
    if (state.hovered || state.pressed || this.#nodeResize?.nodeId === entry.node.id) {
      this.drawLine(edgeX, rect.y + 5 * scale, edgeX, rect.y + rect.h - 5 * scale, palette.borderBright, Math.max(1, 2 * scale), Z.TEXT + 0.03)
    }
    this.hit(edgeX - handleWidth / 2, rect.y, handleWidth, rect.h, () => {}, {
      key,
      cursor: "ew-resize",
      activeCursor: "ew-resize",
      tooltip: {label: side === "left" ? "Изменить ширину слева" : "Изменить ширину справа", delayMs: 320, anchor: "cursor"},
      onPointerDown: (x) => {
        const original = this.#layout.nodes.find(({node}) => node.id === entry.node.id)
        if (original === undefined) return
        this.#setSelections([entry.node.id], entry.node.id)
        this.#nodeResize = {
          nodeId: entry.node.id,
          side,
          pointerX: x,
          originWidth: original.rect.w,
          moved: false,
        }
      },
      onPointerMove: (x, y) => {
        void y
        const drag = this.#nodeResize
        if (drag === null || drag.nodeId !== entry.node.id || drag.side !== side) return
        const dx = (x - drag.pointerX) / this.#canvasTransform.scale
        const moved = drag.moved || Math.abs(x - drag.pointerX) >= 2
        this.#nodeResize = {...drag, moved}
        if (!moved) return
        this.resizeNode(entry.node.id, drag.originWidth + (side === "right" ? dx : -dx), side, "resize")
      },
      onPointerUp: () => {
        const drag = this.#nodeResize
        this.#nodeResize = null
        if (drag?.nodeId !== entry.node.id || drag.side !== side || !drag.moved) return
        this.#onNodeResize?.({nodeId: entry.node.id, side, phase: "end", layout: this.#layout})
      },
    })
  }

  #registerBackground(content: {x: number; y: number; w: number; h: number}): void {
    this.hit(content.x, content.y, content.w, content.h, () => {}, {
      key: "node-system:background",
      cursor: "default",
      activeCursor: "crosshair",
      onPointerDown: (x, y, event) => {
        if (event?.altKey === true || event?.button === 1 || event?.button === 2) {
          this.#panDrag = {x, y, origin: this.#canvasTransform}
          return
        }
        this.#marquee = {startX: x, startY: y, currentX: x, currentY: y, additive: event?.shiftKey === true}
      },
      onPointerMove: (x, y) => {
        if (this.#panDrag !== null) {
          this.#canvasTransform = panNodeSystemCanvasTransform(this.#panDrag.origin, x - this.#panDrag.x, y - this.#panDrag.y)
          this.#fitPending = false
          this.#notifyCanvasTransformAfterFit = false
          this.#canvasTransformLayout = this.#layout
          this.requestRender()
          return
        }
        if (this.#marquee === null) return
        this.#marquee = {...this.#marquee, currentX: x, currentY: y}
        this.#fitPending = false
        this.#notifyCanvasTransformAfterFit = false
        this.requestRender()
      },
      onPointerUp: () => {
        if (this.#panDrag !== null) {
          this.#onCanvasTransformChange?.(this.#canvasTransform)
          this.#panDrag = null
          return
        }
        const marquee = this.#marquee
        this.#marquee = null
        if (marquee === null) return
        const rect = normalizedRect(marquee.startX, marquee.startY, marquee.currentX, marquee.currentY)
        const dragged = rect.w >= 3 || rect.h >= 3
        if (!dragged) {
          if (!marquee.additive) this.#setSelections([])
          return
        }
        const selected = this.renderPlan().nodes
          .filter((entry) => intersects(rect, entry.rect))
          .map(({node}) => node.id)
        const next = marquee.additive ? new Set([...this.#selectedNodeIds, ...selected]) : new Set(selected)
        this.#setSelections(next, selected.at(-1) ?? [...next].at(-1) ?? null)
      },
    })
  }

  #drawMarquee(): void {
    if (this.#marquee === null) return
    const rect = normalizedRect(
      this.#marquee.startX,
      this.#marquee.startY,
      this.#marquee.currentX,
      this.#marquee.currentY,
    )
    this.drawRoundedRect(rect.x, rect.y, rect.w, rect.h, {
      radius: 3,
      fill: palette.bgHot,
      border: palette.cyan,
      borderWidth: 1,
      opacity: 0.7,
      z: Z.TEXT + 0.02,
    })
  }

  override onContextMenu(event: MouseEvent): void {
    event.preventDefault()
  }

  #applyFit(): void {
    this.#fitPending = false
    this.#canvasTransform = fitNodeSystemCanvasTransform(this.#layout, this.#contentRect(), 34, this.#limits)
    this.#canvasTransformLayout = this.#layout
    if (this.#notifyCanvasTransformAfterFit) {
      this.#notifyCanvasTransformAfterFit = false
      this.#onCanvasTransformChange?.(this.#canvasTransform)
    }
  }

  #contentRect(): {x: number; y: number; w: number; h: number} {
    const headerHeight = this.#headerHeight()
    return {x: 0, y: headerHeight, w: this.rectW, h: Math.max(1, this.rectH - headerHeight)}
  }

  #headerHeight(): number {
    return this.#toolbar ? HEADER_HEIGHT : 0
  }

  #drawToolbar(): void {
    this.drawRect(0, 0, this.rectW, HEADER_HEIGHT, palette.bgToolbar, Z.ELEMENT)
    this.drawRect(0, HEADER_HEIGHT - 1, this.rectW, 1, palette.borderDim, Z.SEPARATOR)
    const interactionHint = "2 пальца — панорама · щипок — масштаб"
    const [titleWidth, hintWidth] = fitMeasuredPair(
      Math.max(0, this.rectW - 14 * 2 - 12),
      this.measureText(this.#title, 11),
      this.measureText(interactionHint, 9),
    )
    flexRow({
      x: 0,
      y: 0,
      w: this.rectW,
      h: HEADER_HEIGHT,
      paddingLeft: 14,
      paddingRight: 14,
      gap: 12,
      alignItems: "stretch",
      justifyContent: "space-between",
      items: [
        {width: titleWidth, height: HEADER_HEIGHT, draw: (x, y, w, h) => {
          Typography(this, x, y, w, h, {children: this.#title, variant: "caption", color: "cyan"})
        }},
        {width: hintWidth, height: HEADER_HEIGHT, draw: (x, y, w, h) => {
          Typography(this, x, y, w, h, {
            children: interactionHint,
            variant: "caption",
            fontPx: 9,
            color: "muted",
            sx: {textAlign: "right"},
          })
        }},
      ],
    })
  }

  #setSelections(nodeIds: Iterable<string>, primaryNodeId: string | null = null): void {
    const next = new Set(nodeIds)
    const primary = primaryNodeId !== null && next.has(primaryNodeId) ? primaryNodeId : [...next].at(-1) ?? null
    if (primary === this.#selectedNodeId && setsEqual(next, this.#selectedNodeIds)) return
    this.#selectedNodeIds = next
    this.#selectedNodeId = primary
    this.#onSelectionChange?.(primary)
    this.requestRender()
  }
}

/**
 * Chrome exposes a Mac trackpad pinch as a ctrl+wheel stream. Plain wheel
 * deltas remain a two-finger pan, including while the trackpad is pressed.
 */
export function nodeSystemWheelGesture(
  event: Pick<WheelEvent, "ctrlKey" | "deltaMode" | "deltaX" | "deltaY">,
): NodeSystemWheelGesture {
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 800 : 1
  const dx = finiteWheelDelta(event.deltaX * unit)
  const dy = finiteWheelDelta(event.deltaY * unit)
  if (!event.ctrlKey) return {kind: "pan", dx, dy}
  return {
    kind: "zoom",
    factor: Math.min(1.18, Math.max(0.85, Math.exp(-dy * 0.0025))),
  }
}

function finiteWheelDelta(value: number): number {
  return Number.isFinite(value) ? value : 0
}

function fitMeasuredPair(available: number, left: number, right: number): readonly [number, number] {
  const safeAvailable = Math.max(0, available)
  const safeLeft = Math.max(0, left)
  const safeRight = Math.max(0, right)
  const preferred = safeLeft + safeRight
  if (preferred <= safeAvailable || preferred === 0) return [safeLeft, safeRight]
  const ratio = safeAvailable / preferred
  return [safeLeft * ratio, safeRight * ratio]
}

function normalizedRect(x0: number, y0: number, x1: number, y1: number): {x: number; y: number; w: number; h: number} {
  return {x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0)}
}

function intersects(
  left: Readonly<{x: number; y: number; w: number; h: number}>,
  right: Readonly<{x: number; y: number; w: number; h: number}>,
): boolean {
  return left.x <= right.x + right.w && left.x + left.w >= right.x && left.y <= right.y + right.h && left.y + left.h >= right.y
}

function setsEqual<T>(left: ReadonlySet<T>, right: ReadonlySet<T>): boolean {
  return left.size === right.size && [...left].every((value) => right.has(value))
}

function drawEdge(
  host: UiSurface,
  entry: PositionedNodeSystemEdge,
  scale: number,
  stroke: readonly Readonly<{x: number; y: number}>[],
  hitRects: readonly Readonly<{x: number; y: number; w: number; h: number}>[],
  isHovered: boolean,
  connectionColor: NodeSystemConnectionColorResolver,
): void {
  const color = connectionColor(entry.edge.connectionType)
  const thickness = nodeSystemScreenPresentationMetrics(scale).edgeThicknessPx
  host.drawPolyline(
    stroke,
    color,
    isHovered ? thickness * 1.8 : thickness,
    Z.ELEMENT_RULE,
  )
  for (const [index, rect] of hitRects.entries()) {
    const key = `node-system:edge:${entry.edge.id}:${index}`
    if (entry.edge.label === undefined) {
      host.hit(rect.x, rect.y, rect.w, rect.h, () => {}, {key, cursor: "default"})
      continue
    }
    host.hit(rect.x, rect.y, rect.w, rect.h, () => {}, {
      key,
      cursor: "default",
      tooltip: {label: entry.edge.label, delayMs: 220, anchor: "cursor"},
    })
    host.drawTooltipForHit(rect.x, rect.y, rect.w, rect.h, entry.edge.label, {
      delayMs: 220,
      anchor: "cursor",
    })
  }
}

function visibleSocketRect(
  marker: Readonly<{x: number; y: number; w: number; h: number}>,
  minimumDiameter: number,
): {x: number; y: number; w: number; h: number} {
  const diameter = Math.max(marker.w, marker.h, minimumDiameter)
  return {
    x: marker.x + marker.w / 2 - diameter / 2,
    y: marker.y + marker.h / 2 - diameter / 2,
    w: diameter,
    h: diameter,
  }
}

function updateFlowMarkerVisual(
  visual: RetainedFlowMarkerVisual,
  marker: NonNullable<ReturnType<typeof planNodeSystemEdgeFlowMarker>>,
  base: Color,
  pixelScale: number,
): void {
  for (let index = 0; index < visual.tail.length; index += 1) {
    const shape = visual.tail[index]!
    const segment = marker.tail[index]
    if (segment === undefined) {
      shape.mesh.visible = false
      continue
    }
    updateFlowMarkerSegment(
      shape,
      segment.from,
      segment.to,
      segment.thickness,
      base,
      base.a * segment.opacity,
      pixelScale,
      Z.ELEMENT_RULE + 0.006,
    )
  }

  const radius = 3.8
  const diameter = radius * 2 * pixelScale
  const {mesh, material} = visual.head
  mesh.visible = true
  mesh.position.x = marker.head.x * pixelScale
  mesh.position.y = -marker.head.y * pixelScale
  mesh.position.z = Z.ELEMENT_RULE + 0.008
  mesh.rotation.z = 0
  mesh.scale.set(diameter, diameter, 1)
  mesh.updateMatrix()
  material.width = diameter
  material.height = diameter
  setUniformRadii(material, radius * pixelScale)
  material.fill.setRGBA(base.r, base.g, base.b, 1)
  material.border.setRGBA(1, 1, 1, 0.72)
  material.borderWidth = 0.8 * pixelScale
  material.opacity = 1
}

function updateFlowMarkerSegment(
  shape: RetainedFlowMarkerShape,
  from: Readonly<{x: number; y: number}>,
  to: Readonly<{x: number; y: number}>,
  thickness: number,
  color: Color,
  opacity: number,
  pixelScale: number,
  z: number,
): void {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const length = Math.hypot(dx, dy)
  if (length <= Number.EPSILON) {
    shape.mesh.visible = false
    return
  }
  const width = length * pixelScale
  const height = thickness * pixelScale
  shape.mesh.visible = true
  shape.mesh.position.x = ((from.x + to.x) / 2) * pixelScale
  shape.mesh.position.y = -((from.y + to.y) / 2) * pixelScale
  shape.mesh.position.z = z
  shape.mesh.rotation.z = -Math.atan2(dy, dx)
  shape.mesh.scale.set(width, height, 1)
  shape.mesh.updateMatrix()
  shape.material.width = width
  shape.material.height = height
  setUniformRadii(shape.material, height / 2)
  shape.material.fill.setRGBA(color.r, color.g, color.b, opacity)
  shape.material.border.a = 0
  shape.material.borderWidth = 0
  shape.material.opacity = 1
}

function setUniformRadii(material: RoundedRectMaterial, radius: number): void {
  material.radii[0] = radius
  material.radii[1] = radius
  material.radii[2] = radius
  material.radii[3] = radius
}

function setFlowMarkerVisualVisible(visual: RetainedFlowMarkerVisual, visible: boolean): void {
  for (const shape of visual.tail) shape.mesh.visible = visible
  visual.head.mesh.visible = visible
}

function nodeBodyFill(selected: boolean): Color {
  return selected ? palette.bgHot : palette.bgElevated
}

function nodeHeaderFill(tone: NodeSystemTone, selected: boolean): Color {
  if (tone === "neutral") return selected ? palette.bgHot : palette.bgPanel
  return toneFill(tone)
}

function toneTextColor(tone: NodeSystemTone): CssColor {
  if (tone === "live") return "green"
  if (tone === "paused") return "orange"
  if (tone === "warn") return "red"
  return "text"
}
