import {UiRuntime, uiIcons, type UiSurfaceRect} from "@ui/elements"
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
  hamiltonianWindowNodeId,
  nodeSystemStructureKey,
  projectHamiltonianTopology,
  refreshPositionedNodeSystem,
} from "./orchestration/projection.ts"
import {shouldRetainMissingLocalWindowSelection} from "./orchestration/selection-retention.ts"
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
import {
  HAMILTONIAN_INSPECTOR_PRESENTATION_STORAGE_KEY,
  parseHamiltonianInspectorPresentation,
  serializeHamiltonianInspectorPresentation,
  type HamiltonianInspectorPresentation,
} from "./orchestration/inspector-presentation.ts"
import {planHamiltonianOrchestrationWorkspace} from "./orchestration/workspace.ts"

declare global {
  interface Window {
    __hamiltonianOrchestrationInitial?: unknown
  }
}

const canvas = requiredElement(document.querySelector<HTMLCanvasElement>("#orchestration-canvas"))
const status = requiredElement(document.querySelector<HTMLElement>("#orchestration-status"))

const deviceId = localStorage.getItem("hamiltonian-device") ?? "unknown-device"
const tabId = sessionStorage.getItem("hamiltonian-window-id") ?? "unknown-window"
const localWindowNodeId = hamiltonianWindowNodeId(deviceId, tabId)
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

function receiveOrchestrationEnvelope(value: unknown): void {
  const envelope = cursor.accept(value)
  if (envelope === null) return
  document.documentElement.dataset.hamiltonianEnvelopeSource = envelope.sourceId
  document.documentElement.dataset.hamiltonianEnvelopeRevision = String(envelope.revision)
  queueProjection(envelope.projection, envelope.revision)
}

channel?.addEventListener("message", (event) => {
  receiveOrchestrationEnvelope(event.data)
})

window.addEventListener("hamiltonian-orchestration-initial", ((event: CustomEvent<unknown>) => {
  receiveOrchestrationEnvelope(event.detail)
}) as EventListener)
if (window.__hamiltonianOrchestrationInitial !== undefined) {
  receiveOrchestrationEnvelope(window.__hamiltonianOrchestrationInitial)
}

void start().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  status.textContent = `WebGPU-оркестрация недоступна · ${message}`
  status.dataset.state = "error"
  document.body.classList.add("orchestration-failed")
})

async function start(): Promise<void> {
  status.textContent = "Запуск WebGPU HUD MetaFor…"
  const runtime = await UiRuntime.create(canvas, {
    fontUrl: "/engine-static/JetBrainsMono-Bold.ttf",
    inputProxy: false,
  })
  let layout: PositionedNodeSystem | null = null
  let structureKey: string | null = null
  let updateGeneration = 0
  let anchors = loadNodeAnchors()
  let restoredViewport = loadObserverViewport()
  const restoredInspector = loadObserverInspectorPresentation()
  let inspectorFrame: UiSurfaceRect | null = restoredInspector?.frame ?? null
  let inspectorStickFrame: UiSurfaceRect | null = restoredInspector?.stickFrame ?? null
  let selectedNodeIds = [...(restoredInspector?.selectedNodeIds ?? [])]
  let selectedNodeId = restoredInspector?.selectedNodeId ?? null
  let restoreSelectionPending = selectedNodeIds.length > 0
  let applyingTopologyLayout = false
  let graph: NodeSystemSurface

  const inspector = new NodeInspectorSurface({
    title: "ИНСПЕКТОР ГАМИЛЬТОНИАНА",
    open: restoredInspector?.open ?? true,
    onOpenChange(open) {
      document.documentElement.dataset.hamiltonianInspector = open ? "open" : "closed"
      persistInspectorPresentation(open)
      runtime.clearSurfaceRect(inspector)
      runtime.relayout({scope: "hud"})
    },
    onFrameRectChange(change) {
      inspectorFrame = change.rect
      exposeInspectorFrame(change.rect, change.phase)
      if (change.phase === "end") persistInspectorPresentation(inspector.isOpen)
    },
    onStickFrameRectChange(change) {
      inspectorStickFrame = change.rect
      exposeInspectorStickFrame(change.rect, change.phase)
      if (change.phase === "end") persistInspectorPresentation(inspector.isOpen)
    },
    titleBarActions: [{
      label: "Показать весь граф",
      iconSrc: uiIcons.collapse,
      tooltip: "Показать весь граф",
      action: () => graph.fitToView(),
    }],
    onAction: (node, action) => dispatchAction(node, action),
  })
  document.documentElement.dataset.hamiltonianInspector = inspector.isOpen ? "open" : "closed"
  exposeInspectorSelection([], null)
  graph = new NodeSystemSurface({
    title: "ГАМИЛЬТОНИАН · ЖИВАЯ ОРКЕСТРАЦИЯ",
    toolbar: false,
    minScale: 0.12,
    maxScale: 2.5,
    onSelectionChange(nodeId) {
      const available = new Set(graph.layout.nodes.map(({node}) => node.id))
      if (
        applyingTopologyLayout &&
        shouldRetainMissingLocalWindowSelection(selectedNodeIds, localWindowNodeId, available)
      ) {
        restoreSelectionPending = true
        exposeInspectorSelection(selectedNodeIds, selectedNodeId)
        return
      }
      selectedNodeIds = [...graph.selectedNodeIds]
      selectedNodeId = nodeId
      exposeInspectorSelection(selectedNodeIds, selectedNodeId)
      persistInspectorPresentation(inspector.isOpen)
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

  runtime.addHudSurface(graph, ({w, h}) => planHamiltonianOrchestrationWorkspace(w, h, inspector.isOpen, inspectorFrame, inspectorStickFrame).graph, {
    windowId: "hamiltonian-orchestration",
    zIndex: 0,
  })
  runtime.addHudSurface(inspector, ({w, h}) => planHamiltonianOrchestrationWorkspace(w, h, inspector.isOpen, inspectorFrame, inspectorStickFrame).inspector, {
    windowId: "hamiltonian-orchestration",
    zIndex: 1,
  })

  const resizeObserver = new ResizeObserver(() => runtime.handleResize())
  resizeObserver.observe(canvas)
  runtime.handleResize()
  const initialWidth = Math.max(1, canvas.clientWidth)
  const initialHeight = Math.max(1, canvas.clientHeight)
  exposeInspectorFrame(planHamiltonianOrchestrationWorkspace(
    initialWidth,
    initialHeight,
    true,
    inspectorFrame,
    inspectorStickFrame,
  ).inspector, "end")
  exposeInspectorStickFrame(planHamiltonianOrchestrationWorkspace(
    initialWidth,
    initialHeight,
    false,
    inspectorFrame,
    inspectorStickFrame,
  ).inspector, "end")
  runtime.requestRender()
  status.textContent = "Ожидание топологии от сервис-воркера…"
  status.dataset.state = "waiting"

  function exposeInspectorFrame(frame: UiSurfaceRect, phase: "change" | "end"): void {
    document.documentElement.dataset.hamiltonianInspectorFrame = [frame.x, frame.y, frame.w, frame.h]
      .map((value) => Math.round(value))
      .join(",")
    document.documentElement.dataset.hamiltonianInspectorFramePhase = phase
  }

  function exposeInspectorStickFrame(frame: UiSurfaceRect, phase: "change" | "end"): void {
    document.documentElement.dataset.hamiltonianInspectorStickFrame = [frame.x, frame.y, frame.w, frame.h]
      .map((value) => Math.round(value))
      .join(",")
    document.documentElement.dataset.hamiltonianInspectorStickFramePhase = phase
  }

  function exposeInspectorSelection(nodeIds: readonly string[], primaryNodeId: string | null): void {
    document.documentElement.dataset.hamiltonianSelectedNode = primaryNodeId ?? ""
    document.documentElement.dataset.hamiltonianSelectedNodeCount = String(nodeIds.length)
  }

  function persistInspectorPresentation(open: boolean): void {
    persistObserverInspectorPresentation({
      open,
      frame: inspectorFrame,
      stickFrame: inspectorStickFrame,
      selectedNodeIds,
      selectedNodeId,
    })
  }

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
      status.textContent = `Ошибка раскладки топологии · ${error instanceof Error ? error.message : String(error)}`
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
    applyingTopologyLayout = true
    try {
      graph.setLayout(nextLayout)
    } finally {
      applyingTopologyLayout = false
    }
    if (restoreSelectionPending) {
      const available = new Set(nextLayout.nodes.map(({node}) => node.id))
      if (shouldRetainMissingLocalWindowSelection(selectedNodeIds, localWindowNodeId, available)) {
        exposeInspectorSelection(selectedNodeIds, selectedNodeId)
        persistInspectorPresentation(inspector.isOpen)
      } else {
        restoreSelectionPending = false
        const surviving = selectedNodeIds.filter((nodeId) => available.has(nodeId))
        const primary = selectedNodeId !== null && surviving.includes(selectedNodeId)
          ? selectedNodeId
          : surviving.at(-1) ?? null
        const ordered = primary === null
          ? surviving
          : [...surviving.filter((nodeId) => nodeId !== primary), primary]
        if (ordered.length > 0) {
          graph.selectMany(ordered)
        } else {
          selectedNodeIds = []
          selectedNodeId = null
          exposeInspectorSelection([], null)
          persistInspectorPresentation(inspector.isOpen)
        }
      }
    }
    if (restoredViewport !== null) {
      graph.setViewport(restoredViewport)
      restoredViewport = null
      globalThis.document.documentElement.dataset.hamiltonianViewport = "restored"
    } else if (preserveViewport) {
      graph.setViewport(previousViewport)
    }
    inspector.inspect(graph.selectedNode?.node ?? null)
    status.textContent = `${nextLayout.nodes.length} нод · ${nextLayout.edges.length} связей · живой режим`
    status.dataset.state = "live"
    documentElementEvidence(nextLayout, revisionLabel(document.revision), anchors)
  }

  async function applyNodeMove(event: NodeSystemNodeMoveEvent): Promise<void> {
    layout = event.layout
    inspector.inspect(graph.selectedNode?.node ?? null)
    status.textContent = event.phase === "move"
      ? `Перемещение нод: ${event.nodeIds.length}…`
      : `Перестроение связей для нод: ${event.nodeIds.length}…`
    status.dataset.state = "moving"
    if (event.phase === "move") return

    await persistAndRouteNodeGeometry(event.layout, event.nodeIds)
  }

  async function applyNodeResize(event: NodeSystemNodeResizeEvent): Promise<void> {
    layout = event.layout
    inspector.inspect(graph.selectedNode?.node ?? null)
    status.textContent = event.phase === "resize" ? `Изменение ширины ${event.nodeId}…` : `Перестроение связей ${event.nodeId}…`
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
      status.textContent = `${routed.nodes.length} нод · ${routed.edges.length} связей · сохранено`
      status.dataset.state = "live"
      documentElementEvidence(routed, revisionLabel(routed.revision), anchors)
    } catch (error: unknown) {
      if (generation !== updateGeneration) return
      status.textContent = `Позиция сохранена; связи не перестроены · ${error instanceof Error ? error.message : String(error)}`
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

function loadObserverInspectorPresentation(): HamiltonianInspectorPresentation | null {
  try {
    return parseHamiltonianInspectorPresentation(
      sessionStorage.getItem(HAMILTONIAN_INSPECTOR_PRESENTATION_STORAGE_KEY),
    )
  } catch {
    return null
  }
}

function persistObserverInspectorPresentation(presentation: HamiltonianInspectorPresentation): void {
  try {
    sessionStorage.setItem(
      HAMILTONIAN_INSPECTOR_PRESENTATION_STORAGE_KEY,
      serializeHamiltonianInspectorPresentation(presentation),
    )
  } catch {
    // Inspector placement is optional observer-local state, never a scene blocker.
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
  return value === undefined ? "неизвестно" : String(value)
}

function requiredElement<T extends Element>(value: T | null): T {
  if (value === null) throw new Error("Оболочка оркестрации Гамильтониана неполна")
  return value
}
