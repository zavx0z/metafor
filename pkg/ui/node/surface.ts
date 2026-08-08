import {Color} from "@metafor/engine"
import {Typography} from "@ui/components"
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
} from "./model.ts"
import {
  NODE_SYSTEM_CARD_METRICS,
  measureNodeSystemCard,
  nodeSystemPortDirectionLabel,
  planNodeSystemCard,
  type NodeSystemTextMeasurer,
} from "./card-layout.ts"
import {planNodeSystemEdgeHitRects, sampleNodeSystemBezierPath} from "./edge-curve.ts"
import {moveNodeSystemNodes, resizeNodeSystemNode} from "./incremental-layout.ts"
import {
  DEFAULT_NODE_SYSTEM_VIEWPORT,
  fitNodeSystemViewport,
  panNodeSystemViewport,
  planNodeSystemViewport,
  zoomNodeSystemViewportAt,
  type NodeSystemRenderPlan,
  type NodeSystemViewport,
  type NodeSystemViewportLimits,
} from "./viewport.ts"

export type NodeSystemSurfaceOptions = UiSurfaceOpts & Readonly<{
  title?: string
  toolbar?: boolean
  minScale?: number
  maxScale?: number
  onSelectionChange?: (nodeId: string | null) => void
  onNodeMove?: (event: NodeSystemNodeMoveEvent) => void
  onNodeResize?: (event: NodeSystemNodeResizeEvent) => void
  onViewportChange?: (viewport: NodeSystemViewport) => void
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
const NODE_BODY_OPACITY = 0.72
const NODE_HEADER_OPACITY = 0.8

/** WebGPU HUD surface for one already-positioned node system. */
export class NodeSystemSurface extends UiSurface {
  /** Bound exact text metrics for ELK and geometry-key callers. */
  readonly textMeasurer: NodeSystemTextMeasurer = (value, fontPx) => this.measureText(value, fontPx)
  readonly #title: string
  readonly #toolbar: boolean
  readonly #limits: NodeSystemViewportLimits
  readonly #onSelectionChange: ((nodeId: string | null) => void) | undefined
  readonly #onNodeMove: ((event: NodeSystemNodeMoveEvent) => void) | undefined
  readonly #onNodeResize: ((event: NodeSystemNodeResizeEvent) => void) | undefined
  readonly #onViewportChange: ((viewport: NodeSystemViewport) => void) | undefined
  #layout: PositionedNodeSystem = EMPTY_LAYOUT
  #viewport: NodeSystemViewport = DEFAULT_NODE_SYSTEM_VIEWPORT
  #selectedNodeId: string | null = null
  #selectedNodeIds = new Set<string>()
  #fitPending = true
  #notifyViewportAfterFit = false
  #viewportLayout: PositionedNodeSystem | null = null
  #lastFrame = {w: 0, h: 0}
  #panDrag: Readonly<{x: number; y: number; origin: NodeSystemViewport}> | null = null
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
    this.#limits = {
      ...(options.minScale === undefined ? {} : {minScale: options.minScale}),
      ...(options.maxScale === undefined ? {} : {maxScale: options.maxScale}),
    }
    this.#onSelectionChange = options.onSelectionChange
    this.#onNodeMove = options.onNodeMove
    this.#onNodeResize = options.onNodeResize
    this.#onViewportChange = options.onViewportChange
    this.node.name = "NodeSystemSurface"
  }

  get layout(): PositionedNodeSystem {
    return this.#layout
  }

  get viewport(): NodeSystemViewport {
    return this.#viewport
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

  /** True only after the current layout has received a real fit or viewport. */
  get hasMaterializedViewport(): boolean {
    return !this.#fitPending && this.#viewportLayout === this.#layout
  }

  setLayout(layout: PositionedNodeSystem): void {
    this.#layout = layout
    this.#viewportLayout = null
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
    this.#notifyViewportAfterFit = false
    this.#viewportLayout = this.#layout
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
    if (current === undefined || !Number.isFinite(width)) return false
    const minimum = measureNodeSystemCard(current.node, this.textMeasurer).width
    const nextWidth = Math.max(minimum, width)
    const x = side === "left" ? current.rect.x + current.rect.w - nextWidth : current.rect.x
    this.#layout = resizeNodeSystemNode(this.#layout, nodeId, {x, w: nextWidth})
    this.#fitPending = false
    this.#notifyViewportAfterFit = false
    this.#viewportLayout = this.#layout
    this.#onNodeResize?.({nodeId, side, phase, layout: this.#layout})
    this.requestRender()
    return true
  }

  fitToView(): void {
    this.#fitPending = true
    this.#notifyViewportAfterFit = true
    this.#viewportLayout = null
    this.requestRender()
  }

  setViewport(viewport: NodeSystemViewport): boolean {
    if (![viewport.x, viewport.y, viewport.scale].every(Number.isFinite) || viewport.scale <= 0) return false
    this.#viewport = zoomNodeSystemViewportAt(
      {x: viewport.x, y: viewport.y, scale: 1},
      viewport.scale,
      {x: viewport.x, y: viewport.y},
      this.#limits,
    )
    this.#fitPending = false
    this.#notifyViewportAfterFit = false
    this.#viewportLayout = this.#layout
    this.requestRender()
    return true
  }

  renderPlan(): NodeSystemRenderPlan {
    return planNodeSystemViewport(this.#layout, this.#viewport, this.#contentRect())
  }

  override onWheel(event: WheelEvent, localX: number, localY: number): void {
    if (localY < this.#headerHeight()) return
    event.preventDefault()
    const gesture = nodeSystemWheelGesture(event)
    this.#viewport = gesture.kind === "zoom"
      ? zoomNodeSystemViewportAt(this.#viewport, gesture.factor, {x: localX, y: localY}, this.#limits)
      : panNodeSystemViewport(this.#viewport, -gesture.dx, -gesture.dy)
    this.#fitPending = false
    this.#notifyViewportAfterFit = false
    this.#viewportLayout = this.#layout
    this.#onViewportChange?.(this.#viewport)
    this.requestRender()
  }

  protected override render(): void {
    if (this.rectW !== this.#lastFrame.w || this.rectH !== this.#lastFrame.h) {
      this.#lastFrame = {w: this.rectW, h: this.rectH}
      this.#fitPending = true
      this.#viewportLayout = null
    }
    if (this.#fitPending) this.#applyFit()

    this.drawRect(0, 0, this.rectW, this.rectH, palette.bg, Z.CONTAINER)
    if (this.#toolbar) this.#drawToolbar()

    const content = this.#contentRect()
    this.pushClip(content.x, content.y, content.w, content.h)
    try {
      const plan = this.renderPlan()
      this.#registerBackground(content)
      for (const edge of plan.edges) drawEdge(this, edge, plan.viewport.scale)
      for (const node of plan.nodes) this.#drawNode(node, plan.viewport.scale)
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

  #drawNode(entry: PositionedNodeSystemNode, scale: number): void {
    const {node, rect} = entry
    const selected = this.#selectedNodeIds.has(node.id)
    const tone = node.tone ?? "neutral"
    const border = selected ? palette.windowActiveBorder : toneBorder(tone)
    const fill = nodeBodyFill(selected)
    const card = planNodeSystemCard(node, rect, scale, this.textMeasurer)
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
      borderWidth: selected ? Math.max(0.8, 2 * scale) : Math.max(0.5, scale),
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
      borderWidth: Math.max(0.4, scale),
      z: Z.ELEMENT + 0.015,
    })
    Typography(this, card.title.x, card.title.y, card.title.w, card.title.h, {
      children: node.title,
      fontPx: NODE_SYSTEM_CARD_METRICS.titleFontPx * scale,
      color: selected ? "cyan" : "text",
    })
    if (node.kind !== undefined && card.kind !== undefined) {
      Typography(this, card.kind.x, card.kind.y, card.kind.w, card.kind.h, {
        children: node.kind,
        fontPx: NODE_SYSTEM_CARD_METRICS.metaFontPx * scale,
        color: "muted",
        sx: {textAlign: "right"},
      })
    }
    if (node.summary !== undefined && card.summary !== undefined) {
      Typography(this, card.summary.x, card.summary.y, card.summary.w, card.summary.h, {
        children: node.summary,
        fontPx: NODE_SYSTEM_CARD_METRICS.bodyFontPx * scale,
        color: "muted",
      })
    }
    for (const {fact, label, value} of card.facts) {
      Typography(this, label.x, label.y, label.w, label.h, {
        children: fact.label,
        fontPx: NODE_SYSTEM_CARD_METRICS.bodyFontPx * scale,
        color: "muted",
      })
      Typography(this, value.x, value.y, value.w, value.h, {
        children: fact.value,
        fontPx: NODE_SYSTEM_CARD_METRICS.bodyFontPx * scale,
        color: toneTextColor(fact.tone ?? "neutral"),
        sx: {textAlign: "right"},
      })
    }
    for (const {port, marker, label, direction} of card.ports) {
      Typography(this, label.x, label.y, label.w, label.h, {
        children: port.label ?? port.id,
        fontPx: NODE_SYSTEM_CARD_METRICS.bodyFontPx * scale,
        color: "text",
        sx: {textAlign: port.direction === "in" ? "left" : "right"},
      })
      Typography(this, direction.x, direction.y, direction.w, direction.h, {
        children: nodeSystemPortDirectionLabel(port.direction),
        fontPx: NODE_SYSTEM_CARD_METRICS.metaFontPx * scale,
        color: "muted",
        sx: {textAlign: port.direction === "in" ? "right" : "left"},
      })
      this.drawRoundedRect(marker.x, marker.y, marker.w, marker.h, {
        radius: marker.w / 2,
        fill: port.direction === "in" ? palette.blue : port.direction === "out" ? palette.orange : palette.violet,
        border: palette.bg,
        borderWidth: Math.max(0.35, scale),
        z: Z.TEXT + 0.02,
      })
    }
    this.hit(rect.x, rect.y, rect.w, rect.h, () => {}, {
      key: `node-system:node:${node.id}`,
      cursor: "grab",
      activeCursor: "grabbing",
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
        const dx = (x - drag.pointerX) / this.#viewport.scale
        const dy = (y - drag.pointerY) / this.#viewport.scale
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
    this.#registerResizeHandle(entry, rect, scale, "left")
    this.#registerResizeHandle(entry, rect, scale, "right")
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
        const dx = (x - drag.pointerX) / this.#viewport.scale
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
          this.#panDrag = {x, y, origin: this.#viewport}
          return
        }
        this.#marquee = {startX: x, startY: y, currentX: x, currentY: y, additive: event?.shiftKey === true}
      },
      onPointerMove: (x, y) => {
        if (this.#panDrag !== null) {
          this.#viewport = panNodeSystemViewport(this.#panDrag.origin, x - this.#panDrag.x, y - this.#panDrag.y)
          this.#fitPending = false
          this.#notifyViewportAfterFit = false
          this.#viewportLayout = this.#layout
          this.requestRender()
          return
        }
        if (this.#marquee === null) return
        this.#marquee = {...this.#marquee, currentX: x, currentY: y}
        this.#fitPending = false
        this.#notifyViewportAfterFit = false
        this.requestRender()
      },
      onPointerUp: () => {
        if (this.#panDrag !== null) {
          this.#onViewportChange?.(this.#viewport)
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
    this.#viewport = fitNodeSystemViewport(this.#layout, this.#contentRect(), 34, this.#limits)
    this.#viewportLayout = this.#layout
    if (this.#notifyViewportAfterFit) {
      this.#notifyViewportAfterFit = false
      this.#onViewportChange?.(this.#viewport)
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

function drawEdge(host: UiSurface, entry: PositionedNodeSystemEdge, scale: number): void {
  const color = edgeColor(entry.edge.tone ?? "neutral")
  const thickness = Math.max(0.8, 1.6 * scale)
  const stroke = sampleNodeSystemBezierPath(entry.points, 10 * scale, 6)
  const hitRects = planNodeSystemEdgeHitRects(stroke, Math.max(5, thickness * 2))
  const isHovered = hitRects.some((rect, index) => host.hitState(
    rect.x,
    rect.y,
    rect.w,
    rect.h,
    `node-system:edge:${entry.edge.id}:${index}`,
  ).hovered)
  host.drawPolyline(
    stroke,
    color,
    isHovered ? thickness * 1.8 : thickness,
    Z.ELEMENT_RULE,
  )
  if (entry.edge.label === undefined) return
  for (const [index, rect] of hitRects.entries()) {
    const key = `node-system:edge:${entry.edge.id}:${index}`
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

function nodeBodyFill(selected: boolean): Color {
  return selected ? palette.bgHot : palette.bgElevated
}

function nodeHeaderFill(tone: NodeSystemTone, selected: boolean): Color {
  if (tone === "neutral") return selected ? palette.bgHot : palette.bgPanel
  return toneFill(tone)
}

function edgeColor(tone: NodeSystemTone): Color {
  if (tone === "live") return palette.green
  if (tone === "paused") return palette.orange
  if (tone === "warn") return palette.red
  return palette.cyan
}

function toneTextColor(tone: NodeSystemTone): CssColor {
  if (tone === "live") return "green"
  if (tone === "paused") return "orange"
  if (tone === "warn") return "red"
  return "text"
}
