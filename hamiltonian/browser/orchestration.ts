import {
  HamiltonianLifecycleCursor,
  subscribeHamiltonianLifecycle,
  subscribeHamiltonianLifecycleSnapshot,
  type HamiltonianLifecycleEnvelope,
  type HamiltonianLifecycleSnapshot,
} from "../core/lifecycle.js"
import {hamiltonianPageBootstrap} from "../core/monitor.js"
import {UiRuntime, type UiSurfaceRect} from "@ui/elements"
import {LayoutWorkerClient} from "nodes/layout-worker"
import type {LayoutWorkerEndpoint} from "nodes/types"
import {
  MetaForNodeSystemWorkerLayouter,
} from "nodes/layout-engine"
import {
  NODE_SYSTEM_PORT_PITCH,
  nodeSystemGeometryKey,
} from "@nodes/ui/card-layout"
import {NodeInspectorSurface} from "@nodes/ui/inspector"
import {NodeSystemSurface} from "@nodes/ui/surface"
import {fitNodeSystemCanvasTransform} from "@nodes/ui/viewport"
import type {
  NodeSystemAction,
  NodeSystemDocument,
  NodeSystemLayoutDirection,
  NodeSystemNode,
  PositionedNodeSystem,
} from "nodes/types"
import {
  HamiltonianLifecycleProjection,
  hamiltonianLayoutRequestRequiresCancellation,
  hamiltonianLifecycleNeedsDocument,
  hamiltonianPageNodeId,
  nodeSystemStructureKey,
  refreshPositionedNodeSystem,
  type HamiltonianLifecyclePresentation,
} from "./orchestration/lifecycle-projection.ts"
import {shouldRetainMissingLocalWindowSelection} from "./orchestration/selection-retention.ts"
import {
  planHamiltonianCanvasViewFrame,
  planHamiltonianGraphDisplayRect,
  planHamiltonianOrchestrationWorkspace,
} from "./orchestration/workspace.ts"
import {HamiltonianCanvasViewSurface} from "./orchestration/canvas-view.ts"
import {HamiltonianTrafficPresentationGate} from "./orchestration/traffic-presentation.ts"
import {
  HAMILTONIAN_LAYOUT_TRANSITION_MS,
  easeHamiltonianLayoutTransition,
  hamiltonianLayoutGeometryChanged,
  interpolateHamiltonianNodePositions,
} from "./orchestration/layout-transition.ts"
import {hamiltonianLayoutDirection} from "./orchestration/responsive-layout.ts"
import {
  captureHamiltonianSpatialRuntime,
  serializeHamiltonianViewPoint,
} from "./orchestration/spatial-runtime.ts"

const canvas = requiredElement(document.querySelector<HTMLCanvasElement>("#orchestration-canvas"))
const status = requiredElement(document.querySelector<HTMLElement>("#orchestration-status"))

const deviceId = localStorage.getItem("hamiltonian-device") ?? "unknown-device"
const tabId = sessionStorage.getItem("hamiltonian-window-id") ?? "unknown-window"
const pageBootstrap = hamiltonianPageBootstrap() ?? {
  pageIncarnation: "unknown-page",
  observedAt: Date.now(),
  navigationId: "",
  servedAt: 0,
  server: {identity: "hamiltonian", hostEpoch: "", version: ""},
}
const localWindowNodeId = hamiltonianPageNodeId(pageBootstrap.pageIncarnation)
const lifecycleCursor = new HamiltonianLifecycleCursor()
type AcceptedLifecycle = NonNullable<ReturnType<HamiltonianLifecycleCursor["accept"]>>
const pendingLifecycle: HamiltonianLifecycleEnvelope[] = []
let acceptLifecycleEnvelope: ((envelope: HamiltonianLifecycleEnvelope) => void) | null = null
let acceptLifecycle: ((accepted: AcceptedLifecycle) => void) | null = null
const pendingLifecycleSnapshots = new Map<string, HamiltonianLifecycleSnapshot>()
let acceptLifecycleSnapshot: ((snapshot: HamiltonianLifecycleSnapshot) => void) | null = null
const resolvedLifecycleFrontier = new Map<string, number>()
const trafficPresentation = new HamiltonianTrafficPresentationGate<HamiltonianLifecyclePresentation>()
document.documentElement.dataset.hamiltonianOrchestrationModuleAt = String(performance.now())

function exposeHamiltonianViewPoint(snapshot: Parameters<typeof serializeHamiltonianViewPoint>[0]): void {
  document.documentElement.dataset.hamiltonianViewPoint = serializeHamiltonianViewPoint(snapshot)
}

const unsubscribeLifecycle = subscribeHamiltonianLifecycle((value) => {
  exposeFirstPerformanceTimestamp("hamiltonianFirstLifecycleEnvelopeAt")
  if (acceptLifecycleEnvelope === null) pendingLifecycle.push(value)
  else acceptLifecycleEnvelope(value)
})
const unsubscribeLifecycleSnapshot = subscribeHamiltonianLifecycleSnapshot((snapshot) => {
  exposeFirstPerformanceTimestamp("hamiltonianFirstLifecycleSnapshotAt")
  if (acceptLifecycleSnapshot === null) {
    pendingLifecycleSnapshots.set(snapshot.scopeId, snapshot)
  } else {
    acceptLifecycleSnapshot(snapshot)
  }
})

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
    onViewPointChange: exposeHamiltonianViewPoint,
    virtualDisplay: {
      initial: "near",
      surfaceDisplay: true,
      grid: false,
    },
  })
  document.documentElement.dataset.hamiltonianGraphLayer = "space-display"
  document.documentElement.dataset.hamiltonianWindowLayer = "hud"
  let layout: PositionedNodeSystem | null = null
  let structureKey: string | null = null
  let updateGeneration = 0
  let inspectorFrame: UiSurfaceRect | null = null
  let inspectorStickFrame: UiSurfaceRect | null = null
  let canvasViewFrame: UiSurfaceRect | null = null
  let selectedNodeIds: string[] = []
  let selectedNodeId: string | null = null
  let restoreSelectionPending = false
  let applyingTopologyLayout = false
  let canvasAutoFitEnabled = true
  let graph: NodeSystemSurface
  let exposeSpatialRuntime = (): void => {}

  const inspector = new NodeInspectorSurface({
    open: false,
    onOpenChange(open) {
      document.documentElement.dataset.hamiltonianInspector = open ? "open" : "closed"
      runtime.clearSurfaceRect(inspector)
      runtime.relayout({scope: "hud"})
      exposeSpatialRuntime()
    },
    onFrameRectChange(change) {
      inspectorFrame = change.rect
      exposeInspectorFrame(change.rect, change.phase)
      exposeSpatialRuntime()
    },
    onStickFrameRectChange(change) {
      inspectorStickFrame = change.rect
      exposeInspectorStickFrame(change.rect, change.phase)
      exposeSpatialRuntime()
    },
    onAction: (node, action) => dispatchAction(node, action),
  })
  const canvasView = new HamiltonianCanvasViewSurface({
    onFit() {
      fitGraphCanvas(graph.layout, "manual-fit", true)
    },
    onAutoFitChange(enabled) {
      canvasAutoFitEnabled = enabled
      document.documentElement.dataset.hamiltonianCanvasMode = enabled ? "auto-fit" : "manual"
      if (enabled) fitGraphCanvas(graph.layout, "auto-fit-enabled", true)
    },
    onOpenChange(open) {
      document.documentElement.dataset.hamiltonianCanvasView = open ? "open" : "closed"
      runtime.clearSurfaceRect(canvasView)
      runtime.relayout({scope: "hud"})
      exposeSpatialRuntime()
    },
    onFrameRectChange(change) {
      canvasViewFrame = change.rect
      document.documentElement.dataset.hamiltonianCanvasViewFrame = [
        change.rect.x,
        change.rect.y,
        change.rect.w,
        change.rect.h,
      ].join(",")
      exposeSpatialRuntime()
    },
  })
  document.documentElement.dataset.hamiltonianCanvasView = canvasView.isOpen ? "open" : "closed"
  document.documentElement.dataset.hamiltonianInspector = inspector.isOpen ? "open" : "closed"
  exposeInspectorSelection([], null)
  graph = new NodeSystemSurface({
    title: "ГАМИЛЬТОНИАН · ЖИВАЯ ОРКЕСТРАЦИЯ",
    toolbar: false,
    minScale: 0.12,
    maxScale: 2.5,
    editable: false,
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
      inspector.inspect(layout?.nodes.find((entry) => entry.node.id === nodeId)?.node ?? null)
    },
    onCanvasTransformChange(transform) {
      canvasAutoFitEnabled = false
      canvasView.setAutoFitEnabled(false)
      document.documentElement.dataset.hamiltonianCanvasTransform = "manual"
      exposeCanvasTransform(transform)
    },
    onEdgeMessageCountChange(count) {
      document.documentElement.dataset.hamiltonianTrafficActive = String(count)
    },
  })
  graph.setEdgeAnimationEnabled(document.visibilityState === "visible")
  const synchronizeTrafficVisibility = () => {
    const visible = document.visibilityState === "visible"
    graph.setEdgeAnimationEnabled(visible)
    if (!visible) {
      trafficPresentation.clear()
      document.documentElement.dataset.hamiltonianTrafficPending = "0"
    }
  }
  document.addEventListener("visibilitychange", synchronizeTrafficVisibility)
  let acceptedTraffic = 0
  trafficPresentation.connect((envelope, startedAt) => {
    const accepted = graph.emitEdgeMessage({
      id: envelope.messageId,
      edgeId: envelope.edgeId,
      direction: envelope.direction,
      at: startedAt,
      messageClass: envelope.messageClass,
    })
    if (!accepted) return
    acceptedTraffic += 1
    exposeFirstPerformanceTimestamp("hamiltonianFirstTrafficAcceptedAt")
    document.documentElement.dataset.hamiltonianTrafficAccepted = String(acceptedTraffic)
    document.documentElement.dataset.hamiltonianTrafficVisualCapacity = String(
      graph.retainedEdgeParticleVisualCount,
    )
    document.documentElement.dataset.hamiltonianTrafficLastEdge = envelope.edgeId
    document.documentElement.dataset.hamiltonianTrafficLastDirection = envelope.direction
    document.documentElement.dataset.hamiltonianTrafficLastClass = envelope.messageClass
  })
  let currentLayoutDirection = hamiltonianLayoutDirection({
    width: Math.max(1, canvas.clientWidth),
    height: Math.max(1, canvas.clientHeight),
  })
  document.documentElement.dataset.hamiltonianLayoutDirection = currentLayoutDirection
  const layoutOptions = Object.freeze({
    nodeSpacing: NODE_SYSTEM_PORT_PITCH,
    layerSpacing: NODE_SYSTEM_PORT_PITCH,
    padding: NODE_SYSTEM_PORT_PITCH,
  })
  const layoutWorkerEndpoint = new Worker("/layout-worker.js", {
    type: "module",
    name: "metafor-layout",
  })
  const layoutWorker = new LayoutWorkerClient(
    layoutWorkerEndpoint as unknown as LayoutWorkerEndpoint,
  )
  const nodeSystemLayouter = new MetaForNodeSystemWorkerLayouter(layoutWorker, {
    ...layoutOptions,
    measureText: graph.textMeasurer,
  })
  document.documentElement.dataset.hamiltonianLayoutWorker = "ready"
  window.addEventListener("pagehide", () => {
    layoutWorker.dispose()
    document.documentElement.dataset.hamiltonianLayoutWorker = "disposed"
  }, {once: true})
  runtime.addSurface(graph, ({w, h}) => planHamiltonianOrchestrationWorkspace(w, h, inspector.isOpen, inspectorFrame, inspectorStickFrame).graph, {
    windowId: "hamiltonian-graph",
    zIndex: 0,
  })
  runtime.addHudSurface(inspector, ({w, h}) => planHamiltonianOrchestrationWorkspace(w, h, inspector.isOpen, inspectorFrame, inspectorStickFrame).inspector, {
    windowId: "hamiltonian-inspector",
    zIndex: 1,
  })
  runtime.addHudSurface(canvasView, ({w, h}) => planHamiltonianCanvasViewFrame(
    w,
    h,
    canvasView.isOpen,
    canvasViewFrame,
  ), {
    windowId: "hamiltonian-canvas-view",
    zIndex: 2,
  })
  exposeSpatialRuntime = () => {
    const snapshot = captureHamiltonianSpatialRuntime(runtime, graph, inspector, canvasView)
    document.documentElement.dataset.hamiltonianSpatialRuntime = snapshot.valid ? "verified" : "invalid"
    document.documentElement.dataset.hamiltonianObjectTree = snapshot.tree
    document.documentElement.dataset.hamiltonianObjectTreeEvidence = JSON.stringify({
      displayInSpace: snapshot.displayInSpace,
      graphInDisplay: snapshot.graphInDisplay,
      inspectorInHud: snapshot.inspectorInHud,
      canvasControlsInHud: snapshot.canvasControlsInHud,
    })
    exposeHamiltonianViewPoint(snapshot.viewPoint)
  }
  exposeSpatialRuntime()

  let scheduleOrientationRelayout = (): void => {}
  const resizeObserver = new ResizeObserver(() => {
    runtime.handleResize()
    const nextLayoutDirection = hamiltonianLayoutDirection({
      width: Math.max(1, canvas.clientWidth),
      height: Math.max(1, canvas.clientHeight),
    })
    const orientationChanged = nextLayoutDirection !== currentLayoutDirection
    if (orientationChanged) {
      currentLayoutDirection = nextLayoutDirection
      document.documentElement.dataset.hamiltonianLayoutDirection = currentLayoutDirection
      scheduleOrientationRelayout()
    }
    if (!orientationChanged && canvasAutoFitEnabled && layout !== null) {
      fitGraphCanvas(layout, "auto-fit-display-resize")
    }
    exposeSpatialRuntime()
  })
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
  status.textContent = "Материализация причинного bootstrap…"
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

  const context = {
    origin: location.origin,
    deviceId,
    tabId,
    pageIncarnation: pageBootstrap.pageIncarnation,
    observedAt: pageBootstrap.observedAt,
    navigationId: pageBootstrap.navigationId,
    servedAt: pageBootstrap.servedAt,
    server: pageBootstrap.server,
  }
  const lifecycleProjection = new HamiltonianLifecycleProjection(context)
  const bootstrapDocument = lifecycleProjection.document()
  const bootstrapGeometryKey = nodeSystemGeometryKey(bootstrapDocument, graph.textMeasurer)
  // A resize may cross the orientation boundary while the first layout
  // calculation is pending. applyDocument rejects that stale direction; retry the
  // same guaranteed bootstrap until one current RIGHT/DOWN result commits.
  while (layout === null) {
    const bootstrapDirection = currentLayoutDirection
    const bootstrapStructureKey = [
      nodeSystemStructureKey(bootstrapDocument),
      bootstrapGeometryKey,
      bootstrapDirection,
    ].join("\u0000")
    await applyDocument(
      bootstrapDocument,
      bootstrapStructureKey,
      ++updateGeneration,
      bootstrapDirection,
    )
  }
  document.documentElement.dataset.hamiltonianBootstrapNodes = String(bootstrapDocument.nodes.length)
  document.documentElement.dataset.hamiltonianBootstrapEdges = String(bootstrapDocument.edges.length)
  document.documentElement.dataset.hamiltonianBootstrapServer = `server:${pageBootstrap.server.hostEpoch}`
  document.documentElement.dataset.hamiltonianBootstrapPage = `page:${pageBootstrap.pageIncarnation}`
  document.documentElement.dataset.hamiltonianBootstrapCommittedAt = String(performance.now())

  let scheduledDocument: NodeSystemDocument | null = null
  let scheduledStructureKey: string | null = null
  let inFlightStructureKey: string | null = null
  let documentDrain: Promise<void> | null = null
  const layoutStructureKey = (
    nextDocument: NodeSystemDocument,
    direction: NodeSystemLayoutDirection,
  ): string => [
    nodeSystemStructureKey(nextDocument),
    nodeSystemGeometryKey(nextDocument, graph.textMeasurer),
    direction,
  ].join("\u0000")
  const exposeLifecycleGap = () => {
    const activeGap = lifecycleProjection.firstGap
    if (activeGap === null) {
      delete document.documentElement.dataset.hamiltonianLifecycleGap
    } else {
      document.documentElement.dataset.hamiltonianLifecycleGap =
        `${activeGap.sourceId}:${activeGap.missingFrom}-${activeGap.missingTo}`
    }
  }
  const retireProjectionSources = () => {
    const retired = lifecycleProjection.takeRetiredLifecycleSources()
    if (retired.length === 0) return
    for (const source of retired) {
      lifecycleCursor.retire(source.sourceId, source.sourceIncarnation)
      resolvedLifecycleFrontier.delete(`${source.sourceId}\u0000${source.sourceIncarnation}`)
    }
    document.documentElement.dataset.hamiltonianLifecycleActiveSources = String(lifecycleCursor.activeSourceCount)
    document.documentElement.dataset.hamiltonianLifecycleRetiredSources = String(lifecycleCursor.retiredSourceCount)
    document.documentElement.dataset.hamiltonianLifecycleTerminalIdentities = String(
      lifecycleProjection.retainedTerminalIdentityCount,
    )
    document.documentElement.dataset.hamiltonianLifecycleStructuralEvents = String(
      lifecycleProjection.retainedStructuralEventCount,
    )
  }
  const scheduleCurrentDocument = () => {
    const nextDocument = lifecycleProjection.document()
    const nextStructureKey = layoutStructureKey(nextDocument, currentLayoutDirection)
    scheduledDocument = nextDocument
    scheduledStructureKey = nextStructureKey
    document.documentElement.dataset.hamiltonianLifecyclePending = "1"
    if (documentDrain !== null) {
      if (hamiltonianLayoutRequestRequiresCancellation(inFlightStructureKey, nextStructureKey)) {
        updateGeneration += 1
        layoutWorker.cancelBefore(updateGeneration)
      }
      return
    }
    // A retained frontier and its already queued live continuation are applied
    // synchronously during startup. Let that one turn finish before starting
    // layout work so it positions the latest document once instead of laying
    // out an immediately superseded retained snapshot first.
    documentDrain = Promise.resolve()
      .then(drainDocuments)
      .finally(() => {
        documentDrain = null
        document.documentElement.dataset.hamiltonianLifecyclePending = scheduledDocument === null ? "0" : "1"
      })
  }
  scheduleOrientationRelayout = scheduleCurrentDocument
  acceptLifecycle = (accepted) => {
    let effectiveGap = accepted.gap
    if (effectiveGap !== null) {
      const key = `${effectiveGap.sourceId}\u0000${effectiveGap.sourceIncarnation}`
      const resolvedSequence = resolvedLifecycleFrontier.get(key) ?? 0
      if (resolvedSequence >= effectiveGap.missingTo) {
        effectiveGap = null
      } else if (resolvedSequence >= effectiveGap.missingFrom) {
        effectiveGap = {
          ...effectiveGap,
          expectedSequence: resolvedSequence + 1,
          missingFrom: resolvedSequence + 1,
        }
      }
    }
    const presentation = lifecycleProjection.observe(accepted.envelope, effectiveGap)
    retireProjectionSources()
    for (const edgeId of lifecycleProjection.takeRetiredTransportIds()) {
      trafficPresentation.forgetEdge(edgeId)
    }
    exposeLifecycleGap()
    if (presentation !== null && document.visibilityState === "visible") {
      exposeFirstPerformanceTimestamp("hamiltonianFirstTrafficObservedAt")
      trafficPresentation.observe(presentation)
      document.documentElement.dataset.hamiltonianTrafficPending = String(trafficPresentation.pendingCount)
    }
    if (!hamiltonianLifecycleNeedsDocument(accepted.envelope, effectiveGap)) return
    scheduleCurrentDocument()
  }
  acceptLifecycleEnvelope = (envelope) => {
    const accepted = lifecycleCursor.accept(envelope)
    if (accepted === null) return
    document.documentElement.dataset.hamiltonianLifecycleSource = accepted.envelope.sourceId
    document.documentElement.dataset.hamiltonianLifecycleIncarnation = accepted.envelope.sourceIncarnation
    document.documentElement.dataset.hamiltonianLifecycleSequence = String(accepted.envelope.sequence)
    acceptLifecycle!(accepted)
  }
  acceptLifecycleSnapshot = (snapshot) => {
    lifecycleProjection.replaceSnapshot(snapshot)
    for (const entry of snapshot.frontier) {
      const key = `${entry.sourceId}\u0000${entry.sourceIncarnation}`
      const previous = resolvedLifecycleFrontier.get(key) ?? 0
      if (entry.sequence > previous) resolvedLifecycleFrontier.set(key, entry.sequence)
    }
    lifecycleCursor.seed(snapshot.frontier)
    lifecycleProjection.resolveFrontier(snapshot.frontier)
    retireProjectionSources()
    for (const edgeId of lifecycleProjection.takeRetiredTransportIds()) {
      trafficPresentation.forgetEdge(edgeId)
    }
    exposeLifecycleGap()
    scheduleCurrentDocument()
  }
  for (const snapshot of pendingLifecycleSnapshots.values()) acceptLifecycleSnapshot(snapshot)
  pendingLifecycleSnapshots.clear()
  for (const envelope of pendingLifecycle.splice(0)) acceptLifecycleEnvelope(envelope)

  async function drainDocuments(): Promise<void> {
    while (scheduledDocument !== null) {
      const current = scheduledDocument
      const nextStructureKey = scheduledStructureKey ?? layoutStructureKey(current, currentLayoutDirection)
      scheduledDocument = null
      scheduledStructureKey = null
      const generation = ++updateGeneration
      const direction = currentLayoutDirection
      inFlightStructureKey = nextStructureKey
      try {
        await applyDocument(current, nextStructureKey, generation, direction)
      } catch (error: unknown) {
        if (generation !== updateGeneration) continue
        document.documentElement.dataset.hamiltonianLayoutWorker = "error"
        status.textContent = `Ошибка раскладки топологии · ${error instanceof Error ? error.message : String(error)}`
        status.dataset.state = "error"
      } finally {
        inFlightStructureKey = null
      }
    }
  }

  async function applyDocument(
    document: NodeSystemDocument,
    nextStructureKey: string,
    generation: number,
    direction: NodeSystemLayoutDirection,
  ): Promise<void> {
    const previousLayout = layout
    const preserveCanvasTransform = previousLayout !== null && graph.hasMaterializedCanvasTransform
    const previousCanvasTransform = graph.canvasTransform
    let nextLayout: PositionedNodeSystem
    if (previousLayout !== null && structureKey === nextStructureKey) {
      nextLayout = refreshPositionedNodeSystem(previousLayout, document)
    } else {
      const viewport = {
        width: Math.max(1, canvas.clientWidth),
        height: Math.max(1, canvas.clientHeight),
      }
      if (hamiltonianLayoutDirection(viewport) !== direction) return
      globalThis.document.documentElement.dataset.hamiltonianLayoutWorker = "busy"
      nextLayout = await nodeSystemLayouter.layout(document, {viewport}, generation)
      globalThis.document.documentElement.dataset.hamiltonianLayoutWorker = "ready"
      globalThis.document.documentElement.dataset.hamiltonianLayoutWorkerGeneration = String(generation)
    }
    if (generation !== updateGeneration || direction !== currentLayoutDirection) return
    const geometryChanged = previousLayout !== null &&
      hamiltonianLayoutGeometryChanged(previousLayout, nextLayout)
    applyingTopologyLayout = true
    try {
      if (previousLayout !== null && geometryChanged) {
        status.textContent = `Перестроение ${nextLayout.nodes.length} нод…`
        status.dataset.state = "moving"
        if (!await animateTopologyLayout(previousLayout, nextLayout, generation)) return
      } else {
        layout = nextLayout
        graph.setLayout(nextLayout)
        if (previousLayout === null) {
          fitGraphCanvas(nextLayout, "auto-fit-growth")
        } else if (preserveCanvasTransform) {
          graph.setCanvasTransform(previousCanvasTransform)
        }
      }
      if (nextLayout.edges.length > 0) {
        exposeFirstPerformanceTimestamp("hamiltonianFirstEdgeMaterializedAt")
      }
      trafficPresentation.setMaterializedEdges(nextLayout.edges.map(({edge}) => edge.id))
      globalThis.document.documentElement.dataset.hamiltonianTrafficPending = String(trafficPresentation.pendingCount)
      globalThis.document.documentElement.dataset.hamiltonianTrafficPresentation = "ready"
      globalThis.document.documentElement.dataset.hamiltonianLayoutTransition = "complete"
    } finally {
      applyingTopologyLayout = false
    }
    if (generation !== updateGeneration) return
    layout = nextLayout
    structureKey = nextStructureKey
    trafficPresentation.discardPendingOutside(nextLayout.edges.map(({edge}) => edge.id))
    globalThis.document.documentElement.dataset.hamiltonianTrafficPending = String(trafficPresentation.pendingCount)
    if (restoreSelectionPending) {
      const available = new Set(nextLayout.nodes.map(({node}) => node.id))
      if (shouldRetainMissingLocalWindowSelection(selectedNodeIds, localWindowNodeId, available)) {
        exposeInspectorSelection(selectedNodeIds, selectedNodeId)
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
        }
      }
    }
    inspector.inspect(graph.selectedNode?.node ?? null)
    status.textContent = `${nextLayout.nodes.length} нод · ${nextLayout.edges.length} связей · живой режим`
    status.dataset.state = "live"
    documentElementEvidence(nextLayout, revisionLabel(document.revision))
  }

  async function animateTopologyLayout(
    previous: PositionedNodeSystem,
    target: PositionedNodeSystem,
    generation: number,
  ): Promise<boolean> {
    const startedAt = performance.now()
    while (true) {
      if (generation !== updateGeneration) return false
      const elapsed = performance.now() - startedAt
      const progress = Math.min(1, elapsed / HAMILTONIAN_LAYOUT_TRANSITION_MS)
      const frame = interpolateHamiltonianNodePositions(
        previous,
        target,
        easeHamiltonianLayoutTransition(progress),
      )
      layout = frame
      const frameCanvasTransform = graph.canvasTransform
      graph.setLayout(frame)
      if (frame.edges.length > 0) {
        exposeFirstPerformanceTimestamp("hamiltonianFirstEdgeMaterializedAt")
      }
      trafficPresentation.setMaterializedEdges(frame.edges.map(({edge}) => edge.id))
      document.documentElement.dataset.hamiltonianTrafficPending = String(trafficPresentation.pendingCount)
      if (canvasAutoFitEnabled) {
        fitGraphCanvas(frame, "auto-fit-topology-transition")
      } else {
        graph.setCanvasTransform(frameCanvasTransform)
      }
      document.documentElement.dataset.hamiltonianLayoutTransition = progress >= 1 ? "complete" : "moving"
      if (progress >= 1) return true
      await nextPresentationFrame()
    }
  }

  function fitGraphCanvas(target: PositionedNodeSystem, reason: string, force = false): void {
    if (!canvasAutoFitEnabled && !force) return
    const displayRect = planHamiltonianGraphDisplayRect(
      Math.max(1, canvas.clientWidth),
      Math.max(1, canvas.clientHeight),
    )
    const transform = fitNodeSystemCanvasTransform(target, displayRect, 34, {minScale: 0.12, maxScale: 2.5})
    graph.setCanvasTransform(transform)
    document.documentElement.dataset.hamiltonianCanvasTransform = reason
    exposeCanvasTransform(transform)
  }

  function exposeCanvasTransform(transform: Readonly<{x: number; y: number; scale: number}>): void {
    document.documentElement.dataset.hamiltonianCanvasOffsetX = String(transform.x)
    document.documentElement.dataset.hamiltonianCanvasOffsetY = String(transform.y)
    document.documentElement.dataset.hamiltonianCanvasScale = String(transform.scale)
    document.documentElement.dataset.hamiltonianCanvasMode = canvasAutoFitEnabled ? "auto-fit" : "manual"
  }

  window.addEventListener("pagehide", () => {
    document.removeEventListener("visibilitychange", synchronizeTrafficVisibility)
    resizeObserver.disconnect()
    unsubscribeLifecycle()
    unsubscribeLifecycleSnapshot()
    trafficPresentation.disconnect()
    runtime.dispose()
  }, {once: true})
}

function exposeFirstPerformanceTimestamp(key: string): void {
  if (document.documentElement.dataset[key] !== undefined) return
  document.documentElement.dataset[key] = String(performance.now())
}

function nextPresentationFrame(): Promise<void> {
  return new Promise((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolve()
    }
    const timeout = setTimeout(finish, 50)
    requestAnimationFrame(finish)
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
): void {
  document.documentElement.dataset.hamiltonianScene = "ready"
  document.documentElement.dataset.hamiltonianNodes = String(layout.nodes.length)
  document.documentElement.dataset.hamiltonianEdges = String(layout.edges.length)
  document.documentElement.dataset.hamiltonianRevision = revision
  document.documentElement.dataset.hamiltonianLayoutEngine = "typescript-worker"
  document.documentElement.dataset.hamiltonianLayoutKernel = "layered-visibility-a-star"
  document.documentElement.dataset.hamiltonianLayoutContract = "exact-sockets"
  document.documentElement.dataset.hamiltonianLayoutBounds = JSON.stringify(layout.bounds)
  document.documentElement.dataset.hamiltonianLayoutRects = JSON.stringify(layout.nodes.map(({node, rect}) => ({
    id: node.id,
    parentId: node.parentId ?? null,
    rect,
  })))
  const websocket = layout.edges.find(({edge}) => edge.label === "WS" || edge.label === "WSS")
  document.documentElement.dataset.hamiltonianWebsocketEdge = websocket?.edge.id ?? ""
  document.documentElement.dataset.hamiltonianWebsocketTone = websocket?.edge.tone ?? "absent"
}

function revisionLabel(value: string | number | undefined): string {
  return value === undefined ? "неизвестно" : String(value)
}

function requiredElement<T extends Element>(value: T | null): T {
  if (value === null) throw new Error("Оболочка оркестрации Гамильтониана неполна")
  return value
}
