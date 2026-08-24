import {UiRuntime} from "@ui/elements/runtime"
import {
  PlaygroundBackdropSurface,
  PlaygroundDockSurface,
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
import {NodeEditor} from "@nodes/ui/node-editor"
import {NodeTree, StaleNodeTreeProjectionError} from "@nodes/core/node-tree"
import {Parameter, type NodeJsonValue} from "@nodes/core/parameter"
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
  new Parameter<NodeJsonValue, BlenderParameterPresentation>(id, value, {
    label,
    field: {id: `${id}-field`, kind: "number", label, precision: 2},
  })

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

const projector = createBlenderNodeTreeProjector()
let latestProjection: BlenderNodeTreeProjection | null = null
let panelMode: PlaygroundStoryPanelMode = "controls"
let projectionQueue: Promise<void> = Promise.resolve()

export type NodesPlaygroundObserver = Readonly<{
  snapshot(): Readonly<Record<string, unknown>>
  setGain(value: number): Promise<Readonly<Record<string, unknown>>>
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
  const dock = new PlaygroundDockSurface({
    title: "Состояние",
    items: [{id: item.id, route: item.route, label: "Live"}],
    route: NODES_PLAYGROUND_ROUTE,
    onNavigate: navigate,
  })
  const editor = new NodeEditor({
    renderers: createBlenderNodeRenderers(),
    title: "NODETREE · LIVE RUNTIME",
    minScale: 0.4,
    maxScale: 2.4,
  })
  let storyPanel: PlaygroundStoryPanelSurface
  const panelOptions = (): PlaygroundStoryPanelOptions => ({
    source: [
      'import {createBlenderNodeTreeProjector} from "@nodes/ui/blender-projection"',
      "",
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
      {id: "parameter", label: "Parameter revision", value: String(gain.revision)},
      {id: "projection", label: "Projection", value: diagnosticsText(latestProjection, editor.diagnostics.materializations)},
    ],
    mode: panelMode,
    onModeChange(mode) {
      panelMode = mode
      storyPanel.setOptions(panelOptions())
    },
    onControlChange(key, value) {
      if (key === "gain" && typeof value === "number" && Number.isFinite(value)) gain.set(value)
    },
    async onCopy(source) {
      await navigator.clipboard.writeText(source)
    },
    onSourceScrollChange(position) {
      document.documentElement.dataset.nodeTreeSourceScroll = JSON.stringify(position)
    },
  })
  storyPanel = new PlaygroundStoryPanelSurface(panelOptions())

  const shell = (w: number, h: number) => planPlaygroundShell(w, h)
  runtime.addSurface(backdrop, ({w, h}) => ({x: 0, y: 0, w, h}))
  runtime.addSurface(catalog, ({w, h}) => shell(w, h).catalog)
  runtime.addSurface(sections, ({w, h}) => shell(w, h).section)
  runtime.addSurface(editor, ({w, h}) => shell(w, h).preview)
  runtime.addSurface(dock, ({w, h}) => shell(w, h).dock)
  runtime.addSurface(storyPanel, ({w, h}) => shell(w, h).info)

  const observerSnapshot = (): Readonly<Record<string, unknown>> => Object.freeze({
    route: route.current,
    treeRevision: tree.revision,
    parameterRevision: gain.revision,
    gain: gain.value,
    projectionRevision: latestProjection?.revision ?? null,
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
    document.documentElement.dataset.nodeTreeProjectionRevision = String(latestProjection?.revision ?? "")
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
      runtime.relayout()
      runtime.space.updateWorldMatrix()
      runtime.renderer.renderFrame(runtime.space, runtime.hud, runtime.viewPoint)
      storyPanel.setOptions(panelOptions())
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

  function scheduleProjection(): void {
    projectionQueue = projectionQueue.then(applyProjection).catch(publishError)
  }

  tree.subscribe(() => { scheduleProjection() })
  window.addEventListener("keydown", (event) => {
    if (event.key === "F8") gain.set(Number(gain.value) + 1)
  })
  route.subscribe(() => {
    runtime.relayout()
    publish()
  })
  globalThis.__nodesPlaygroundObserver = Object.freeze({
    snapshot: observerSnapshot,
    async setGain(value) {
      if (!Number.isFinite(value)) throw new Error("Gain must be finite")
      gain.set(value)
      await projectionQueue
      return observerSnapshot()
    },
  })
  new ResizeObserver(() => {
    runtime.handleResize()
    scheduleProjection()
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

function publishError(error: unknown): void {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  document.documentElement.dataset.nodesPlayground = "error"
  document.documentElement.dataset.nodesPlaygroundError = message
  console.error(error)
}
