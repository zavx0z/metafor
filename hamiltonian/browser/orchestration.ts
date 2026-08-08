import {UiRuntime, flexRow, type UiSurfaceRect} from "@ui/elements"
import {
  ElkNodeSystemLayouter,
  NodeInspectorSurface,
  NodeSystemSurface,
  applyNodeSystemAnchors,
  createNodeSystemRouteRequest,
  measureNodeSystemCard,
  nodeSystemGeometryKey,
  parseNodeSystemRouteResponse,
  resizeNodeSystemNode,
  stabilizeNodeSystemLayout,
  type NodeSystemAction,
  type NodeSystemDocument,
  type NodeSystemNode,
  type NodeSystemNodeMoveEvent,
  type NodeSystemNodeResizeEvent,
  type PositionedNodeSystem,
} from "@ui/node"
import {
  HAMILTONIAN_ORCHESTRATION_CHANNEL,
  OrchestrationEnvelopeCursor,
} from "../core/orchestration.js"
import {
  nodeSystemStructureKey,
  projectHamiltonianTopology,
  refreshPositionedNodeSystem,
} from "./orchestration/projection.ts"
import {
  HAMILTONIAN_NODE_ANCHORS_STORAGE_KEY,
  parseHamiltonianNodeAnchors,
  serializeHamiltonianNodeAnchors,
  withHamiltonianNodeGeometry,
  type HamiltonianNodeGeometries,
} from "./orchestration/anchors.ts"
import {
  HAMILTONIAN_VIEWPORT_STORAGE_KEY,
  parseHamiltonianViewport,
  serializeHamiltonianViewport,
} from "./orchestration/viewport.ts"

type InitialProjection = Readonly<{
  projection: Record<string, unknown>
  revision: number
}>

declare global {
  interface Window {
    __hamiltonianOrchestrationInitial?: InitialProjection
  }
}

const canvas = requiredElement(document.querySelector<HTMLCanvasElement>("#orchestration-canvas"))
const status = requiredElement(document.querySelector<HTMLElement>("#orchestration-status"))

const deviceId = localStorage.getItem("hamiltonian-device") ?? "unknown-device"
const tabId = sessionStorage.getItem("hamiltonian-window-id") ?? "unknown-window"
const cursor = new OrchestrationEnvelopeCursor()
const channel = typeof BroadcastChannel === "function"
  ? new BroadcastChannel(HAMILTONIAN_ORCHESTRATION_CHANNEL)
  : null
const pending: Array<{projection: Record<string, unknown>; revision: number}> = []
let acceptProjection: ((projection: Record<string, unknown>, revision: number) => void) | null = null

function queueProjection(projection: Record<string, unknown>, revision: number): void {
  if (acceptProjection === null) {
    pending.splice(0, pending.length, {projection, revision})
    return
  }
  acceptProjection(projection, revision)
}

channel?.addEventListener("message", (event) => {
  const envelope = cursor.accept(event.data)
  if (envelope === null) return
  queueProjection(envelope.projection, envelope.revision)
})

window.addEventListener("hamiltonian-orchestration-initial", ((event: CustomEvent<InitialProjection>) => {
  queueProjection(event.detail.projection, event.detail.revision)
}) as EventListener)
if (window.__hamiltonianOrchestrationInitial !== undefined) {
  queueProjection(
    window.__hamiltonianOrchestrationInitial.projection,
    window.__hamiltonianOrchestrationInitial.revision,
  )
}

void start().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  status.textContent = `WebGPU orchestration unavailable · ${message}`
  status.dataset.state = "error"
  document.body.classList.add("orchestration-failed")
})

async function start(): Promise<void> {
  status.textContent = "Starting MetaFor WebGPU HUD…"
  const runtime = await UiRuntime.create(canvas, {
    fontUrl: "/engine-static/JetBrainsMono-Bold.ttf",
    inputProxy: false,
  })
  let layout: PositionedNodeSystem | null = null
  let structureKey: string | null = null
  let updateGeneration = 0
  let anchors = loadNodeAnchors()
  let restoredViewport = loadObserverViewport()

  const inspector = new NodeInspectorSurface({
    title: "HAMILTONIAN INSPECTOR",
    onAction: (node, action) => dispatchAction(node, action),
  })
  const graph = new NodeSystemSurface({
    title: "HAMILTONIAN · LIVE ORCHESTRATION",
    minScale: 0.12,
    maxScale: 2.5,
    onSelectionChange(nodeId) {
      inspector.inspect(layout?.nodes.find((entry) => entry.node.id === nodeId)?.node ?? null)
    },
    onNodeMove(event) {
      void applyNodeMove(event)
    },
    onNodeResize(event) {
      void applyNodeResize(event)
    },
    onViewportChange(viewport) {
      persistObserverViewport(viewport)
      document.documentElement.dataset.hamiltonianViewport = "saved"
    },
  })
  const layouter = new ElkNodeSystemLayouter({
    direction: "RIGHT",
    nodeSpacing: 52,
    layerSpacing: 94,
    padding: 48,
    measureText: graph.textMeasurer,
  })

  runtime.addHudSurface(graph, ({w, h}) => orchestrationWorkspace(w, h).graph, {
    windowId: "hamiltonian-orchestration",
    zIndex: 0,
  })
  runtime.addHudSurface(inspector, ({w, h}) => orchestrationWorkspace(w, h).inspector, {
    windowId: "hamiltonian-orchestration",
    zIndex: 1,
  })

  const resizeObserver = new ResizeObserver(() => runtime.handleResize())
  resizeObserver.observe(canvas)
  runtime.handleResize()
  runtime.requestRender()
  status.textContent = "Waiting for the Service Worker topology…"
  status.dataset.state = "waiting"

  acceptProjection = (projection, revision) => {
    const generation = ++updateGeneration
    const document = projectHamiltonianTopology(projection, {
      origin: location.origin,
      deviceId,
      tabId,
    }, revision)
    const nextStructureKey = [
      nodeSystemStructureKey(document),
      nodeSystemGeometryKey(document, graph.textMeasurer),
    ].join("\u0000")
    void applyDocument(document, nextStructureKey, generation).catch((error: unknown) => {
      if (generation !== updateGeneration) return
      status.textContent = `Topology layout failed · ${error instanceof Error ? error.message : String(error)}`
      status.dataset.state = "error"
    })
  }
  for (const item of pending.splice(0)) acceptProjection(item.projection, item.revision)

  async function applyDocument(document: NodeSystemDocument, nextStructureKey: string, generation: number): Promise<void> {
    const preserveViewport = layout !== null && graph.hasMaterializedViewport
    const previousViewport = graph.viewport
    let nextLayout: PositionedNodeSystem
    if (layout !== null && structureKey === nextStructureKey) {
      nextLayout = refreshPositionedNodeSystem(layout, document)
      // Persisted presentation geometry is an invariant, not only an initial
      // layout hint. Re-apply and reroute if any refresh ever drifts from it.
      if (hasHamiltonianNodeGeometryMismatch(nextLayout, anchors, graph)) {
        nextLayout = await routeNodeSystemOnHost(applyHamiltonianNodeGeometries(nextLayout, anchors, graph))
      }
    } else {
      const proposed = await layouter.layout(document)
      const stable = layout === null ? proposed : stabilizeNodeSystemLayout(layout, proposed)
      // An explicit user anchor wins over automatic insertion collision
      // avoidance. Libavoid will route around the resulting fixed obstacle.
      const fixed = applyHamiltonianNodeGeometries(stable, anchors, graph)
      nextLayout = await routeNodeSystemOnHost(fixed)
    }
    if (generation !== updateGeneration) return
    layout = nextLayout
    structureKey = nextStructureKey
    graph.setLayout(nextLayout)
    if (restoredViewport !== null) {
      graph.setViewport(restoredViewport)
      restoredViewport = null
      globalThis.document.documentElement.dataset.hamiltonianViewport = "restored"
    } else if (preserveViewport) {
      graph.setViewport(previousViewport)
    }
    inspector.inspect(graph.selectedNode?.node ?? null)
    status.textContent = `${nextLayout.nodes.length} nodes · ${nextLayout.edges.length} links · live`
    status.dataset.state = "live"
    documentElementEvidence(nextLayout, revisionLabel(document.revision), anchors)
  }

  async function applyNodeMove(event: NodeSystemNodeMoveEvent): Promise<void> {
    layout = event.layout
    inspector.inspect(graph.selectedNode?.node ?? null)
    status.textContent = event.phase === "move"
      ? `Moving ${event.nodeIds.length} node${event.nodeIds.length === 1 ? "" : "s"}…`
      : `Routing ${event.nodeIds.length} node${event.nodeIds.length === 1 ? "" : "s"}…`
    status.dataset.state = "moving"
    if (event.phase === "move") return

    await persistAndRouteNodeGeometry(event.layout, event.nodeIds)
  }

  async function applyNodeResize(event: NodeSystemNodeResizeEvent): Promise<void> {
    layout = event.layout
    inspector.inspect(graph.selectedNode?.node ?? null)
    status.textContent = event.phase === "resize" ? `Resizing ${event.nodeId}…` : `Routing ${event.nodeId}…`
    status.dataset.state = "moving"
    if (event.phase === "resize") return

    await persistAndRouteNodeGeometry(event.layout, [event.nodeId])
  }

  async function persistAndRouteNodeGeometry(
    eventLayout: PositionedNodeSystem,
    nodeIds: readonly string[],
  ): Promise<void> {
    for (const nodeId of nodeIds) {
      const entry = eventLayout.nodes.find(({node}) => node.id === nodeId)
      if (entry === undefined) continue
      anchors = withHamiltonianNodeGeometry(anchors, nodeId, {
        x: entry.rect.x,
        y: entry.rect.y,
        width: entry.rect.w,
      })
    }
    persistNodeAnchors(anchors)
    document.documentElement.dataset.hamiltonianAnchors = String(anchors.size)

    const generation = ++updateGeneration
    const previousViewport = graph.viewport
    try {
      const routed = await routeNodeSystemOnHost(eventLayout)
      if (generation !== updateGeneration) return
      layout = routed
      graph.setLayout(routed)
      graph.setViewport(previousViewport)
      inspector.inspect(graph.selectedNode?.node ?? null)
      status.textContent = `${routed.nodes.length} nodes · ${routed.edges.length} links · saved`
      status.dataset.state = "live"
      documentElementEvidence(routed, revisionLabel(routed.revision), anchors)
    } catch (error: unknown) {
      if (generation !== updateGeneration) return
      status.textContent = `Position saved; reroute failed · ${error instanceof Error ? error.message : String(error)}`
      status.dataset.state = "error"
    }
  }

  window.addEventListener("pagehide", () => {
    resizeObserver.disconnect()
    channel?.close()
    layouter.dispose()
    runtime.dispose()
  }, {once: true})
}

function loadNodeAnchors(): Map<string, Readonly<{x: number; y: number; width?: number}>> {
  try {
    return parseHamiltonianNodeAnchors(localStorage.getItem(HAMILTONIAN_NODE_ANCHORS_STORAGE_KEY))
  } catch {
    return new Map()
  }
}

function persistNodeAnchors(anchors: HamiltonianNodeGeometries): void {
  try {
    localStorage.setItem(HAMILTONIAN_NODE_ANCHORS_STORAGE_KEY, serializeHamiltonianNodeAnchors(anchors))
  } catch {
    // Private/locked-down storage must not disable the live orchestration scene.
  }
}

function loadObserverViewport(): ReturnType<typeof parseHamiltonianViewport> {
  try {
    return parseHamiltonianViewport(sessionStorage.getItem(HAMILTONIAN_VIEWPORT_STORAGE_KEY))
  } catch {
    return null
  }
}

function persistObserverViewport(viewport: Readonly<{x: number; y: number; scale: number}>): void {
  try {
    sessionStorage.setItem(HAMILTONIAN_VIEWPORT_STORAGE_KEY, serializeHamiltonianViewport(viewport))
  } catch {
    // View persistence is optional presentation state, never a scene blocker.
  }
}

async function routeNodeSystemOnHost(layout: PositionedNodeSystem): Promise<PositionedNodeSystem> {
  const response = await fetch("/node-system/route", {
    method: "POST",
    headers: {"content-type": "application/json"},
    body: JSON.stringify(createNodeSystemRouteRequest(layout)),
  })
  if (!response.ok) throw new Error(`Libavoid ${response.status}: ${await response.text()}`)
  return parseNodeSystemRouteResponse(await response.json()).layout
}

function applyHamiltonianNodeGeometries(
  layout: PositionedNodeSystem,
  geometries: HamiltonianNodeGeometries,
  graph: NodeSystemSurface,
): PositionedNodeSystem {
  let result = applyNodeSystemAnchors(layout, geometries)
  for (const [nodeId, geometry] of [...geometries].sort(([left], [right]) => left.localeCompare(right))) {
    if (geometry.width === undefined) continue
    const entry = result.nodes.find(({node}) => node.id === nodeId)
    if (entry === undefined) continue
    const minimum = measureNodeSystemCard(entry.node, graph.textMeasurer).width
    result = resizeNodeSystemNode(result, nodeId, {x: geometry.x, w: Math.max(minimum, geometry.width)})
  }
  return result
}

function hasHamiltonianNodeGeometryMismatch(
  layout: PositionedNodeSystem,
  geometries: HamiltonianNodeGeometries,
  graph: NodeSystemSurface,
): boolean {
  return [...geometries].some(([nodeId, geometry]) => {
    const entry = layout.nodes.find(({node}) => node.id === nodeId)
    if (entry === undefined) return false
    const expectedWidth = geometry.width === undefined
      ? entry.rect.w
      : Math.max(measureNodeSystemCard(entry.node, graph.textMeasurer).width, geometry.width)
    return Math.abs(entry.rect.x - geometry.x) >= 1e-6 ||
      Math.abs(entry.rect.y - geometry.y) >= 1e-6 ||
      Math.abs(entry.rect.w - expectedWidth) >= 1e-6
  })
}

function inspectorWidth(width: number): number {
  if (width < 720) return Math.min(250, Math.max(190, width * 0.38))
  return Math.min(360, Math.max(280, width * 0.28))
}

function orchestrationWorkspace(width: number, height: number): {graph: UiSurfaceRect; inspector: UiSurfaceRect} {
  let graph: UiSurfaceRect = {x: 0, y: 0, w: Math.max(1, width), h: Math.max(1, height)}
  let inspector: UiSurfaceRect = {x: Math.max(0, width - 1), y: 0, w: 1, h: Math.max(1, height)}
  flexRow({
    x: 0,
    y: 0,
    w: width,
    h: height,
    gap: 1,
    alignItems: "stretch",
    items: [
      {width: "grow", height, draw: (x, y, w, h) => { graph = {x, y, w: Math.max(1, w), h: Math.max(1, h)} }},
      {width: inspectorWidth(width), height, draw: (x, y, w, h) => { inspector = {x, y, w: Math.max(1, w), h: Math.max(1, h)} }},
    ],
  })
  return {graph, inspector}
}

function dispatchAction(node: NodeSystemNode, action: NodeSystemAction): void {
  window.dispatchEvent(new CustomEvent("hamiltonian-orchestration-action", {
    detail: {nodeId: node.id, actionId: action.id},
  }))
}

function documentElementEvidence(
  layout: PositionedNodeSystem,
  revision: string,
  anchors: HamiltonianNodeGeometries,
): void {
  document.documentElement.dataset.hamiltonianScene = "ready"
  document.documentElement.dataset.hamiltonianNodes = String(layout.nodes.length)
  document.documentElement.dataset.hamiltonianEdges = String(layout.edges.length)
  document.documentElement.dataset.hamiltonianRevision = revision
  document.documentElement.dataset.hamiltonianAnchors = String(anchors.size)
  const known = [...anchors].flatMap(([nodeId, point]) => {
    const node = layout.nodes.find((entry) => entry.node.id === nodeId)
    return node === undefined ? [] : [{node, point}]
  })
  document.documentElement.dataset.hamiltonianKnownAnchors = String(known.length)
  document.documentElement.dataset.hamiltonianPositionsApplied = String(known.filter(({node, point}) =>
    Math.abs(node.rect.x - point.x) < 1e-6 && Math.abs(node.rect.y - point.y) < 1e-6
  ).length)
  document.documentElement.dataset.hamiltonianWidthsApplied = String(known.filter(({node, point}) =>
    point.width !== undefined && Math.abs(node.rect.w - point.width) < 1e-6
  ).length)
  document.documentElement.dataset.hamiltonianAnchorsApplied = String(known.filter(({node, point}) =>
      Math.abs(node.rect.x - point.x) < 1e-6 &&
      Math.abs(node.rect.y - point.y) < 1e-6 &&
      (point.width === undefined || Math.abs(node.rect.w - point.width) < 1e-6)
  ).length)
  document.documentElement.dataset.hamiltonianWidths = String([...anchors.values()].filter(({width}) => width !== undefined).length)
}

function revisionLabel(value: string | number | undefined): string {
  return value === undefined ? "unknown" : String(value)
}

function requiredElement<T extends Element>(value: T | null): T {
  if (value === null) throw new Error("Hamiltonian orchestration shell is incomplete")
  return value
}
