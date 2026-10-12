import {afterAll, beforeAll, expect, test} from "bun:test"
import {mkdtemp, rm, symlink} from "node:fs/promises"
import {join, resolve} from "node:path"
import {pathToFileURL} from "node:url"
import {createDocument, createDomRoot, HTMLButtonElement, readDocumentCompiledStyleSheets, type DOMComponentConstructor, type Presentation} from "@zavx0z/immersive"
import {createSpaceElementFactories, readSpaceTree, XRLineSegmentsElement} from "@zavx0z/immersive/space"
import visualTemplatePlugin from "../build/template.plugin.ts"
import type {NetworkSpaceModel} from "./network-space.tsx"
import type {InfrastructureProjection} from "./infrastructure-model.ts"
import {loadBot, type Bot} from "./bot.ts"

let directory = ""
let app: DOMComponentConstructor<{network: NetworkSpaceModel; bot?: Bot | undefined}>
let createNetworkSpace: () => NetworkSpaceModel

beforeAll(async () => {
  directory = await mkdtemp(join(import.meta.dir, ".compiled-network-"))
  await symlink(resolve(import.meta.dir, "../node_modules"), join(directory, "node_modules"), "dir")
  const result = await Bun.build({
    entrypoints: [join(import.meta.dir, "app.tsx"), join(import.meta.dir, "network-space.tsx")],
    outdir: directory,
    target: "bun",
    format: "esm",
    splitting: true,
    external: ["@zavx0z/immersive", "@zavx0z/immersive/*"],
    plugins: [visualTemplatePlugin],
  })
  if (!result.success) throw new AggregateError(result.logs, "Visual network did not compile")
  app = (await import(pathToFileURL(join(directory, "app.js")).href)).App
  createNetworkSpace = (await import(pathToFileURL(join(directory, "network-space.js")).href)).createNetworkSpace
}, 30_000)

afterAll(async () => {
  if (directory !== "") await rm(directory, {recursive: true, force: true})
})

function mount(bot?: Bot, projectionScale = {value: 2, offset: 0}) {
  const document = createDocument({elementFactories: createSpaceElementFactories()})
  const html = document.createElement("html")
  const body = document.createElement("body")
  html.append(body)
  document.append(html)
  const root = createDomRoot(body)
  const network = createNetworkSpace()
  root.render(app, {network, bot})
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
  const settle = async () => {
    for (let pass = 0; pass < 5; pass += 1) {
      root.flush()
      for (const listener of listeners) listener()
      await Promise.resolve()
    }
    root.flush()
  }
  return {document, html, body, root, network, tree, settle, presentation, viewport, flights}
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
