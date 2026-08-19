import {Color} from "@metafor/engine"
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

export type Parameter = Readonly<{
  id: string
}>

/** Minimal Blender-like component identity; domain data is carried by TNode. */
export type Node = Readonly<{
  id: string
  frameId?: string
  parameters?: readonly Parameter[]
}>

/** Visual owner of nested Frames and Nodes; it is not a computation Node. */
export type Frame = Readonly<{
  id: string
  parentFrameId?: string
}>

export type SocketDirection = "input" | "output" | "bidirectional"
export type SocketSide = "left" | "right"
export type SocketShape = "circle" | "square" | "diamond" | "circle-dot" | "square-dot" | "diamond-dot" | "line" | "volume-grid"

/** Visible connection endpoint; layout Port remains an independent lower-level term. */
export type Socket = Readonly<{
  id: string
  direction: SocketDirection
  parameterId?: string
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
  TFrame extends Frame = Frame,
> = Readonly<{
  revision?: string | number
  frames: readonly TFrame[]
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

export type PositionedFrame<TFrame extends Frame = Frame> = Readonly<{
  frame: TFrame
  rect: NodeRect
}>

export type PositionedLink<TLink extends Link = Link> = Readonly<{
  link: TLink
  points: readonly NodePoint[]
}>

export type PositionedNodeTree<
  TNode extends Node = Node,
  TSocket extends Socket = Socket,
  TLink extends Link = Link,
  TFrame extends Frame = Frame,
> = Readonly<{
  revision?: string | number
  bounds: NodeRect
  frames: readonly PositionedFrame<TFrame>[]
  nodes: readonly PositionedNode<TNode, TSocket>[]
  links: readonly PositionedLink<TLink>[]
}>

export type NodeEditorSelection =
  | Readonly<{kind: "frame"; id: string}>
  | Readonly<{kind: "link"; id: string}>
  | Readonly<{kind: "node"; id: string}>
  | null

export type FrameRendererContext<TFrame extends Frame> = Readonly<{
  host: UiSurface
  entry: PositionedFrame<TFrame>
  scale: number
  selected: boolean
}>

export type NodeRendererContext<TNode extends Node, TSocket extends Socket> = Readonly<{
  host: UiSurface
  entry: PositionedNode<TNode, TSocket>
  connectedSocketIds: ReadonlySet<string>
  scale: number
  selected: boolean
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

export type FrameRenderer<TFrame extends Frame> = Readonly<{
  renderBackground(context: FrameRendererContext<TFrame>): void
  renderForeground(context: FrameRendererContext<TFrame>): void
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
  TFrame extends Frame = Frame,
> = Readonly<{
  frame: FrameRenderer<TFrame>
  node: NodeRenderer<TNode, TSocket>
  socket: SocketRenderer<TSocket>
  link: LinkRenderer<TLink>
}>

export type NodeEditorRenderPlan<
  TNode extends Node,
  TSocket extends Socket,
  TLink extends Link,
  TFrame extends Frame = Frame,
> = Readonly<{
  transform: NodeCanvasTransform
  frames: readonly PositionedFrame<TFrame>[]
  nodes: readonly PositionedNode<TNode, TSocket>[]
  links: readonly PositionedLink<TLink>[]
}>

export type NodeEditorPaintStep =
  | Readonly<{kind: "frame-background"; frameId: string}>
  | Readonly<{kind: "links"}>
  | Readonly<{kind: "frame-foreground"; frameId: string}>
  | Readonly<{kind: "node"; nodeId: string}>

export type NodeEditorGridPoint = Readonly<{x: number; y: number; major: boolean}>

export type NodeCanvasOptions<
  TNode extends Node,
  TSocket extends Socket,
  TLink extends Link,
  TFrame extends Frame = Frame,
> = UiSurfaceOpts & Readonly<{
  renderers: NodeEditorRenderers<TNode, TSocket, TLink, TFrame>
  title?: string
  toolbar?: boolean
  minScale?: number
  maxScale?: number
  messages?: Readonly<{empty?: string; interactionHint?: string}>
  onSelectionChange?(selection: NodeEditorSelection): void
  onCanvasTransformChange?(transform: NodeCanvasTransform): void
}>

export type NodeEditorOptions<
  TNode extends Node,
  TSocket extends Socket,
  TLink extends Link,
  TFrame extends Frame = Frame,
> = NodeCanvasOptions<TNode, TSocket, TLink, TFrame>

const DEFAULT_TRANSFORM: NodeCanvasTransform = Object.freeze({x: 0, y: 0, scale: 1})
const TOOLBAR_HEIGHT = 38
const EMPTY_IDS: ReadonlySet<string> = new Set()

/** Read-only Blender-like Node canvas with no layout or product dependency. */
export class NodeCanvas<
  TNode extends Node,
  TSocket extends Socket,
  TLink extends Link,
  TFrame extends Frame = Frame,
> extends UiSurface {
  readonly #renderers: NodeEditorRenderers<TNode, TSocket, TLink, TFrame>
  readonly #title: string
  readonly #toolbar: boolean
  readonly #minScale: number
  readonly #maxScale: number
  readonly #emptyMessage: string
  readonly #interactionHint: string
  readonly #onSelectionChange: ((selection: NodeEditorSelection) => void) | undefined
  readonly #onCanvasTransformChange: ((transform: NodeCanvasTransform) => void) | undefined
  #tree: PositionedNodeTree<TNode, TSocket, TLink, TFrame>
  #transform = DEFAULT_TRANSFORM
  #selection: NodeEditorSelection = null
  #fitPending = true
  #lastFrame = {w: 0, h: 0}

  constructor(options: NodeCanvasOptions<TNode, TSocket, TLink, TFrame>) {
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
    this.#tree = emptyNodeTree<TNode, TSocket, TLink, TFrame>()
    this.node.name = "NodeCanvas"
  }

  get tree(): PositionedNodeTree<TNode, TSocket, TLink, TFrame> {
    return this.#tree
  }

  get canvasTransform(): NodeCanvasTransform {
    return this.#transform
  }

  get selection(): NodeEditorSelection {
    return this.#selection
  }

  setTree(tree: PositionedNodeTree<TNode, TSocket, TLink, TFrame>): void {
    validatePositionedNodeTree(tree)
    this.#tree = tree
    if (this.#selection !== null && !selectionExists(tree, this.#selection)) {
      this.#selection = null
      this.#onSelectionChange?.(null)
    }
    this.#fitPending = true
    this.requestRender()
  }

  select(selection: NodeEditorSelection): boolean {
    if (selection !== null && !selectionExists(this.#tree, selection)) return false
    if (sameSelection(selection, this.#selection)) return true
    this.#selection = selection
    this.#onSelectionChange?.(selection)
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

  renderPlan(): NodeEditorRenderPlan<TNode, TSocket, TLink, TFrame> {
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
    this.withLayer("underlay", () => this.drawRect(0, 0, this.rectW, this.rectH, new Color(0.075, 0.073, 0.071, 1), Z.CONTAINER))
    if (this.#toolbar) this.#drawToolbar()
    const content = this.#contentRect()
    this.withLayer("underlay", () => drawNodeEditorGrid(this, content, this.#transform))
    this.pushClip(content.x, content.y, content.w, content.h)
    try {
      const plan = this.renderPlan()
      const visibleById = new Map(plan.nodes.map((entry) => [entry.node.id, entry] as const))
      const visibleFramesById = new Map(plan.frames.map((entry) => [entry.frame.id, entry] as const))
      const connectedByNode = connectedSocketIdsByNode(this.#tree.links)
      if (this.interactive()) this.hit(content.x, content.y, content.w, content.h, () => this.select(null), {
        key: "node-editor:background",
        cursor: "default",
      })
      for (const step of planNodeEditorPaintSteps(this.#tree.frames, plan.frames, plan.nodes)) {
        if (step.kind === "frame-background") {
          const entry = visibleFramesById.get(step.frameId)
          if (entry !== undefined) this.withLayer("underlay", () => this.#renderers.frame.renderBackground({
            host: this,
            entry,
            scale: plan.transform.scale,
            selected: isSelected(this.#selection, "frame", entry.frame.id),
          }))
          continue
        }
        if (step.kind === "links") {
          this.withLayer("contentUnderlay", () => {
            const links = orderNodeEditorLinksForPaint(plan.links, this.#selection)
            for (const entry of links) {
              const selected = isSelected(this.#selection, "link", entry.link.id)
              this.#renderers.link.render({host: this, entry, scale: plan.transform.scale, selected})
              if (this.interactive()) planNodeEditorLinkHitRects(entry.points, Math.max(6, 8 * plan.transform.scale)).forEach((rect, index) => {
                this.hit(rect.x, rect.y, rect.w, rect.h, () => this.select({kind: "link", id: entry.link.id}), {
                  key: `node-editor:link:${entry.link.id}:${index}`,
                  cursor: "pointer",
                })
              })
            }
          })
          continue
        }
        if (step.kind === "frame-foreground") {
          const entry = visibleFramesById.get(step.frameId)
          if (entry === undefined) continue
          this.#renderers.frame.renderForeground({
            host: this,
            entry,
            scale: plan.transform.scale,
            selected: isSelected(this.#selection, "frame", entry.frame.id),
          })
          if (this.interactive()) this.hit(entry.rect.x, entry.rect.y, entry.rect.w, Math.min(entry.rect.h, Math.max(28, 36 * plan.transform.scale)), () => this.select({kind: "frame", id: entry.frame.id}), {
            key: `node-editor:frame:${entry.frame.id}`,
            cursor: "pointer",
          })
          continue
        }
        const entry = visibleById.get(step.nodeId)
        if (entry === undefined) continue
        const context: NodeRendererContext<TNode, TSocket> = {
          host: this,
          entry,
          connectedSocketIds: connectedByNode.get(entry.node.id) ?? EMPTY_IDS,
          scale: plan.transform.scale,
          selected: isSelected(this.#selection, "node", entry.node.id),
        }
        this.#renderers.node.renderBackground(context)
        this.#renderers.node.renderForeground(context)
        for (const socket of entry.sockets) this.#renderers.socket.render({
          host: this,
          entry: socket,
          scale: plan.transform.scale,
          selected: context.selected,
          nodeId: entry.node.id,
        })
        if (this.interactive()) this.hit(entry.rect.x, entry.rect.y, entry.rect.w, entry.rect.h, () => this.select({kind: "node", id: entry.node.id}), {
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
  TFrame extends Frame = Frame,
> extends NodeCanvas<TNode, TSocket, TLink, TFrame> {
  constructor(options: NodeEditorOptions<TNode, TSocket, TLink, TFrame>) {
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

export function planNodeEditorGrid(frame: NodeRect, transform: NodeCanvasTransform): readonly NodeEditorGridPoint[] {
  let step = 24 * Math.max(0.01, transform.scale)
  while (step < 16) step *= 2
  while (step > 32) step /= 2
  const startX = frame.x + positiveModulo(transform.x - frame.x, step)
  const startY = frame.y + positiveModulo(transform.y - frame.y, step)
  const points: NodeEditorGridPoint[] = []
  for (let y = startY, row = 0; y <= frame.y + frame.h && points.length < 5000; y += step, row += 1) {
    for (let x = startX, column = 0; x <= frame.x + frame.w && points.length < 5000; x += step, column += 1) {
      points.push({x, y, major: row % 4 === 0 && column % 4 === 0})
    }
  }
  return points
}

export function planNodeEditorLinkHitRects(points: readonly NodePoint[], radius = 8): readonly NodeRect[] {
  const padding = Math.max(1, Number.isFinite(radius) ? radius : 8)
  const rects: NodeRect[] = []
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1]!
    const to = points[index]!
    if (from.x === to.x && from.y === to.y) continue
    rects.push({
      x: Math.min(from.x, to.x) - padding,
      y: Math.min(from.y, to.y) - padding,
      w: Math.abs(to.x - from.x) + padding * 2,
      h: Math.abs(to.y - from.y) + padding * 2,
    })
  }
  return rects
}

export function orderNodeEditorLinksForPaint<TLink extends Link>(
  links: readonly PositionedLink<TLink>[],
  selection: NodeEditorSelection,
): readonly PositionedLink<TLink>[] {
  if (selection?.kind !== "link") return links
  return [
    ...links.filter(({link}) => link.id !== selection.id),
    ...links.filter(({link}) => link.id === selection.id),
  ]
}

export function planNodeEditorPaintSteps<
  TNode extends Node,
  TSocket extends Socket,
  TFrame extends Frame,
>(
  allFrames: readonly PositionedFrame<TFrame>[],
  visibleFrames: readonly PositionedFrame<TFrame>[] = allFrames,
  visibleNodes: readonly PositionedNode<TNode, TSocket>[] = [],
): readonly NodeEditorPaintStep[] {
  const allById = new Map(allFrames.map((entry) => [entry.frame.id, entry] as const))
  const order = new Map(visibleFrames.map((entry, index) => [entry.frame.id, index] as const))
  const depthMemo = new Map<string, number>()
  const depth = (frameId: string, visiting = new Set<string>()): number => {
    const cached = depthMemo.get(frameId)
    if (cached !== undefined) return cached
    if (visiting.has(frameId)) return 0
    const parentId = allById.get(frameId)?.frame.parentFrameId
    if (parentId === undefined || !allById.has(parentId)) return 0
    const next = new Set(visiting)
    next.add(frameId)
    const value = depth(parentId, next) + 1
    depthMemo.set(frameId, value)
    return value
  }
  const frames = [...visibleFrames].sort((left, right) =>
    depth(left.frame.id) - depth(right.frame.id) ||
    (order.get(left.frame.id) ?? 0) - (order.get(right.frame.id) ?? 0))
  return [
    ...frames.map(({frame}) => ({
      kind: "frame-background" as const,
      frameId: frame.id,
    })),
    {kind: "links" as const},
    ...frames.map(({frame}) => ({
      kind: "frame-foreground" as const,
      frameId: frame.id,
    })),
    ...visibleNodes.map(({node}) => ({
      kind: "node" as const,
      nodeId: node.id,
    })),
  ]
}

export function planNodeEditorViewport<
  TNode extends Node,
  TSocket extends Socket,
  TLink extends Link,
  TFrame extends Frame,
>(
  tree: PositionedNodeTree<TNode, TSocket, TLink, TFrame>,
  transform: NodeCanvasTransform,
  clip?: NodeRect,
): NodeEditorRenderPlan<TNode, TSocket, TLink, TFrame> {
  const frames = tree.frames
    .map((entry) => transformPositionedFrame(entry, transform))
    .filter(({rect}) => clip === undefined || intersects(rect, clip))
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
  return {transform, frames, nodes, links}
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
  const frameIds = new Set<string>()
  const frameById = new Map<string, PositionedFrame>()
  for (const entry of tree.frames) {
    if (!entry.frame.id || frameIds.has(entry.frame.id)) throw new Error(`Duplicate or empty Frame id: ${entry.frame.id}`)
    frameIds.add(entry.frame.id)
    frameById.set(entry.frame.id, entry)
    requireRect(entry.rect, `Frame rect: ${entry.frame.id}`)
  }
  for (const entry of tree.frames) {
    const parentFrameId = entry.frame.parentFrameId
    if (parentFrameId === undefined) continue
    const parent = frameById.get(parentFrameId)
    if (parent === undefined) throw new Error(`Unknown parent Frame: ${entry.frame.id}/${parentFrameId}`)
    if (!rectContains(parent.rect, entry.rect)) throw new Error(`Nested Frame is outside parent: ${entry.frame.id}/${parentFrameId}`)
  }
  for (const frameId of frameIds) validateFrameAncestry(frameId, frameById)
  const nodeIds = new Set<string>()
  const sockets = new Map<string, Set<string>>()
  for (const entry of tree.nodes) {
    if (!entry.node.id || nodeIds.has(entry.node.id)) throw new Error(`Duplicate or empty Node id: ${entry.node.id}`)
    if (frameIds.has(entry.node.id)) throw new Error(`Frame and Node ids must be distinct: ${entry.node.id}`)
    nodeIds.add(entry.node.id)
    requireRect(entry.rect, `Node rect: ${entry.node.id}`)
    const parameterIds = new Set<string>()
    for (const parameter of entry.node.parameters ?? []) {
      if (!parameter.id || parameterIds.has(parameter.id)) {
        throw new Error(`Duplicate or empty Parameter id: ${entry.node.id}/${parameter.id}`)
      }
      parameterIds.add(parameter.id)
    }
    if (entry.node.frameId !== undefined) {
      const frame = frameById.get(entry.node.frameId)
      if (frame === undefined) throw new Error(`Unknown Node Frame: ${entry.node.id}/${entry.node.frameId}`)
      if (!rectContains(frame.rect, entry.rect)) throw new Error(`Node is outside Frame: ${entry.node.id}/${entry.node.frameId}`)
    }
    const socketIds = new Set<string>()
    const parameterSides = new Set<string>()
    for (const positioned of entry.sockets) {
      if (!positioned.socket.id || socketIds.has(positioned.socket.id)) {
        throw new Error(`Duplicate or empty Socket id: ${entry.node.id}/${positioned.socket.id}`)
      }
      socketIds.add(positioned.socket.id)
      if (positioned.socket.parameterId !== undefined) {
        if (!parameterIds.has(positioned.socket.parameterId)) {
          throw new Error(`Unknown Socket Parameter: ${entry.node.id}/${positioned.socket.id}/${positioned.socket.parameterId}`)
        }
        const key = `${positioned.socket.parameterId}:${positioned.side}`
        if (parameterSides.has(key)) {
          throw new Error(`Duplicate Parameter Socket side: ${entry.node.id}/${key}`)
        }
        parameterSides.add(key)
      }
      requirePoint(positioned.center, `Socket center: ${entry.node.id}/${positioned.socket.id}`)
      if (!pointOnRectSide(positioned.center, positioned.side, entry.rect)) {
        throw new Error(`Socket is detached from Node side: ${entry.node.id}/${positioned.socket.id}`)
      }
    }
    sockets.set(entry.node.id, socketIds)
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
  TFrame extends Frame,
>(): PositionedNodeTree<TNode, TSocket, TLink, TFrame> {
  return {bounds: {x: 0, y: 0, w: 1, h: 1}, frames: [], nodes: [], links: []}
}

function transformPositionedFrame<TFrame extends Frame>(
  entry: PositionedFrame<TFrame>,
  transform: NodeCanvasTransform,
): PositionedFrame<TFrame> {
  return {frame: entry.frame, rect: transformRect(entry.rect, transform)}
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

function rectContains(parent: NodeRect, child: NodeRect): boolean {
  const epsilon = 1e-6
  return child.x >= parent.x - epsilon && child.y >= parent.y - epsilon &&
    child.x + child.w <= parent.x + parent.w + epsilon &&
    child.y + child.h <= parent.y + parent.h + epsilon
}

function validateFrameAncestry(frameId: string, frames: ReadonlyMap<string, PositionedFrame>): void {
  const visited = new Set<string>([frameId])
  let parentFrameId = frames.get(frameId)?.frame.parentFrameId
  while (parentFrameId !== undefined) {
    if (visited.has(parentFrameId)) throw new Error(`Cyclic Frame ancestry: ${frameId}/${parentFrameId}`)
    visited.add(parentFrameId)
    parentFrameId = frames.get(parentFrameId)?.frame.parentFrameId
  }
}

function selectionExists(tree: PositionedNodeTree, selection: Exclude<NodeEditorSelection, null>): boolean {
  if (selection.kind === "frame") return tree.frames.some(({frame}) => frame.id === selection.id)
  if (selection.kind === "link") return tree.links.some(({link}) => link.id === selection.id)
  return tree.nodes.some(({node}) => node.id === selection.id)
}

function sameSelection(left: NodeEditorSelection, right: NodeEditorSelection): boolean {
  if (left === null || right === null) return left === right
  return left.kind === right.kind && left.id === right.id
}

function isSelected(selection: NodeEditorSelection, kind: Exclude<NodeEditorSelection, null>["kind"], id: string): boolean {
  return selection?.kind === kind && selection.id === id
}

function connectedSocketIdsByNode<TLink extends Link>(links: readonly PositionedLink<TLink>[]): ReadonlyMap<string, ReadonlySet<string>> {
  const mutable = new Map<string, Set<string>>()
  for (const {link} of links) {
    for (const endpoint of [link.from, link.to]) {
      let ids = mutable.get(endpoint.nodeId)
      if (ids === undefined) {
        ids = new Set()
        mutable.set(endpoint.nodeId, ids)
      }
      ids.add(endpoint.socketId)
    }
  }
  return mutable
}

function drawNodeEditorGrid(host: UiSurface, frame: NodeRect, transform: NodeCanvasTransform): void {
  host.drawRect(frame.x, frame.y, frame.w, frame.h, new Color(0.075, 0.073, 0.071, 1), Z.CONTAINER)
  for (const point of planNodeEditorGrid(frame, transform)) {
    const size = point.major ? 1.8 : 1.1
    const color = point.major
      ? new Color(0.22, 0.22, 0.22, 0.72)
      : new Color(0.16, 0.16, 0.16, 0.52)
    host.drawRoundedRect(point.x - size / 2, point.y - size / 2, size, size, {
      radius: size / 2,
      fill: color,
      border: null,
      z: Z.CONTAINER + 0.01,
    })
  }
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor
}

function pointOnRectSide(point: NodePoint, side: SocketSide, rect: NodeRect): boolean {
  const epsilon = 1e-6
  const x = side === "left" ? rect.x : rect.x + rect.w
  return Math.abs(point.x - x) <= epsilon && point.y >= rect.y - epsilon && point.y <= rect.y + rect.h + epsilon
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
