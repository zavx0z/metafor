import type {Color} from "@metafor/engine"
import {Typography} from "@ui/components"
import {
  UiSurface,
  Z,
  flexColumn,
  flexRow,
  palette,
  type UiSurfaceOpts,
} from "@ui/elements"

export type NodePoint = Readonly<{x: number; y: number}>
export type NodeRect = Readonly<{x: number; y: number; w: number; h: number}>
export type NodeCanvasTransform = Readonly<{x: number; y: number; scale: number}>

/** Minimal Blender-like component identity; domain data is carried by TNode. */
export type Node = Readonly<{
  id: string
  parentId?: string
}>

export type SocketDirection = "input" | "output" | "bidirectional"
export type SocketSide = "left" | "right" | "top" | "bottom"
export type SocketShape = "circle" | "square" | "diamond" | "circle-dot" | "square-dot" | "diamond-dot"

/** Visible connection endpoint; layout Port remains an independent lower-level term. */
export type Socket = Readonly<{
  id: string
  direction: SocketDirection
}>

export type SocketEndpoint = Readonly<{nodeId: string; socketId: string}>

/** Visible connection between exact sockets. */
export type Link = Readonly<{
  id: string
  from: SocketEndpoint
  to: SocketEndpoint
}>

export type NodeTree<
  TNode extends Node = Node,
  TLink extends Link = Link,
> = Readonly<{
  revision?: string | number
  nodes: readonly TNode[]
  links: readonly TLink[]
}>

export type PositionedSocket<TSocket extends Socket = Socket> = Readonly<{
  socket: TSocket
  side: SocketSide
  center: NodePoint
}>

export type PositionedNode<
  TNode extends Node = Node,
  TSocket extends Socket = Socket,
> = Readonly<{
  node: TNode
  rect: NodeRect
  sockets: readonly PositionedSocket<TSocket>[]
}>

export type PositionedLink<TLink extends Link = Link> = Readonly<{
  link: TLink
  points: readonly NodePoint[]
}>

export type PositionedNodeTree<
  TNode extends Node = Node,
  TSocket extends Socket = Socket,
  TLink extends Link = Link,
> = Readonly<{
  revision?: string | number
  bounds: NodeRect
  nodes: readonly PositionedNode<TNode, TSocket>[]
  links: readonly PositionedLink<TLink>[]
}>

export type NodeRendererContext<TNode extends Node, TSocket extends Socket> = Readonly<{
  host: UiSurface
  entry: PositionedNode<TNode, TSocket>
  scale: number
  selected: boolean
  container: boolean
}>

export type SocketRendererContext<TSocket extends Socket> = Readonly<{
  host: UiSurface
  entry: PositionedSocket<TSocket>
  scale: number
  selected: boolean
  nodeId: string
}>

export type LinkRendererContext<TLink extends Link> = Readonly<{
  host: UiSurface
  entry: PositionedLink<TLink>
  scale: number
  selected: boolean
}>

export type NodeRenderer<TNode extends Node, TSocket extends Socket> = Readonly<{
  measure?(node: TNode): Readonly<{width: number; height: number}>
  renderBackground(context: NodeRendererContext<TNode, TSocket>): void
  renderForeground(context: NodeRendererContext<TNode, TSocket>): void
}>

export type SocketRenderer<TSocket extends Socket> = Readonly<{
  render(context: SocketRendererContext<TSocket>): void
}>

export type LinkRenderer<TLink extends Link> = Readonly<{
  render(context: LinkRendererContext<TLink>): void
}>

export type NodeEditorRenderers<
  TNode extends Node,
  TSocket extends Socket,
  TLink extends Link,
> = Readonly<{
  node: NodeRenderer<TNode, TSocket>
  socket: SocketRenderer<TSocket>
  link: LinkRenderer<TLink>
}>

export type NodeEditorRenderPlan<
  TNode extends Node,
  TSocket extends Socket,
  TLink extends Link,
> = Readonly<{
  transform: NodeCanvasTransform
  nodes: readonly PositionedNode<TNode, TSocket>[]
  links: readonly PositionedLink<TLink>[]
}>

export type NodeEditorPaintStep =
  | Readonly<{kind: "container-background"; nodeId: string}>
  | Readonly<{kind: "links"}>
  | Readonly<{kind: "node"; nodeId: string; includeBackground: boolean}>

export type NodeCanvasOptions<
  TNode extends Node,
  TSocket extends Socket,
  TLink extends Link,
> = UiSurfaceOpts & Readonly<{
  renderers: NodeEditorRenderers<TNode, TSocket, TLink>
  title?: string
  toolbar?: boolean
  minScale?: number
  maxScale?: number
  messages?: Readonly<{empty?: string; interactionHint?: string}>
  onSelectionChange?(nodeId: string | null): void
  onCanvasTransformChange?(transform: NodeCanvasTransform): void
}>

export type NodeEditorOptions<
  TNode extends Node,
  TSocket extends Socket,
  TLink extends Link,
> = NodeCanvasOptions<TNode, TSocket, TLink>

const DEFAULT_TRANSFORM: NodeCanvasTransform = Object.freeze({x: 0, y: 0, scale: 1})
const TOOLBAR_HEIGHT = 38

/** Read-only Blender-like Node canvas with no layout or product dependency. */
export class NodeCanvas<
  TNode extends Node,
  TSocket extends Socket,
  TLink extends Link,
> extends UiSurface {
  readonly #renderers: NodeEditorRenderers<TNode, TSocket, TLink>
  readonly #title: string
  readonly #toolbar: boolean
  readonly #minScale: number
  readonly #maxScale: number
  readonly #emptyMessage: string
  readonly #interactionHint: string
  readonly #onSelectionChange: ((nodeId: string | null) => void) | undefined
  readonly #onCanvasTransformChange: ((transform: NodeCanvasTransform) => void) | undefined
  #tree: PositionedNodeTree<TNode, TSocket, TLink>
  #transform = DEFAULT_TRANSFORM
  #selectedNodeId: string | null = null
  #fitPending = true
  #lastFrame = {w: 0, h: 0}

  constructor(options: NodeCanvasOptions<TNode, TSocket, TLink>) {
    super({
      bgColor: options.bgColor ?? palette.bg,
      borderColor: options.borderColor ?? null,
      ...(options.borderWidthPx === undefined ? {} : {borderWidthPx: options.borderWidthPx}),
      ...(options.borderRadiusPx === undefined ? {} : {borderRadiusPx: options.borderRadiusPx}),
      ...(options.padding === undefined ? {} : {padding: options.padding}),
    })
    this.#renderers = options.renderers
    this.#title = options.title ?? "NODE CANVAS"
    this.#toolbar = options.toolbar ?? true
    this.#minScale = Math.max(0.01, options.minScale ?? 0.16)
    this.#maxScale = Math.max(this.#minScale, options.maxScale ?? 3)
    this.#emptyMessage = options.messages?.empty ?? "Нет нод"
    this.#interactionHint = options.messages?.interactionHint ?? "Только просмотр"
    this.#onSelectionChange = options.onSelectionChange
    this.#onCanvasTransformChange = options.onCanvasTransformChange
    this.#tree = emptyNodeTree<TNode, TSocket, TLink>()
    this.node.name = "NodeCanvas"
  }

  get tree(): PositionedNodeTree<TNode, TSocket, TLink> {
    return this.#tree
  }

  get canvasTransform(): NodeCanvasTransform {
    return this.#transform
  }

  get selectedNodeId(): string | null {
    return this.#selectedNodeId
  }

  setTree(tree: PositionedNodeTree<TNode, TSocket, TLink>): void {
    validatePositionedNodeTree(tree)
    this.#tree = tree
    if (this.#selectedNodeId !== null && !tree.nodes.some(({node}) => node.id === this.#selectedNodeId)) {
      this.#selectedNodeId = null
      this.#onSelectionChange?.(null)
    }
    this.#fitPending = true
    this.requestRender()
  }

  select(nodeId: string | null): boolean {
    if (nodeId !== null && !this.#tree.nodes.some(({node}) => node.id === nodeId)) return false
    if (nodeId === this.#selectedNodeId) return true
    this.#selectedNodeId = nodeId
    this.#onSelectionChange?.(nodeId)
    this.requestRender()
    return true
  }

  fitToView(): void {
    this.#fitPending = true
    this.requestRender()
  }

  setCanvasTransform(transform: NodeCanvasTransform): boolean {
    if (![transform.x, transform.y, transform.scale].every(Number.isFinite) || transform.scale <= 0) return false
    this.#transform = {
      x: transform.x,
      y: transform.y,
      scale: clamp(transform.scale, this.#minScale, this.#maxScale),
    }
    this.#fitPending = false
    this.#onCanvasTransformChange?.(this.#transform)
    this.requestRender()
    return true
  }

  renderPlan(): NodeEditorRenderPlan<TNode, TSocket, TLink> {
    return planNodeEditorViewport(this.#tree, this.#transform, this.#contentRect())
  }

  override onWheel(event: WheelEvent, localX: number, localY: number): void {
    if (!this.interactive()) return
    if (localY < this.#headerHeight()) return
    event.preventDefault()
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 800 : 1
    const dx = finite(event.deltaX * unit)
    const dy = finite(event.deltaY * unit)
    if (event.ctrlKey) {
      const factor = clamp(Math.exp(-dy * 0.0025), 0.85, 1.18)
      const scale = clamp(this.#transform.scale * factor, this.#minScale, this.#maxScale)
      const ratio = scale / this.#transform.scale
      this.#transform = {
        x: localX - (localX - this.#transform.x) * ratio,
        y: localY - (localY - this.#transform.y) * ratio,
        scale,
      }
    } else {
      this.#transform = {x: this.#transform.x - dx, y: this.#transform.y - dy, scale: this.#transform.scale}
    }
    this.#fitPending = false
    this.#onCanvasTransformChange?.(this.#transform)
    this.requestRender()
  }

  protected override render(): void {
    if (this.rectW !== this.#lastFrame.w || this.rectH !== this.#lastFrame.h) {
      this.#lastFrame = {w: this.rectW, h: this.rectH}
      this.#fitPending = true
    }
    if (this.#fitPending) {
      this.#fitPending = false
      this.#transform = fitNodeEditorTransform(this.#tree, this.#contentRect(), 34, this.#minScale, this.#maxScale)
    }
    this.withLayer("underlay", () => this.drawRect(0, 0, this.rectW, this.rectH, palette.bg, Z.CONTAINER))
    if (this.#toolbar) this.#drawToolbar()
    const content = this.#contentRect()
    this.pushClip(content.x, content.y, content.w, content.h)
    try {
      const plan = this.renderPlan()
      const visibleById = new Map(plan.nodes.map((entry) => [entry.node.id, entry] as const))
      const containerIds = new Set(this.#tree.nodes.flatMap(({node}) =>
        node.parentId === undefined ? [] : [node.parentId]))
      if (this.interactive()) this.hit(content.x, content.y, content.w, content.h, () => this.select(null), {
        key: "node-editor:background",
        cursor: "default",
      })
      for (const step of planNodeEditorPaintSteps(this.#tree.nodes, plan.nodes)) {
        if (step.kind === "container-background") {
          const entry = visibleById.get(step.nodeId)
          if (entry !== undefined) this.withLayer("underlay", () => this.#renderers.node.renderBackground({
            host: this,
            entry,
            scale: plan.transform.scale,
            selected: this.#selectedNodeId === entry.node.id,
            container: true,
          }))
          continue
        }
        if (step.kind === "links") {
          this.withLayer("contentUnderlay", () => {
            for (const entry of plan.links) this.#renderers.link.render({
              host: this,
              entry,
              scale: plan.transform.scale,
              selected: false,
            })
          })
          continue
        }
        const entry = visibleById.get(step.nodeId)
        if (entry === undefined) continue
        const context: NodeRendererContext<TNode, TSocket> = {
          host: this,
          entry,
          scale: plan.transform.scale,
          selected: this.#selectedNodeId === entry.node.id,
          container: containerIds.has(entry.node.id),
        }
        if (step.includeBackground) this.#renderers.node.renderBackground(context)
        this.#renderers.node.renderForeground(context)
        for (const socket of entry.sockets) this.#renderers.socket.render({
          host: this,
          entry: socket,
          scale: plan.transform.scale,
          selected: context.selected,
          nodeId: entry.node.id,
        })
        if (this.interactive()) this.hit(entry.rect.x, entry.rect.y, entry.rect.w, entry.rect.h, () => this.select(entry.node.id), {
          key: `node-editor:node:${entry.node.id}`,
          cursor: "pointer",
        })
      }
      if (plan.nodes.length === 0) {
        Typography(this, content.x, content.y, content.w, content.h, {
          children: this.#emptyMessage,
          color: "muted",
          sx: {textAlign: "center"},
        })
      }
    } finally {
      this.popClip()
    }
  }

  #drawToolbar(): void {
    this.drawRect(0, 0, this.rectW, TOOLBAR_HEIGHT, palette.bgToolbar, Z.ELEMENT)
    this.drawRect(0, TOOLBAR_HEIGHT - 1, this.rectW, 1, palette.borderDim, Z.SEPARATOR)
    flexRow({
      x: 0,
      y: 0,
      w: this.rectW,
      h: TOOLBAR_HEIGHT,
      paddingX: 14,
      gap: 12,
      alignItems: "stretch",
      items: [
        {width: "1fr", height: TOOLBAR_HEIGHT, draw: (x, y, w, h) => Typography(this, x, y, w, h, {
          children: this.#title,
          variant: "caption",
          color: "cyan",
        })},
        {width: "1fr", height: TOOLBAR_HEIGHT, draw: (x, y, w, h) => Typography(this, x, y, w, h, {
          children: this.#interactionHint,
          variant: "caption",
          color: "muted",
          sx: {textAlign: "right"},
        })},
      ],
    })
  }

  #contentRect(): NodeRect {
    return nodeEditorRegions(this.rectW, this.rectH, this.#toolbar).content
  }

  #headerHeight(): number {
    return nodeEditorRegions(this.rectW, this.rectH, this.#toolbar).toolbar.h
  }

  protected interactive(): boolean {
    return false
  }
}

/** Interactive Blender-like Node Editor. */
export class NodeEditor<
  TNode extends Node,
  TSocket extends Socket,
  TLink extends Link,
> extends NodeCanvas<TNode, TSocket, TLink> {
  constructor(options: NodeEditorOptions<TNode, TSocket, TLink>) {
    super({
      ...options,
      title: options.title ?? "NODE EDITOR",
      messages: {
        ...options.messages,
        interactionHint: options.messages?.interactionHint ?? "2 пальца — панорама · щипок — масштаб",
      },
    })
    this.node.name = "NodeEditor"
  }

  protected override interactive(): boolean {
    return true
  }
}

export function nodeEditorRegions(width: number, height: number, toolbar: boolean): Readonly<{
  toolbar: NodeRect
  content: NodeRect
}> {
  let toolbarRect: NodeRect = {x: 0, y: 0, w: width, h: 0}
  let content: NodeRect = {x: 0, y: 0, w: width, h: height}
  flexColumn({
    x: 0,
    y: 0,
    w: width,
    h: height,
    items: [
      toolbar && {height: TOOLBAR_HEIGHT, draw: (x, y, w, h) => { toolbarRect = {x, y, w, h} }},
      {height: "grow", draw: (x, y, w, h) => { content = {x, y, w, h} }},
    ],
  })
  return {toolbar: toolbarRect, content}
}

export function planNodeEditorPaintSteps<
  TNode extends Node,
  TSocket extends Socket,
>(
  allNodes: readonly PositionedNode<TNode, TSocket>[],
  visibleNodes: readonly PositionedNode<TNode, TSocket>[] = allNodes,
): readonly NodeEditorPaintStep[] {
  const allById = new Map(allNodes.map((entry) => [entry.node.id, entry] as const))
  const containerIds = new Set(allNodes.flatMap(({node}) => node.parentId === undefined ? [] : [node.parentId]))
  const order = new Map(visibleNodes.map((entry, index) => [entry.node.id, index] as const))
  const depthMemo = new Map<string, number>()
  const depth = (nodeId: string, visiting = new Set<string>()): number => {
    const cached = depthMemo.get(nodeId)
    if (cached !== undefined) return cached
    if (visiting.has(nodeId)) return 0
    const parentId = allById.get(nodeId)?.node.parentId
    if (parentId === undefined || !allById.has(parentId)) return 0
    const next = new Set(visiting)
    next.add(nodeId)
    const value = depth(parentId, next) + 1
    depthMemo.set(nodeId, value)
    return value
  }
  const nodes = [...visibleNodes].sort((left, right) =>
    depth(left.node.id) - depth(right.node.id) ||
    (order.get(left.node.id) ?? 0) - (order.get(right.node.id) ?? 0))
  return [
    ...nodes.filter(({node}) => containerIds.has(node.id)).map(({node}) => ({
      kind: "container-background" as const,
      nodeId: node.id,
    })),
    {kind: "links" as const},
    ...nodes.map(({node}) => ({
      kind: "node" as const,
      nodeId: node.id,
      includeBackground: !containerIds.has(node.id),
    })),
  ]
}

export function planNodeEditorViewport<
  TNode extends Node,
  TSocket extends Socket,
  TLink extends Link,
>(
  tree: PositionedNodeTree<TNode, TSocket, TLink>,
  transform: NodeCanvasTransform,
  clip?: NodeRect,
): NodeEditorRenderPlan<TNode, TSocket, TLink> {
  const nodes = tree.nodes
    .map((entry) => transformPositionedNode(entry, transform))
    .filter(({rect}) => clip === undefined || intersects(rect, clip))
  const visibleNodeIds = new Set(nodes.map(({node}) => node.id))
  const links = tree.links
    .map((entry) => ({...entry, points: entry.points.map((point) => transformPoint(point, transform))}))
    .filter((entry) => clip === undefined ||
      visibleNodeIds.has(entry.link.from.nodeId) ||
      visibleNodeIds.has(entry.link.to.nodeId) ||
      intersects(pointsBounds(entry.points), clip))
  return {transform, nodes, links}
}

export function fitNodeEditorTransform(
  tree: PositionedNodeTree,
  frame: NodeRect,
  padding = 36,
  minScale = 0.16,
  maxScale = 3,
): NodeCanvasTransform {
  const usableW = Math.max(1, frame.w - Math.max(0, padding) * 2)
  const usableH = Math.max(1, frame.h - Math.max(0, padding) * 2)
  const scale = clamp(
    Math.min(usableW / Math.max(1, tree.bounds.w), usableH / Math.max(1, tree.bounds.h)),
    Math.max(0.01, minScale),
    Math.max(minScale, maxScale),
  )
  return {
    x: frame.x + (frame.w - tree.bounds.w * scale) / 2 - tree.bounds.x * scale,
    y: frame.y + (frame.h - tree.bounds.h * scale) / 2 - tree.bounds.y * scale,
    scale,
  }
}

export function validatePositionedNodeTree(tree: PositionedNodeTree): void {
  requireRect(tree.bounds, "NodeTree bounds")
  const nodeIds = new Set<string>()
  const sockets = new Map<string, Set<string>>()
  for (const entry of tree.nodes) {
    if (!entry.node.id || nodeIds.has(entry.node.id)) throw new Error(`Duplicate or empty Node id: ${entry.node.id}`)
    nodeIds.add(entry.node.id)
    requireRect(entry.rect, `Node rect: ${entry.node.id}`)
    const socketIds = new Set<string>()
    for (const positioned of entry.sockets) {
      if (!positioned.socket.id || socketIds.has(positioned.socket.id)) {
        throw new Error(`Duplicate or empty Socket id: ${entry.node.id}/${positioned.socket.id}`)
      }
      socketIds.add(positioned.socket.id)
      requirePoint(positioned.center, `Socket center: ${entry.node.id}/${positioned.socket.id}`)
      if (!pointOnRectSide(positioned.center, positioned.side, entry.rect)) {
        throw new Error(`Socket is detached from Node side: ${entry.node.id}/${positioned.socket.id}`)
      }
    }
    sockets.set(entry.node.id, socketIds)
  }
  for (const {node} of tree.nodes) {
    if (node.parentId !== undefined && !nodeIds.has(node.parentId)) throw new Error(`Unknown parent Node: ${node.id}/${node.parentId}`)
  }
  const linkIds = new Set<string>()
  for (const entry of tree.links) {
    if (!entry.link.id || linkIds.has(entry.link.id)) throw new Error(`Duplicate or empty Link id: ${entry.link.id}`)
    linkIds.add(entry.link.id)
    for (const endpoint of [entry.link.from, entry.link.to]) {
      if (!sockets.get(endpoint.nodeId)?.has(endpoint.socketId)) {
        throw new Error(`Unknown Link Socket: ${entry.link.id}/${endpoint.nodeId}/${endpoint.socketId}`)
      }
    }
    if (entry.points.length < 2) throw new Error(`Link requires at least two points: ${entry.link.id}`)
    for (const point of entry.points) requirePoint(point, `Link point: ${entry.link.id}`)
  }
}

function emptyNodeTree<
  TNode extends Node,
  TSocket extends Socket,
  TLink extends Link,
>(): PositionedNodeTree<TNode, TSocket, TLink> {
  return {bounds: {x: 0, y: 0, w: 1, h: 1}, nodes: [], links: []}
}

function transformPositionedNode<TNode extends Node, TSocket extends Socket>(
  entry: PositionedNode<TNode, TSocket>,
  transform: NodeCanvasTransform,
): PositionedNode<TNode, TSocket> {
  return {
    node: entry.node,
    rect: transformRect(entry.rect, transform),
    sockets: entry.sockets.map((positioned) => ({
      ...positioned,
      center: transformPoint(positioned.center, transform),
    })),
  }
}

function transformPoint(point: NodePoint, transform: NodeCanvasTransform): NodePoint {
  return {x: transform.x + point.x * transform.scale, y: transform.y + point.y * transform.scale}
}

function transformRect(rect: NodeRect, transform: NodeCanvasTransform): NodeRect {
  return {
    x: transform.x + rect.x * transform.scale,
    y: transform.y + rect.y * transform.scale,
    w: rect.w * transform.scale,
    h: rect.h * transform.scale,
  }
}

function pointsBounds(points: readonly NodePoint[]): NodeRect {
  const xs = points.map(({x}) => x)
  const ys = points.map(({y}) => y)
  if (xs.length === 0) return {x: 0, y: 0, w: 0, h: 0}
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return {x, y, w: Math.max(1, Math.max(...xs) - x), h: Math.max(1, Math.max(...ys) - y)}
}

function intersects(left: NodeRect, right: NodeRect): boolean {
  return left.x + left.w >= right.x && right.x + right.w >= left.x &&
    left.y + left.h >= right.y && right.y + right.h >= left.y
}

function pointOnRectSide(point: NodePoint, side: SocketSide, rect: NodeRect): boolean {
  const epsilon = 1e-6
  if (side === "left" || side === "right") {
    const x = side === "left" ? rect.x : rect.x + rect.w
    return Math.abs(point.x - x) <= epsilon && point.y >= rect.y - epsilon && point.y <= rect.y + rect.h + epsilon
  }
  const y = side === "top" ? rect.y : rect.y + rect.h
  return Math.abs(point.y - y) <= epsilon && point.x >= rect.x - epsilon && point.x <= rect.x + rect.w + epsilon
}

function requireRect(rect: NodeRect, label: string): void {
  requirePoint(rect, label)
  if (!Number.isFinite(rect.w) || !Number.isFinite(rect.h) || rect.w <= 0 || rect.h <= 0) {
    throw new Error(`${label} must have a finite positive size`)
  }
}

function requirePoint(point: NodePoint, label: string): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new Error(`${label} must be finite`)
}

function finite(value: number): number {
  return Number.isFinite(value) ? value : 0
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

export type NodeRendererColor = Color
