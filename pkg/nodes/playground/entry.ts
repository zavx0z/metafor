import {UiRuntime} from "@ui/elements/runtime"
import type {FieldDefinition} from "@ui/components"
import {
  PlaygroundBackdropSurface,
  PlaygroundNavigationSurface,
  PlaygroundRouter,
  PlaygroundStoryPanelSurface,
  planPlaygroundShell,
  playgroundRouteUrl,
  type PlaygroundNavigationItem,
  type PlaygroundStoryPanelMode,
  type PlaygroundStoryPanelOptions,
} from "@ui/playground"
import {
  createBlenderNodeTreeProjector,
  type BlenderFrameMetadata,
  type BlenderLinkMetadata,
  type BlenderNodeMetadata,
  type BlenderParameterPresentation,
  type BlenderRuntimeParameter,
  type BlenderRuntimeTree,
  type BlenderSocketMetadata,
  type BlenderNodeTreeProjection,
} from "@nodes/ui/blender-projection"
import {createBlenderNodeRenderers} from "@nodes/ui/blender-node"
import {NodeEditor, type NodeEditorSelection} from "@nodes/ui/node-editor"
import {
  NodeTreeEditor,
  type NodeTreeEditorResult,
} from "@nodes/editor"
import {
  NodeTree,
  StaleNodeTreeProjectionError,
  type NodeTreeChange,
} from "@nodes/core/node-tree"
import {Parameter, type NodeJsonValue} from "@nodes/core/parameter"
import {
  NodeTreeEditorDockSurface,
  type NodeTreeEditorDockOptions,
} from "./editor-dock.ts"
import {
  NODES_PLAYGROUND_PATH,
  NODES_PLAYGROUND_ROUTE,
  NODES_PLAYGROUND_ROUTE_DECLARATION,
} from "./routes.ts"

const canvas = document.getElementById("nodes-playground-canvas")
if (!(canvas instanceof HTMLCanvasElement)) throw new Error("nodes playground canvas not found")

document.documentElement.dataset.nodesPlayground = "starting"
document.documentElement.dataset.nodesPlaygroundRoute = NODES_PLAYGROUND_ROUTE

const numberParameter = (id: string, label: string, value: number): BlenderRuntimeParameter =>
  new Parameter<NodeJsonValue, BlenderParameterPresentation>(id, value, numberPresentation(id, label))

const gain = numberParameter("gain", "Gain", 1)
const output = numberParameter("value", "Value", 0.5)
const input = numberParameter("value", "Value", 0.5)

const tree: BlenderRuntimeTree = new NodeTree<
  BlenderRuntimeParameter,
  BlenderFrameMetadata,
  BlenderNodeMetadata,
  BlenderSocketMetadata,
  BlenderLinkMetadata
>({
  nodes: [
    {
      id: "source",
      parameters: [gain, output],
      metadata: {title: "Runtime Source", category: "NodeTree"},
      sockets: [{
        id: "value-out",
        direction: "output",
        parameterId: "value",
        side: "right",
        metadata: {label: "Value", socketType: "float"},
      }],
    },
    {
      id: "target",
      parameters: [input],
      metadata: {title: "Runtime Target", category: "NodeTree"},
      sockets: [{
        id: "value-in",
        direction: "input",
        parameterId: "value",
        side: "left",
        metadata: {label: "Value", socketType: "float"},
      }],
    },
  ],
  links: [{
    id: "runtime-link",
    from: {nodeId: "source", socketId: "value-out"},
    to: {nodeId: "target", socketId: "value-in"},
    metadata: {label: "Runtime value", socketType: "float"},
  }],
})

const author = new NodeTreeEditor(tree, {
  parameterAffectsLayout: ({presentation}) => presentation.geometrySensitiveValue === true,
})
const projector = createBlenderNodeTreeProjector()
let latestProjection: BlenderNodeTreeProjection | null = null
let panelMode: PlaygroundStoryPanelMode = "controls"
let projectionQueue: Promise<void> = Promise.resolve()
let selectedNodeId: string | null = "source"
let selectedParameterId: string | null = "gain"
let selectedLinkId: string | null = "runtime-link"
let fromEndpointId = endpointValue("source", "value-out")
let toEndpointId = endpointValue("target", "value-in")
let parameterSequence = 0
let nodeSequence = 0
let linkSequence = 0
let lastTransaction: NodeTreeEditorResult | null = null

export type NodesPlaygroundObserver = Readonly<{
  snapshot(): Readonly<Record<string, unknown>>
  setGain(value: number): Promise<Readonly<Record<string, unknown>>>
  addParameter(nodeId?: string): Readonly<Record<string, unknown>>
  removeSelectedParameter(): Readonly<Record<string, unknown>>
  toggleConnection(): Readonly<Record<string, unknown>>
  addNode(): Readonly<Record<string, unknown>>
  removeSelectedNode(): Readonly<Record<string, unknown>>
  rebuildLayout(): Promise<Readonly<Record<string, unknown>>>
}>

declare global {
  var __nodesPlaygroundObserver: NodesPlaygroundObserver | undefined
}

try {
  const runtime = await UiRuntime.create(canvas, {
    fontUrl: "/JetBrainsMono-Bold.ttf",
    virtualDisplay: {initial: "near", surfaceDisplay: true, grid: false},
  })
  runtime.handleResize()

  const route = new PlaygroundRouter(NODES_PLAYGROUND_ROUTE_DECLARATION)
  if (window.location.pathname !== NODES_PLAYGROUND_PATH) {
    history.replaceState(null, "", playgroundRouteUrl(route.current))
  }
  const navigate = (): void => route.go(NODES_PLAYGROUND_ROUTE)
  const item: PlaygroundNavigationItem<typeof NODES_PLAYGROUND_ROUTE> = {
    id: "node-tree-runtime",
    label: "Живой NodeTree",
    route: NODES_PLAYGROUND_ROUTE,
    group: {id: "runtime", label: "Runtime"},
  }
  const backdrop = new PlaygroundBackdropSurface()
  const catalog = new PlaygroundNavigationSurface({
    title: "Пакет nodes",
    items: [item],
    route: NODES_PLAYGROUND_ROUTE,
    onNavigate: navigate,
  })
  const sections = new PlaygroundNavigationSurface({
    title: "NodeTree",
    items: [{id: item.id, route: item.route, label: "Проекция"}],
    route: NODES_PLAYGROUND_ROUTE,
    onNavigate: navigate,
  })
  const editor = new NodeEditor({
    renderers: createBlenderNodeRenderers(),
    title: "NODETREE · UNIVERSAL EDITOR",
    minScale: 0.4,
    maxScale: 2.4,
    onSelectionChange: acceptCanvasSelection,
  })
  const editorDock = new NodeTreeEditorDockSurface(dockOptions())
  let storyPanel: PlaygroundStoryPanelSurface
  const panelOptions = (): PlaygroundStoryPanelOptions => ({
    source: [
      'import {NodeTreeEditor} from "@nodes/editor"',
      'import {createBlenderNodeTreeProjector} from "@nodes/ui/blender-projection"',
      "",
      "export const author = new NodeTreeEditor(tree)",
      "export const projector = createBlenderNodeTreeProjector()",
      `export const snapshot = ${JSON.stringify(tree.snapshot(), null, 2)} as const`,
    ].join("\n"),
    args: Object.freeze({gain: gain.value}),
    controls: [{
      key: "gain",
      label: "Gain",
      group: "Parameter Store",
      kind: "number",
      description: "Изменяет тот же Parameter без отдельной карты состояния.",
    }],
    events: [
      {id: "tree", label: "Tree revision", value: String(tree.revision)},
      {id: "topology", label: "Topology revision", value: String(tree.topologyRevision)},
      {id: "layout", label: "Layout", value: author.layoutDirty ? "требует перестройки" : "актуален"},
      {id: "parameter", label: "Parameter revision", value: String(gain.revision)},
      {id: "projection", label: "Projection", value: diagnosticsText(latestProjection, editor.diagnostics.materializations)},
    ],
    mode: panelMode,
    onModeChange(mode) {
      panelMode = mode
      storyPanel.setOptions(panelOptions())
    },
    onControlChange(key, value) {
      if (key === "gain" && typeof value === "number" && Number.isFinite(value)) setGainThroughEditor(value)
    },
    async onCopy(source) {
      await navigator.clipboard.writeText(source)
    },
    onSourceScrollChange(position) {
      document.documentElement.dataset.nodeTreeSourceScroll = JSON.stringify(position)
    },
  })
  storyPanel = new PlaygroundStoryPanelSurface(panelOptions())

  const shell = (w: number, h: number) => planPlaygroundShell(w, h, {dockHeight: 220})
  runtime.addSurface(backdrop, ({w, h}) => ({x: 0, y: 0, w, h}))
  runtime.addSurface(catalog, ({w, h}) => shell(w, h).catalog)
  runtime.addSurface(sections, ({w, h}) => shell(w, h).section)
  runtime.addSurface(editor, ({w, h}) => shell(w, h).preview)
  runtime.addSurface(editorDock, ({w, h}) => shell(w, h).dock)
  runtime.addSurface(storyPanel, ({w, h}) => shell(w, h).info)

  const observerSnapshot = (): Readonly<Record<string, unknown>> => Object.freeze({
    route: route.current,
    treeRevision: tree.revision,
    topologyRevision: tree.topologyRevision,
    parameterRevision: gain.revision,
    gain: gain.value,
    projectionRevision: latestProjection?.revision ?? null,
    projectionTopologyRevision: latestProjection?.topologyRevision ?? null,
    layoutDirty: author.layoutDirty,
    selectedNodeId,
    selectedParameterId,
    selectedLinkId,
    fromEndpointId,
    toEndpointId,
    lastPatch: lastTransaction?.forward ?? null,
    diagnostics: latestProjection === null ? null : {
      ...latestProjection.diagnostics,
      materializations: editor.diagnostics.materializations,
    },
    snapshot: tree.snapshot(),
  })

  const publish = (): void => {
    const snapshot = observerSnapshot()
    document.documentElement.dataset.nodesPlaygroundRoute = route.current
    document.documentElement.dataset.nodeTreeRevision = String(tree.revision)
    document.documentElement.dataset.nodeTreeTopologyRevision = String(tree.topologyRevision)
    document.documentElement.dataset.nodeTreeProjectionRevision = String(latestProjection?.revision ?? "")
    document.documentElement.dataset.nodeTreeProjectionTopologyRevision = String(latestProjection?.topologyRevision ?? "")
    document.documentElement.dataset.nodeTreeLayoutDirty = String(author.layoutDirty)
    document.documentElement.dataset.nodeTreeSelectedNode = selectedNodeId ?? ""
    document.documentElement.dataset.nodeTreeSelectedParameter = selectedParameterId ?? ""
    document.documentElement.dataset.nodeTreeSelectedLink = selectedLinkId ?? ""
    document.documentElement.dataset.nodeTreeLastPatch = JSON.stringify(lastTransaction?.forward ?? null)
    document.documentElement.dataset.nodeTreeDiagnostics = JSON.stringify(snapshot.diagnostics)
    document.documentElement.dataset.nodeTreeMaterializations = String(editor.diagnostics.materializations)
    document.documentElement.dataset.nodeTreeSnapshot = JSON.stringify(tree.snapshot())
    document.documentElement.dataset.nodeTreeRuntime = JSON.stringify(snapshot)
  }

  const projectionViewport = (): Readonly<{width: number; height: number}> => {
    const width = Math.max(1, canvas.clientWidth || canvas.width)
    const height = Math.max(1, canvas.clientHeight || canvas.height)
    const preview = shell(width, height).preview
    return {width: Math.max(1, Math.round(preview.w)), height: Math.max(1, Math.round(preview.h))}
  }

  const applyProjection = async (): Promise<void> => {
    const viewport = projectionViewport()
    try {
      const projection = await tree.project(projector, {
        cacheKey: `blender:${viewport.width}x${viewport.height}`,
        context: {viewport},
      })
      latestProjection = projection
      editor.setProjection(projection)
      author.markLayoutApplied(projection)
      normalizeSelections()
      if (selectedNodeId !== null) editor.select({kind: "node", id: selectedNodeId})
      runtime.relayout()
      runtime.space.updateWorldMatrix()
      runtime.renderer.renderFrame(runtime.space, runtime.hud, runtime.viewPoint)
      storyPanel.setOptions(panelOptions())
      editorDock.setOptions(dockOptions())
      storyPanel.flushPendingRender()
      runtime.renderer.renderFrame(runtime.space, runtime.hud, runtime.viewPoint)
      publish()
      document.documentElement.dataset.nodesPlayground = "ready"
    } catch (error) {
      if (error instanceof StaleNodeTreeProjectionError) {
        return applyProjection()
      }
      throw error
    }
  }

  function dockOptions(): NodeTreeEditorDockOptions {
    normalizeSelections()
    const node = selectedNodeId === null
      ? undefined
      : tree.nodes.find(({id}) => id === selectedNodeId)
    const parameters = (node?.parameters ?? []).map((parameter) => {
      const socket = (node?.sockets ?? []).find(({parameterId}) => parameterId === parameter.id)
      return Object.freeze({
        id: parameter.id,
        label: parameter.presentation.label,
        ...(socket === undefined ? {} : {
          description: `Используется Socket ${socket.id}`,
          removable: false,
        }),
      })
    })
    const fromEndpoints = endpointOptions("from")
    const toEndpoints = endpointOptions("to")
    return Object.freeze({
      nodes: Object.freeze(tree.nodes.map((entry) => Object.freeze({
        id: entry.id,
        label: entry.metadata?.title ?? entry.id,
      }))),
      selectedNodeId,
      parameters: Object.freeze(parameters),
      selectedParameterId,
      parameterField: selectedParameterField(),
      links: Object.freeze(tree.links.map((link) => Object.freeze({
        id: link.id,
        label: `${link.from.nodeId}/${link.from.socketId} → ${link.to.nodeId}/${link.to.socketId}`,
      }))),
      selectedLinkId,
      fromEndpointId,
      fromEndpoints,
      toEndpointId,
      toEndpoints,
      canConnect: canConnectCurrent(),
      layoutDirty: author.layoutDirty,
      onSelectNode(id) {
        selectedNodeId = id
        selectedParameterId = null
        editor.select({kind: "node", id})
        renderWorkbench()
      },
      onAddNode() { runUiEdit(addNode) },
      onRemoveNode(id) {
        selectedNodeId = id
        runUiEdit(removeSelectedNode)
      },
      onSelectParameter(id) {
        selectedParameterId = id
        renderWorkbench()
      },
      onAddParameter() { runUiEdit(addParameter) },
      onRemoveParameter(id) {
        selectedParameterId = id
        runUiEdit(removeSelectedParameter)
      },
      onSelectLink(id) {
        selectedLinkId = id
        editor.select({kind: "link", id})
        renderWorkbench()
      },
      onConnect() { runUiEdit(connectCurrent) },
      onDisconnect(id) {
        selectedLinkId = id
        runUiEdit(disconnectSelected)
      },
      onFromEndpointChange(id) {
        fromEndpointId = id
        renderWorkbench()
      },
      onToEndpointChange(id) {
        toEndpointId = id
        renderWorkbench()
      },
      onRebuildLayout() { void rebuildLayout() },
    })
  }

  function selectedParameterField(): FieldDefinition | null {
    if (selectedNodeId === null || selectedParameterId === null) return null
    const nodeId = selectedNodeId
    const parameterId = selectedParameterId
    let parameter: BlenderRuntimeParameter
    try {
      parameter = tree.parameter(nodeId, parameterId)
    } catch {
      return null
    }
    if (typeof parameter.value !== "number") {
      return Object.freeze({
        id: `editor-${nodeId}-${parameterId}`,
        kind: "readonly",
        label: parameter.presentation.label,
        value: JSON.stringify(parameter.value),
      })
    }
    const precision = parameter.presentation.field["precision"]
    return Object.freeze({
      id: `editor-${nodeId}-${parameterId}`,
      key: `editor-${nodeId}-${parameterId}`,
      kind: "number",
      label: parameter.presentation.label,
      value: parameter.value,
      ...(typeof precision === "number" ? {precision} : {}),
      onChange(value) {
        try {
          lastTransaction = author.setParameterValue({
            expectedRevision: tree.revision,
            nodeId,
            parameterId,
            value,
          })
          renderWorkbench()
        } catch (error) {
          publishError(error)
        }
      },
    })
  }

  function endpointOptions(role: "from" | "to"): readonly Readonly<{value: string; label: string}>[] {
    return Object.freeze(tree.nodes.flatMap((node) => (node.sockets ?? []).flatMap((socket) => {
      const allowed = role === "from" ? socket.direction !== "input" : socket.direction !== "output"
      if (!allowed) return []
      return [Object.freeze({
        value: endpointValue(node.id, socket.id),
        label: `${node.metadata?.title ?? node.id} · ${socket.metadata?.label ?? socket.id}`,
      })]
    })))
  }

  function canConnectCurrent(): boolean {
    if (fromEndpointId.length === 0 || toEndpointId.length === 0) return false
    const from = parseEndpointValue(fromEndpointId)
    const to = parseEndpointValue(toEndpointId)
    return !tree.links.some((link) => link.from.nodeId === from.nodeId &&
      link.from.socketId === from.socketId && link.to.nodeId === to.nodeId &&
      link.to.socketId === to.socketId)
  }

  function normalizeSelections(): void {
    if (selectedNodeId === null || !tree.nodes.some(({id}) => id === selectedNodeId)) {
      selectedNodeId = tree.nodes[0]?.id ?? null
    }
    const node = selectedNodeId === null ? undefined : tree.nodes.find(({id}) => id === selectedNodeId)
    if (selectedParameterId === null || !(node?.parameters ?? []).some(({id}) => id === selectedParameterId)) {
      selectedParameterId = node?.parameters?.[0]?.id ?? null
    }
    if (selectedLinkId === null || !tree.links.some(({id}) => id === selectedLinkId)) {
      selectedLinkId = tree.links[0]?.id ?? null
    }
    normalizeEndpointSelections()
  }

  function normalizeEndpointSelections(): void {
    const from = endpointOptions("from")
    const to = endpointOptions("to")
    if (!from.some(({value}) => value === fromEndpointId)) fromEndpointId = from[0]?.value ?? ""
    if (!to.some(({value}) => value === toEndpointId)) toEndpointId = to[0]?.value ?? ""
  }

  function runUiEdit(action: () => Readonly<Record<string, unknown>>): void {
    try {
      action()
    } catch (error) {
      publishError(error)
    }
  }

  function scheduleProjection(): Promise<void> {
    projectionQueue = projectionQueue.then(applyProjection).catch(publishError)
    return projectionQueue
  }

  function renderWorkbench(): void {
    normalizeSelections()
    storyPanel.setOptions(panelOptions())
    editorDock.setOptions(dockOptions())
    runtime.relayout()
    runtime.space.updateWorldMatrix()
    storyPanel.flushPendingRender()
    runtime.renderer.renderFrame(runtime.space, runtime.hud, runtime.viewPoint)
    publish()
  }

  function recordTransaction(transaction: NodeTreeEditorResult): Readonly<Record<string, unknown>> {
    lastTransaction = transaction
    renderWorkbench()
    return observerSnapshot()
  }

  function setGainThroughEditor(value: number): void {
    lastTransaction = author.setParameterValue({
      expectedRevision: tree.revision,
      nodeId: "source",
      parameterId: "gain",
      value,
    })
    renderWorkbench()
  }

  function addParameter(nodeId = selectedNodeId): Readonly<Record<string, unknown>> {
    if (nodeId === null) throw new Error("Select a Node before adding a Parameter")
    parameterSequence += 1
    const id = `parameter-${parameterSequence}`
    const transaction = author.addParameter({
      expectedRevision: tree.revision,
      nodeId,
      parameter: {
        id,
        value: 0,
        presentation: numberPresentation(id, `Parameter ${parameterSequence}`),
      },
    })
    selectedNodeId = nodeId
    selectedParameterId = id
    return recordTransaction(transaction)
  }

  function removeSelectedParameter(): Readonly<Record<string, unknown>> {
    if (selectedNodeId === null || selectedParameterId === null) {
      throw new Error("Select a Parameter before removing it")
    }
    const transaction = author.removeParameter({
      expectedRevision: tree.revision,
      nodeId: selectedNodeId,
      parameterId: selectedParameterId,
    })
    selectedParameterId = null
    return recordTransaction(transaction)
  }

  function addNode(): Readonly<Record<string, unknown>> {
    nodeSequence += 1
    const id = `dynamic-${nodeSequence}`
    const transaction = author.addNode({
      expectedRevision: tree.revision,
      node: {
        id,
        parameters: [{
          id: "value",
          value: nodeSequence,
          presentation: numberPresentation("value", "Value"),
        }],
        sockets: [
          {
            id: "value-in",
            direction: "input",
            parameterId: "value",
            side: "left",
            metadata: {label: "Value", socketType: "float"},
          },
          {
            id: "value-out",
            direction: "output",
            parameterId: "value",
            side: "right",
            metadata: {label: "Value", socketType: "float"},
          },
        ],
        metadata: {title: `Dynamic ${nodeSequence}`, category: "Editor"},
      },
    })
    selectedNodeId = id
    selectedParameterId = "value"
    normalizeEndpointSelections()
    return recordTransaction(transaction)
  }

  function removeSelectedNode(): Readonly<Record<string, unknown>> {
    if (selectedNodeId === null) throw new Error("Select a Node before removing it")
    const transaction = author.removeNode({
      expectedRevision: tree.revision,
      nodeId: selectedNodeId,
      disconnectLinks: true,
    })
    selectedNodeId = null
    selectedParameterId = null
    selectedLinkId = null
    normalizeEndpointSelections()
    return recordTransaction(transaction)
  }

  function connectCurrent(): Readonly<Record<string, unknown>> {
    const from = parseEndpointValue(fromEndpointId)
    const to = parseEndpointValue(toEndpointId)
    linkSequence += 1
    const id = `editor-link-${linkSequence}`
    const transaction = author.connect({
      expectedRevision: tree.revision,
      link: {
        id,
        from,
        to,
        metadata: {label: `${from.nodeId} → ${to.nodeId}`, socketType: "float"},
      },
    })
    selectedLinkId = id
    return recordTransaction(transaction)
  }

  function disconnectSelected(): Readonly<Record<string, unknown>> {
    if (selectedLinkId === null) throw new Error("Select a Link before disconnecting it")
    const transaction = author.disconnect({
      expectedRevision: tree.revision,
      linkId: selectedLinkId,
    })
    selectedLinkId = null
    return recordTransaction(transaction)
  }

  function toggleConnection(): Readonly<Record<string, unknown>> {
    const existing = tree.links[0]
    if (existing !== undefined) {
      selectedLinkId = existing.id
      return disconnectSelected()
    }
    return connectCurrent()
  }

  async function rebuildLayout(): Promise<Readonly<Record<string, unknown>>> {
    await scheduleProjection()
    return observerSnapshot()
  }

  function acceptCanvasSelection(selection: NodeEditorSelection): void {
    if (selection?.kind === "node") {
      selectedNodeId = selection.id
      selectedParameterId = null
    } else if (selection?.kind === "link") {
      selectedLinkId = selection.id
    }
    renderWorkbench()
  }

  function onTreeChange(change: NodeTreeChange): void {
    if (change.kind === "parameter" && !author.layoutDirty) {
      void scheduleProjection()
      return
    }
    renderWorkbench()
  }

  tree.subscribe(onTreeChange)
  window.addEventListener("keydown", (event) => {
    if (event.repeat) return
    try {
      if (event.key === "F6") addParameter()
      else if (event.key === "F7") toggleConnection()
      else if (event.key === "F8") setGainThroughEditor(Number(gain.value) + 1)
      else if (event.key === "F9") { void rebuildLayout() }
      else if (event.key === "F10") addNode()
      else return
      event.preventDefault()
    } catch (error) {
      publishError(error)
    }
  })
  route.subscribe(() => {
    runtime.relayout()
    publish()
  })
  globalThis.__nodesPlaygroundObserver = Object.freeze({
    snapshot: observerSnapshot,
    async setGain(value) {
      if (!Number.isFinite(value)) throw new Error("Gain must be finite")
      setGainThroughEditor(value)
      await projectionQueue
      return observerSnapshot()
    },
    addParameter,
    removeSelectedParameter,
    toggleConnection,
    addNode,
    removeSelectedNode,
    rebuildLayout,
  })
  new ResizeObserver(() => {
    runtime.handleResize()
    if (author.layoutDirty) renderWorkbench()
    else void scheduleProjection()
  }).observe(canvas)

  await applyProjection()
} catch (error) {
  publishError(error)
}

function diagnosticsText(projection: BlenderNodeTreeProjection | null, materializations: number): string {
  if (projection === null) return "ожидание"
  const {measurements, layouts, plans} = projection.diagnostics
  return `measure ${measurements} · layout ${layouts} · plan ${plans} · materialize ${materializations}`
}

function numberPresentation(id: string, label: string): BlenderParameterPresentation {
  return Object.freeze({
    label,
    field: Object.freeze({id: `${id}-field`, kind: "number", label, precision: 2}),
  })
}

function endpointValue(nodeId: string, socketId: string): string {
  return JSON.stringify([nodeId, socketId])
}

function parseEndpointValue(value: string): Readonly<{nodeId: string; socketId: string}> {
  const parsed = JSON.parse(value) as unknown
  if (!Array.isArray(parsed) || parsed.length !== 2 ||
    typeof parsed[0] !== "string" || typeof parsed[1] !== "string") {
    throw new Error(`Invalid editor Socket endpoint: ${value}`)
  }
  return Object.freeze({nodeId: parsed[0], socketId: parsed[1]})
}

function publishError(error: unknown): void {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  document.documentElement.dataset.nodesPlayground = "error"
  document.documentElement.dataset.nodesPlaygroundError = message
  console.error(error)
}
