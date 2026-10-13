import {afterAll, beforeAll, expect, test} from "bun:test"
import {mkdtemp, rm, symlink} from "node:fs/promises"
import {join, resolve} from "node:path"
import {pathToFileURL} from "node:url"
import {createDocument, createDomRoot, HTMLButtonElement, HTMLTextAreaElement, InputEvent, Event as DomEvent, readDocumentCompiledStyleSheets, flushDocumentLayoutObservers, type DOMComponentConstructor, type Presentation} from "@zavx0z/immersive"
import {createDocumentRenderer} from "@zavx0z/immersive/renderer/html"
import {createSpaceElementFactories, readSpaceTree, XRAssetElement, XRLineSegmentsElement} from "@zavx0z/immersive/space"
import {InstancedMesh, InstancedSkinnedMesh, type Object3D} from "@zavx0z/immersive/engine"
import visualTemplatePlugin from "../build/template.plugin.ts"
import {createProductAnnotationState, type ProductAnnotationState} from "./product-annotation-state"
import type {AgentWorkspaceModel, AgentWorkspaceSnapshot} from "./agent-workspace"
import type {AtomContext, AtomViewSnapshot} from "@metafor/agent/atom"
import {DEFAULT_AGENT_PRESENTATION} from "@metafor/agent/presentation"
import type {AtomRef} from "@metafor/types/metafor/graph"
import type {NetworkSpaceModel} from "./network-space.tsx"
import type {InfrastructureProjection} from "./infrastructure-model.ts"
import {loadBot, type Bot} from "./bot.ts"
import {createAgentWorkspace as createAgentWorkspaceSource} from "../../../release/main/agents"
import {AGENT_UI_SCHEMA, type AgentUiSnapshot} from "../../../release/shared/agents"
import {agentWorkspaceGraph} from "../../../release/spec/agent-graph-fixture"

let directory = ""
let app: DOMComponentConstructor<{network: NetworkSpaceModel; bot?: Bot | undefined; workspace?: AgentWorkspaceModel | undefined; annotations?: ProductAnnotationState | undefined}>
let createNetworkSpace: () => NetworkSpaceModel
let createAgentWorkspace: () => AgentWorkspaceModel

beforeAll(async () => {
  directory = await mkdtemp(join(import.meta.dir, ".compiled-network-"))
  await symlink(resolve(import.meta.dir, "../node_modules"), join(directory, "node_modules"), "dir")
  const result = await Bun.build({
    entrypoints: [join(import.meta.dir, "app.tsx"), join(import.meta.dir, "network-space.tsx"), join(import.meta.dir, "agent-workspace.ts")],
    outdir: directory,
    target: "bun",
    conditions: ["metafor:main"],
    format: "esm",
    splitting: true,
    external: ["@zavx0z/immersive", "@zavx0z/immersive/*"],
    plugins: [visualTemplatePlugin],
  })
  if (!result.success) throw new AggregateError(result.logs, "Visual network did not compile")
  app = (await import(pathToFileURL(join(directory, "app.js")).href)).App
  createNetworkSpace = (await import(pathToFileURL(join(directory, "network-space.js")).href)).createNetworkSpace
  createAgentWorkspace = (await import(pathToFileURL(join(directory, "agent-workspace.js")).href)).createAgentWorkspace
}, 30_000)

afterAll(async () => {
  if (directory !== "") await rm(directory, {recursive: true, force: true})
})

function mount(bot?: Bot, projectionScale = {value: 2, offset: 0}, workspace?: AgentWorkspaceModel, annotations?: ProductAnnotationState) {
  const document = createDocument({elementFactories: createSpaceElementFactories()})
  const html = document.createElement("html")
  const body = document.createElement("body")
  html.append(body)
  document.append(html)
  const root = createDomRoot(body)
  const network = createNetworkSpace()
  root.render(app, {network, bot, workspace, annotations})
  const tree = readSpaceTree(document)
  const listeners = new Set<() => void>()
  const viewport = {width: 1200, height: 800}
  const flights: number[] = []
  const projection = {
    frustumPlanes: () => [],
    projectPoint: (point: {x: number; y: number}) => ({x: point.x * projectionScale.value + projectionScale.offset, y: point.y * projectionScale.value + projectionScale.offset}),
    fly: (distance: number) => { flights.push(distance) },
  }
  const presentation = {
    document,
    space: tree.space,
    viewPoint: tree.viewPoint,
    canvas: {getBoundingClientRect: () => ({left: 0, top: 0, ...viewport})},
    getProjection: () => projection,
    subscribePresented(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    invalidate() {},
    render() { root.flush(); for (const listener of listeners) listener() },
  } as unknown as Presentation
  network.attach(presentation)
  workspace?.attach(presentation, network)
  const renderers = new Map<ReturnType<typeof readSpaceTree>["displays"][number], ReturnType<typeof createDocumentRenderer>>()
  const flushLayout = () => {
    if (!workspace) return
    const displays = readSpaceTree(document).displays
    for (const [display, renderer] of renderers) if (!displays.includes(display)) {renderer.dispose(); renderers.delete(display)}
    for (const display of displays) {
      let renderer = renderers.get(display)
      if (!renderer) {renderer = createDocumentRenderer({document, root: display, viewport: {width: 1200, height: 800}}); renderers.set(display, renderer)}
      renderer.flush()
    }
    flushDocumentLayoutObservers(document)
  }
  const settle = async () => {
    for (let pass = 0; pass < 5; pass += 1) {
      root.flush()
      for (const listener of listeners) listener()
      flushLayout()
      await Bun.sleep(0)
    }
    root.flush()
  }
  return {document, html, body, root: {...root, unmount() {root.unmount(); for (const renderer of renderers.values()) renderer.dispose(); renderers.clear()}}, network, tree, settle, presentation, viewport, flights}
}

const projection: InfrastructureProjection = {
  frames: [{id: "browser", label: "Браузер"}, {id: "server", label: "Сеть"}],
  nodes: [
    {id: "window", frameId: "browser", label: "Window", details: "Страница"},
    {id: "runtime", frameId: "browser", label: "Release", details: "Cache: 1"},
    {id: "endpoint", frameId: "server", label: "WebSocket", details: "Сетевой адрес"},
  ],
  connections: [{id: "rpc", from: "runtime", to: "endpoint", label: "RPC", state: "open"}],
}

const pose = (view: ReturnType<typeof mount>) => [view.tree.viewPoint.x, view.tree.viewPoint.y, view.tree.viewPoint.z,
  view.tree.viewPoint.targetX, view.tree.viewPoint.targetY, view.tree.viewPoint.targetZ]

test("Visual network owns one Document, Space, ViewPoint, shared lights and HUD", async () => {
  const view = mount()
  try {
    await view.settle()
    expect(view.document.documentElement).toBe(view.html)
    expect(view.document.querySelectorAll("space")).toHaveLength(1)
    expect(view.document.querySelectorAll("viewpoint")).toHaveLength(1)
    expect(view.document.querySelectorAll("xr-light")).toHaveLength(3)
    expect(view.document.querySelector("[data-graph-editor]")).toBeNull()
    expect(view.document.querySelector("xr-animation")).toBeNull()
    expect(view.network.state.getSnapshot()?.nodes.map(node => node.label).sort()).toEqual(["MetaFor · Сеть", "Браузер", "Сервер"])
    const tree = readSpaceTree(view.document)
    expect(tree.displays).toHaveLength(3)
    expect(tree.displays.every(display => display.parentElement === tree.space)).toBe(true)
    expect(tree.hud?.element.parentElement).toBe(tree.space)
    expect(view.network.state.getSnapshot()?.contentById.size).toBe(0)
    const buttons = [...view.document.querySelectorAll("button")].filter((node): node is HTMLButtonElement => node instanceof HTMLButtonElement)
    expect(buttons.some(button => button.textContent === "Вписать сеть")).toBe(true)
  } finally { view.root.unmount() }
  expect(view.body.childNodes).toHaveLength(0)
  expect(readDocumentCompiledStyleSheets(view.document).styleSheets).toEqual([])
})

test("network values retain geometry, selection is lazy and real connections are spatial cubic edges", async () => {
  const view = mount()
  try {
    view.network.present(projection)
    await view.settle()
    const first = view.network.state.getSnapshot()!
    expect(first.nodes).toHaveLength(6)
    expect(first.branchVolumes).toEqual([])
    expect(view.network.getEdgeSnapshot().edges).toHaveLength(1)
    expect(view.network.getEdgeSnapshot().edges[0]?.route.kind).toBe("cubic")
    const runtime = view.document.querySelector('[data-spatial-node-id="network:entity:runtime"]')!
    expect(runtime).not.toBeNull()
    expect(first.contentById.size).toBe(0)
    view.network.select("runtime")
    await view.settle()
    expect(view.network.state.getSnapshot()?.contentById.size).toBe(1)
    expect(runtime.textContent).toContain("Cache: 1")
    const geometry = view.network.getEdgeSnapshot()
    const revision = view.network.state.getSnapshot()!.geometryRevision
    view.tree.viewPoint.x += 120
    const before = pose(view)
    view.network.present({...projection, nodes: projection.nodes.map(node => ({...node, details: "Cache: 2"}))})
    await view.settle()
    expect(pose(view)).toEqual(before)
    expect(view.network.getEdgeSnapshot()).toBe(geometry)
    expect(view.network.state.getSnapshot()!.geometryRevision).toBe(revision)
    expect(view.document.querySelector('[data-spatial-node-id="network:entity:runtime"]')).toBe(runtime)
    expect(runtime.textContent).toContain("Cache: 2")
    view.network.present({...projection, connections: []})
    await view.settle()
    expect(view.network.getEdgeSnapshot().edges).toHaveLength(0)
    expect(pose(view)).toEqual(before)
    expect(view.document.querySelector('[data-spatial-node-id="network:entity:runtime"]')).toBe(runtime)
  } finally { view.root.unmount() }
  expect(() => view.network.present(projection)).toThrow("disposed")
})

test("optional bot demonstration remains paused in the shared Space", async () => {
  const bytes = await Bun.file(new URL("./bots.glb", import.meta.url)).arrayBuffer()
  const bot = await loadBot(`data:model/gltf-binary;base64,${Buffer.from(bytes).toString("base64")}`)
  const view = mount(bot)
  try {
    const animation = view.document.querySelector("xr-animation")!
    expect(animation).not.toBeNull()
    expect("playing" in animation && animation.playing).toBe(false)
    expect(view.document.querySelector("xr-asset")?.parentElement).toBe(view.tree.space)
  } finally { view.root.unmount() }
})

test("overview follows staged topology until navigation and explicit fit uses the current native viewport", async () => {
  const view = mount()
  try {
    view.network.present({...projection, nodes: projection.nodes.slice(0, 1), connections: []})
    await view.settle()
    const first = pose(view)
    view.network.present(projection)
    await view.settle()
    expect(pose(view)).not.toEqual(first)
    const complete = pose(view)
    view.network.present({...projection, nodes: projection.nodes.map(node => ({...node, details: "Обновлено"}))})
    await view.settle()
    expect(pose(view)).toEqual(complete)
    view.network.zoom(1.2)
    const navigated = pose(view)
    view.network.present({...projection, nodes: [...projection.nodes, {id: "extra", label: "Ещё один участник", frameId: "browser", details: ""}]})
    await view.settle()
    expect(pose(view)).toEqual(navigated)
    view.viewport.width = 300
    view.network.fit()
    await view.settle()
    expect(pose(view)).not.toEqual(navigated)
  } finally { view.root.unmount() }
})


test("public SpatialEdges updates its depth-aware batch while preserving selected card and camera", async () => {
  const view = mount()
  try {
    view.network.present(projection)
    await view.settle()
    let element = view.document.querySelector('xr-line-segments[name="Наблюдаемые соединения сети"]')
    if (!(element instanceof XRLineSegmentsElement)) throw new Error("Public SpatialEdges batch missing")
    const geometry = () => {
      if (!(element instanceof XRLineSegmentsElement)) throw new Error("Public line batch missing")
      return element.geometry!.factory!(element.geometry!)
    }
    const initial = geometry()
    expect(initial.attributes.position!.count).toBe(128)
    const z = Array.from(initial.attributes.position!.array).filter((_, index) => index % 3 === 2)
    expect(Math.max(...z)).toBeGreaterThan(Math.min(...z))
    view.network.select("runtime")
    await view.settle()
    const card = view.document.querySelector('[data-spatial-node-id="network:entity:runtime"]')
    view.network.zoom(1.2)
    const camera = pose(view)
    const revision = view.network.getEdgeSnapshot().geometryRevision
    view.network.present({...projection, connections: projection.connections.map(edge => ({...edge, state: "unknown"}))})
    await view.settle()
    expect(geometry()).toBe(initial)
    expect(view.network.getEdgeSnapshot().geometryRevision).toBe(revision)
    expect(view.document.querySelector('[data-spatial-node-id="network:entity:runtime"]')).toBe(card)
    expect(pose(view)).toEqual(camera)
    view.network.present({...projection, nodes: [...projection.nodes, {id: "additional", frameId: "browser", label: "Новый участник", details: "Наблюдаемое исполнение"}]})
    await view.settle()
    const refreshed = view.document.querySelector('xr-line-segments[name="Наблюдаемые соединения сети"]')
    if (!(refreshed instanceof XRLineSegmentsElement)) throw new Error("Updated public SpatialEdges batch missing")
    element = refreshed
    expect(geometry()).not.toBe(initial)
    expect(view.document.querySelector('[data-spatial-node-id="network:entity:runtime"]')).toBe(card)
    expect(pose(view)).toEqual(camera)
    view.network.present({...projection, connections: []})
    await view.settle()
    expect(view.document.querySelector('xr-line-segments[name="Наблюдаемые соединения сети"]')).toBeNull()
    expect(element.isConnected).toBe(false)
  } finally { view.root.unmount() }
})


test("shared Storybook theme, Tab and Button controls keep black Space and navigate the same camera", async () => {
  const view = mount()
  try {
    view.network.present(projection)
    await view.settle()
    expect(view.tree.space.background).toBe("#000000")
    const links = view.document.querySelectorAll('link[rel="stylesheet"]')
    expect(links).toHaveLength(1)
    expect(links[0]?.getAttribute("href")).toStartWith("/@internal/visual/theme.css?env=main&version=")
    const tab = view.document.querySelector('[data-tab][aria-label="Сети"]')
    expect(tab?.getAttribute("data-edge")).toBe("bottom")
    const controls = view.document.querySelector('[role="toolbar"][aria-label="Навигация сети"]')!
    const buttons = [...controls.querySelectorAll("button")].filter((node): node is HTMLButtonElement => node instanceof HTMLButtonElement)
    expect(buttons).toHaveLength(3)
    expect(buttons.every(button => button.getAttribute("data-variant") === "contained")).toBe(true)
    const before = pose(view)
    buttons.find(button => button.getAttribute("aria-label") === "Приблизить сеть")!.click()
    await view.settle()
    expect(view.flights.at(-1)).toBeGreaterThan(0)
    view.tree.viewPoint.x += 100
    buttons.find(button => button.textContent === "Вписать сеть")!.click()
    await view.settle()
    expect(pose(view)).toEqual(before)
    view.network.select("runtime")
    await view.settle()
    const details = view.document.querySelector('[data-spatial-node-id="network:entity:runtime"]')!
    expect(details.querySelector('[data-variant="body"]')?.textContent).toBe("Cache: 1")
  } finally { view.root.unmount() }
})


test("empty observations and expired or missing endpoints never materialize an empty native line batch", async () => {
  const view = mount()
  const batch = () => view.document.querySelector('xr-line-segments[name="Наблюдаемые соединения сети"]')
  const prepareSpace = () => {
    // Public Space traversal and actual resource factories, beyond semantic validity.
    const space = readSpaceTree(view.document)
    for (const object of space.objects) {
      if (!(object instanceof XRLineSegmentsElement)) continue
      const geometry = object.geometry?.factory?.(object.geometry)
      if (geometry) expect(geometry.attributes.position!.count).toBeGreaterThan(0)
    }
  }
  try {
    await view.settle()
    expect(batch()).toBeNull()
    prepareSpace()
    view.network.present(projection)
    await view.settle()
    expect(batch()).not.toBeNull()
    prepareSpace()
    view.network.select("runtime")
    await view.settle()
    const card = view.document.querySelector('[data-spatial-node-id="network:entity:runtime"]')
    const camera = pose(view)
    view.network.present({...projection, connections: []})
    await view.settle()
    expect(batch()).toBeNull()
    prepareSpace()
    expect(view.document.querySelector('[data-spatial-node-id="network:entity:runtime"]')).toBe(card)
    expect(pose(view)).toEqual(camera)
    view.network.present(projection)
    await view.settle()
    expect(batch()).not.toBeNull()
    prepareSpace()
    // Domain report expiry removes its actual node and relation, not a stale curve.
    view.network.present({...projection, nodes: projection.nodes.filter(node => node.id !== "endpoint"), connections: []})
    await view.settle()
    expect(batch()).toBeNull()
    prepareSpace()
  } finally { view.root.unmount() }
})


test("cold Display LOD retains actual curves and bounded native labels from authoritative geometry", async () => {
  const scale = {value: .1, offset: 300}
  const view = mount(undefined, scale)
  const labels = () => [...view.document.querySelectorAll("xr-text")].filter(node => node.getAttribute("name")?.startsWith("network:label:"))
  try {
    view.network.present(projection)
    await view.settle()
    const cold = view.network.state.getSnapshot()!
    expect(cold.nodes).toHaveLength(0)
    expect(cold.geometryNodes).toHaveLength(6)
    expect(cold.contentById.size).toBe(0)
    expect(view.network.getEdgeSnapshot().edges).toHaveLength(1)
    expect(labels().length).toBeGreaterThan(0)
    expect(labels()[0]?.querySelector("xr-material")?.getAttribute("kind")).toBe("text")
    const edge = view.network.getEdgeSnapshot()
    scale.value = 2
    view.tree.viewPoint.x += 1
    await view.settle()
    expect(view.network.state.getSnapshot()!.nodes).toHaveLength(6)
    expect(labels()).toHaveLength(0)
    expect(view.network.getEdgeSnapshot()).toBe(edge)
    scale.value = .1
    view.tree.viewPoint.x += 1
    await view.settle()
    expect(view.network.state.getSnapshot()!.nodes).toHaveLength(0)
    expect(view.network.getEdgeSnapshot()).toBe(edge)
    expect(labels().length).toBeGreaterThan(0)
    view.network.present({...projection, nodes: projection.nodes.filter(node => node.id !== "endpoint"), connections: []})
    await view.settle()
    expect(view.network.getEdgeSnapshot().edges).toHaveLength(0)
    expect(view.document.querySelector('xr-text[text="WebSocket"]')).toBeNull()
    expect(view.document.querySelector('xr-line-segments[name="Наблюдаемые соединения сети"]')).toBeNull()
    view.network.dispose()
    await view.settle()
    expect(labels()).toHaveLength(0)
    expect(view.document.querySelector('xr-line-segments[name="Наблюдаемые соединения сети"]')).toBeNull()
  } finally { view.root.unmount() }
})


test("real HTTP polling retains the same compiled chat and draft through delayed refresh, failure and resume", async () => {
  const workspace = createAgentWorkspace()
  const view = mount(undefined, {value: 2, offset: 0}, workspace)
  const graph = agentWorkspaceGraph()
  graph.runtime.roots[0]!.children![0]!.ref = "atom:6"
  graph.runtime.roots[0]!.children![0]!.children![0]!.ref = "atom:7"
  const data: AgentUiSnapshot = {schema: AGENT_UI_SCHEMA, version: 1, root: "@metafor/environment", graph, verseId: "poll-verse", observedWorld: {root: graph.root, cutId: "poll-cut"},
    revision: {cutId: "poll-cut", throughSequence: 1639, retroactiveComplete: false},
    observation: {mechanism: "public-oracle-poll", photonSubscription: false}, agents: [{
      ref: "atom:6", meta: "@metafor/agent", owner: {ref: "atom:1", meta: "@metafor/environment"}, state: "idle", status: "idle",
      configuration: {resolution: "exact", issues: [], value: {id: "assistant", atom: {kind: "atom", scope: "owner"}, presentation: DEFAULT_AGENT_PRESENTATION, tools: [], displays: []}},
      chat: {ref: "atom:7", meta: "@metafor/chat", session: null}, chatSession: null, chatError: null,
      issues: [], error: null, activeTaskId: null, busy: false,
    }]} as unknown as AgentUiSnapshot
  let delayed: ReturnType<typeof Promise.withResolvers<Response>> | null = null
  const source = createAgentWorkspaceSource({fetch: async () => delayed ? delayed.promise : Response.json(data)})
  const disconnect = workspace.connect(source)
  let stop = source.start()
  try {
    await source.refresh()
    await view.settle()
    const actor = view.document.querySelector('[data-agent-atom="atom:6"]')!
    const input = view.document.querySelector('textarea[aria-label="Сообщение"]') as HTMLTextAreaElement
    input.value = "Черновик живого чата"
    input.dispatchEvent(new InputEvent("input", {bubbles: true}))
    await view.settle()
    const assertRetained = () => {
      expect(view.document.querySelector('[data-agent-atom="atom:6"]')).toBe(actor)
      expect(view.document.querySelector('textarea[aria-label="Сообщение"]')).toBe(input)
      expect(input.value).toBe("Черновик живого чата")
      expect(input.disabled).toBe(false)
    }
    for (let poll = 0; poll < 3; poll++) {
      await source.refresh()
      await view.settle()
      assertRetained()
    }
    delayed = Promise.withResolvers<Response>()
    const refresh = source.refresh()
    await view.settle()
    assertRetained()
    delayed.resolve(Response.json({error: {message: "Temporary poll failure"}}, {status: 503}))
    await expect(refresh).rejects.toThrow("Temporary poll failure")
    await view.settle()
    assertRetained()
    const send = () => [...view.document.querySelectorAll("button")].find(button => button.textContent === "Отправить") as HTMLButtonElement
    expect(send().disabled).toBe(true)
    delayed = Promise.withResolvers<Response>()
    stop()
    stop = source.start()
    const resume = source.refresh()
    await view.settle()
    assertRetained()
    delayed.resolve(Response.json(data))
    await resume
    await view.settle()
    assertRetained()
    expect(send().disabled).toBe(false)
  } finally {stop(); disconnect(); source.dispose(); view.root.unmount()}
})

test("explicit Agent workspace keeps one Document, honest empty state and same chat Element across wall/common Display", async () => {
  const bytes = await Bun.file(new URL("./bots.glb", import.meta.url)).arrayBuffer()
  const bot = await loadBot(`data:model/gltf-binary;base64,${Buffer.from(bytes).toString("base64")}`)
  const workspace = createAgentWorkspace()
  const view = mount(bot, {value: 2, offset: 0}, workspace)
  const sourceListeners = new Set<() => void>()
  let snapshot: AgentWorkspaceSnapshot = {status: "ready", graph: null, verseId: null, observedWorld: null, offices: []}
  const disconnect = workspace.connect({getSnapshot: () => snapshot, subscribe(listener) {
    sourceListeners.add(listener)
    return () => {sourceListeners.delete(listener)}
  }})
  const ref = "atom:connected-assistant" as AtomRef
  const atomListeners = new Set<() => void>()
  let atomSnapshot: AtomViewSnapshot = {ref, revision: "1", state: "idle", configuration: {
    id: "connected-assistant", atom: {kind: "atom", scope: "owner"}, presentation: DEFAULT_AGENT_PRESENTATION,
    tools: [], displays: [{id: "self", source: {kind: "atom", scope: "owner"}}],
  }, chat: [], provider: null, operations: [], context: {scope: ref}}
  const calls: string[] = []
  const atom: AtomContext = {ref, getSnapshot() {expect(this).toBe(atom); return atomSnapshot},
    subscribe(listener) {expect(this).toBe(atom); atomListeners.add(listener); return () => {atomListeners.delete(listener)}},
    actions: {async sendMessage(text) {calls.push(text)}},
  }
  try {
    await view.settle()
    expect(view.document.querySelector("#agent-control-display")?.textContent).toContain("Нет подключённых агентов")
    expect(view.document.querySelectorAll("[data-agent-atom]")).toHaveLength(0)
    expect(view.document.querySelectorAll("xr-animation")).toHaveLength(0)
    snapshot = {status: "ready", graph: null, verseId: null, observedWorld: null, offices: [{id: "office-1", owner: "atom:environment" as AtomRef, label: "Environment",
      bounds: {min: {x: -4500, y: -3500, z: 0}, max: {x: 4500, y: 3500, z: 2600}}, agents: [{id: "assistant", atom}]}]}
    for (const listener of sourceListeners) listener()
    await view.settle()
    expect(view.document.querySelectorAll("space")).toHaveLength(1)
    expect(view.document.querySelectorAll("viewpoint")).toHaveLength(1)
    expect(view.document.querySelectorAll("canvas")).toHaveLength(0)
    const element = view.document.querySelector(`[data-agent-atom="${ref}"]`)!
    expect(element).not.toBeNull()
    expect(element.parentElement?.getAttribute("data-agent-common-host")).toBe("true")
    const textarea = view.document.querySelector('textarea[aria-label="Сообщение"]') as HTMLTextAreaElement
    textarea.value = "Сохранённый черновик"
    textarea.dispatchEvent(new InputEvent("input", {bubbles: true}))
    await view.settle()
    for (let poll = 0; poll < 3; poll++) {
      snapshot = {...snapshot, offices: snapshot.offices.map(office => ({...office, agents: office.agents.map(agent => ({...agent}))}))}
      for (const listener of sourceListeners) listener()
      await view.settle()
      expect(view.document.querySelector(`[data-agent-atom="${ref}"]`)).toBe(element)
      expect(view.document.querySelector('textarea[aria-label="Сообщение"]')).toBe(textarea)
      expect(textarea.value).toBe("Сохранённый черновик")
    }
    const lastGood = snapshot
    for (const status of ["loading", "error"] as const) {
      snapshot = {status, graph: null, verseId: null, observedWorld: null, error: status === "error" ? "Обновление временно недоступно" : null, offices: []}
      for (const listener of sourceListeners) listener()
      await view.settle()
      expect(view.document.querySelector(`[data-agent-atom="${ref}"]`)).toBe(element)
      expect(view.document.querySelector('textarea[aria-label="Сообщение"]')).toBe(textarea)
      expect(textarea.value).toBe("Сохранённый черновик")
    }
    snapshot = lastGood
    for (const listener of sourceListeners) listener()
    await view.settle()
    expect(view.document.querySelector(`[data-agent-atom="${ref}"]`)).toBe(element)
    expect(textarea.value).toBe("Сохранённый черновик")
    const commonCamera = pose(view)
    expect(view.tree.viewPoint.far).toBeGreaterThanOrEqual(100000)
    workspace.showOffices()
    await view.settle()
    expect(pose(view)).not.toEqual(commonCamera)
    expect(view.document.querySelector(`[data-agent-atom="${ref}"]`)).toBe(element)
    expect(element.parentElement?.getAttribute("data-agent-wall-host")).toBe("assistant")
    expect(textarea.value).toBe("Сохранённый черновик")
    workspace.showAgents()
    await view.settle()
    expect(element.parentElement?.getAttribute("data-agent-common-host")).toBe("true")
    expect(view.document.querySelector('textarea[aria-label="Сообщение"]')).toBe(textarea)
    atomSnapshot = {...atomSnapshot, revision: "2", chat: [{id: "reply", role: "assistant", content: "Обновлённый ответ"}]}
    for (const listener of atomListeners) listener()
    await view.settle()
    expect(element.textContent).toContain("Обновлённый ответ")
    expect(textarea.value).toBe("Сохранённый черновик")
    const send = [...view.document.querySelectorAll("button")].find(button => button.textContent === "Отправить") as HTMLButtonElement
    send.click()
    await view.settle()
    expect(calls).toEqual(["Сохранённый черновик"])
    view.network.present(projection)
    workspace.showNetwork()
    await view.settle()
    expect(view.network.state.getSnapshot()?.nodes.length).toBe(6)
    view.network.select("runtime")
    workspace.showAgents()
    await view.settle()
    workspace.showNetwork()
    await view.settle()
    expect(view.document.querySelector('[data-spatial-node-id="network:entity:runtime"]')?.textContent).toContain("Cache: 1")
    const asset = view.document.querySelector('xr-asset[name="Agent instances office-1"]')
    if (!(asset instanceof XRAssetElement) || asset.factory === null) throw new Error("Office public instance asset missing")
    const native = Reflect.apply(asset.factory, undefined, []) as Object3D
    const batches = native.children.slice()
    expect(batches.filter(batch => batch instanceof InstancedSkinnedMesh)).toHaveLength(bot.primitives.length)
    expect(batches.filter(batch => batch instanceof InstancedMesh && !(batch instanceof InstancedSkinnedMesh))).toHaveLength(1)
    const additional = Array.from({length: 6}, (_, index) => {
      const addedRef = `atom:additional-${index}` as AtomRef
      const addedSnapshot = {...atomSnapshot, ref: addedRef, configuration: {...atomSnapshot.configuration, id: `additional-${index}`}}
      const context: AtomContext = {ref: addedRef, getSnapshot: () => addedSnapshot, subscribe: () => () => {}, actions: {}}
      return {id: `additional-${index}`, atom: context}
    })
    snapshot = {...snapshot, offices: snapshot.offices.map(office => ({...office, agents: [...office.agents, ...additional]}))}
    for (const listener of sourceListeners) listener()
    await view.settle()
    expect(view.document.querySelector('xr-asset[name="Agent instances office-1"]')).toBe(asset)
    expect(Reflect.apply(asset.factory, undefined, [])).toBe(native)
    expect(native.children).toEqual(batches)
    expect(batches.every(batch => !(batch instanceof InstancedSkinnedMesh) || batch.count === 7)).toBe(true)
    const devices = batches.find((batch): batch is InstancedMesh => batch instanceof InstancedMesh && !(batch instanceof InstancedSkinnedMesh))!
    expect(devices.count).toBe(14)
    expect(view.document.querySelectorAll("[data-agent-atom]")).toHaveLength(7)
    disconnect()
    await view.settle()
    expect(view.document.querySelectorAll("[data-agent-atom]")).toHaveLength(0)
    expect(sourceListeners.size).toBe(0)
  } finally {
    disconnect()
    view.root.unmount()
  }
  expect(atomListeners.size).toBe(0)
})


test("annotation pencil and Root Window use the existing HUD without sending any chat input", async () => {
  const annotations = createProductAnnotationState()
  const f = mount(undefined, {value: 2, offset: 0}, undefined, annotations)
  try {
    annotations.attach(f.presentation)
    await f.settle()
    const pencil = [...f.document.querySelectorAll("button")].find(button => button.getAttribute("aria-label") === "Аннотировать Root") as HTMLButtonElement
    expect(pencil).toBeDefined()
    expect(f.document.querySelectorAll("hud")).toHaveLength(1)
    pencil.click()
    await f.settle()
    expect(annotations.getSnapshot().enabled).toBe(true)
    const window = f.document.getElementById("root-annotation-window")!
    expect(window).toBeDefined()
    expect(window.textContent).toContain("Аннотация · Root")
    expect(window.textContent).toContain("служебное наблюдение")
    expect(f.document.querySelectorAll("textarea")).toHaveLength(0)
  } finally {f.root.unmount(); annotations.dispose()}
})


test("confirmed annotation automatically reports service data and preserves the compiled Agent user draft", async () => {
  const workspace = createAgentWorkspace(), annotations = createProductAnnotationState()
  const view = mount(undefined, {value: 2, offset: 0}, workspace, annotations)
  const ref = "atom:annotation-owner" as AtomRef
  const snapshot: AtomViewSnapshot = {ref, revision: "1", state: "idle", configuration: {id: "own-presentation", atom: {kind: "atom", scope: "owner"},
    presentation: DEFAULT_AGENT_PRESENTATION, tools: [], displays: []}, chat: [], provider: null, operations: [], context: {scope: ref}}
  const sent: string[] = []
  const atom: AtomContext = {ref, getSnapshot: () => snapshot, subscribe: () => () => {}, actions: {async sendMessage(text) {sent.push(text)}}}
  const source: AgentWorkspaceSnapshot = {status: "ready", graph: null, verseId: null, observedWorld: null, offices: [{id: "own-office", owner: "atom:environment" as AtomRef, label: "Root",
    bounds: {min: {x: -4500, y: -3500, z: 0}, max: {x: 4500, y: 3500, z: 2600}}, agents: [{id: "different-presentation-id", atom}]}]}
  const disconnect = workspace.connect({getSnapshot: () => source, subscribe: () => () => {}})
  try {
    annotations.attach(view.presentation)
    await view.settle()
    const feedback: import("@metafor/types/cosmos/client").ClientAnnotationFeedback[] = []
    annotations.connectFeedback(workspace, {source: () => ({id: "client-1", connectionId: "connection-1", world: {root: "@metafor/environment", cutId: "cut-1"}} as import("@metafor/types/cosmos/client").ClientDescriptor),
      async send(input) {feedback.push(input); return {id: input.request.id, accepted: true, replayed: false}}})
    annotations.setEnabled(true)
    const agent = view.document.querySelector(`[data-agent-atom="${ref}"]`)!
    agent.dispatchEvent(new DomEvent("click", {bubbles: true, cancelable: true}))
    await view.settle()
    expect(annotations.getSnapshot().selected?.ownAtomRef).toBe(ref)
    const draft = agent.querySelector('textarea[aria-label="Сообщение"]') as HTMLTextAreaElement
    draft.value = "Пользовательский черновик"
    draft.dispatchEvent(new InputEvent("input", {bubbles: true}))
    await view.settle()
    expect(feedback).toHaveLength(1)
    expect(feedback[0]!.agentRef).toBe(ref)
    expect(JSON.parse(feedback[0]!.request.text)).toMatchObject({kind: "ui.annotation.selected", annotation: {ownAtomRef: ref}})
    expect(draft.value).toBe("Пользовательский черновик")
    expect(sent).toEqual([])

  } finally {disconnect(); view.root.unmount(); annotations.dispose()}
})
