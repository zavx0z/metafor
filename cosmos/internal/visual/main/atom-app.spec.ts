import {afterAll, beforeAll, expect, spyOn, test} from "bun:test"
import {mkdtemp, rm, symlink} from "node:fs/promises"
import {join, resolve} from "node:path"
import {pathToFileURL} from "node:url"
import {createDocument, createDomRoot, HTMLTextAreaElement, HTMLButtonElement, InputEvent, type DOMComponentConstructor, type Presentation} from "@zavx0z/immersive"
import {ViewPoint} from "@zavx0z/immersive/engine"
import {createSpaceElementFactories, readSpaceTree, XRAssetElement} from "@zavx0z/immersive/space"
import type {AtomContext, AtomViewSnapshot} from "@metafor/agent/atom"
import {DEFAULT_AGENT_PRESENTATION} from "@metafor/agent/presentation"
import type {AtomRef, RuntimeAtom} from "@metafor/types/metafor/graph"
import type {AgentWorkspaceModel, AgentWorkspaceSnapshot} from "./agent-workspace"
import type {AtomSceneModel, AtomSceneRoute} from "./atom-scene"
import type {NetworkSpaceModel} from "./network-space"
import {agentWorkspaceGraph} from "../../../release/spec/agent-graph-fixture"
import {loadBot, type Bot} from "./bot"
import {createProductRouter} from "../../../release/main/router"
import createJsxBunPlugin from "@zavx0z/immersive/compiler"

let directory = "", bot: Bot
let App: DOMComponentConstructor<{network: NetworkSpaceModel; workspace: AgentWorkspaceModel; scene: AtomSceneModel; bot: Bot}>
let AtomSurface: DOMComponentConstructor<{atom: RuntimeAtom; workspace: AgentWorkspaceModel; scene: AtomSceneModel}>
let createWorkspace: typeof import("./agent-workspace").createAgentWorkspace
let createScene: typeof import("./atom-scene").createAtomScene
let createNetwork: typeof import("./network-space").createNetworkSpace
beforeAll(async () => {
  directory = await mkdtemp(join(import.meta.dir, ".compiled-atoms-"))
  await symlink(resolve(import.meta.dir, "../node_modules"), join(directory, "node_modules"), "dir")
  // Один compiler session принадлежит одной Bun.build, включая соседние suites в одном process.
  const visualRoot = resolve(import.meta.dir, ".."), agentRoot = resolve(visualRoot, "../../../standard/agent")
  const chatRoot = resolve(Bun.resolveSync("@zavx0z/chat/composer", agentRoot), "../../../..")
  const settingsRoot = resolve(Bun.resolveSync("@zavx0z/storybook-app-web-page-shell-execution-settings", visualRoot), "..")
  const visualTemplatePlugin = createJsxBunPlugin({cwd: visualRoot, sourceRoots: [resolve(visualRoot, "main"), agentRoot, chatRoot, resolve(Bun.resolveSync("@zavx0z/storybook-chat-preferences", agentRoot), ".."), resolve(Bun.resolveSync("@zavx0z/storybook-chat-view/timeline", agentRoot), "../.."), settingsRoot ],
    styleSourceRootIds: ["@internal/visual", "@metafor/agent", "@zavx0z/chat", "@zavx0z/storybook-chat-preferences", "@zavx0z/storybook-chat-view", "@zavx0z/storybook-app-web-page-shell-execution-settings"]})
  const result = await Bun.build({entrypoints: ["app.tsx", "atom-surface.tsx", "atom-scene.ts", "agent-workspace.ts", "network-space.tsx"].map(file => join(import.meta.dir, file)),
    outdir: directory, target: "bun", conditions: ["metafor:main"], format: "esm", splitting: true,
    external: ["@zavx0z/immersive", "@zavx0z/immersive/*"], plugins: [visualTemplatePlugin]})
  if (!result.success) throw new AggregateError(result.logs, "Atom App did not compile")
  const load = (file: string) => import(pathToFileURL(join(directory, file)).href)
  App = (await load("app.js")).App
  AtomSurface = (await load("atom-surface.js")).AtomSurface
  createWorkspace = (await load("agent-workspace.js")).createAgentWorkspace
  createScene = (await load("atom-scene.js")).createAtomScene
  createNetwork = (await load("network-space.js")).createNetworkSpace
  const bytes = await Bun.file(new URL("./bots.glb", import.meta.url)).arrayBuffer()
  bot = await loadBot(`data:model/gltf-binary;base64,${Buffer.from(bytes).toString("base64")}`)
}, 30_000)
afterAll(async () => {if (directory) await rm(directory, {recursive: true, force: true})})

function fixture(initialViewport = {width: 1200, height: 800}) {
  const document = createDocument({elementFactories: createSpaceElementFactories()}), html = document.createElement("html"), body = document.createElement("body")
  html.append(body); document.append(html)
  const root = createDomRoot(body), workspace = createWorkspace({externalNavigation: true}), network = createNetwork()
  let scene: AtomSceneModel
  scene = createScene({workspace, contentFor: atom => ({type: AtomSurface, props: {atom, workspace, scene}, key: atom.ref})})
  const actorRef: AtomRef = "atom:2"
  const actorSnapshot: AtomViewSnapshot = {ref: actorRef, revision: "one", state: "idle", configuration: {id: "assistant", atom: {kind: "atom", scope: "owner"}, presentation: DEFAULT_AGENT_PRESENTATION,
    tools: [], displays: []}, chat: [{id: "hello", role: "assistant", content: "Беседа сохраняется"}], provider: null, operations: [], context: {scope: actorRef}}
  const actor: AtomContext = {ref: actorRef, getSnapshot: () => actorSnapshot, subscribe: () => () => {}, actions: {async sendMessage() {}}}
  const graph = agentWorkspaceGraph()
  const input: AgentWorkspaceSnapshot = {status: "ready", graph, verseId: "fixture-verse", observedWorld: {root: graph.root, cutId: "one"}, offices: [
    {id: "office-root", owner: "atom:1", label: "Environment", bounds: {min: {x: -4500, y: -3500, z: 0}, max: {x: 4500, y: 3500, z: 2600}}, agents: [{id: "assistant", atom: actor}]},
  ]}
  workspace.connect({getSnapshot: () => input, subscribe: () => () => {}})
  root.render(App, {network, workspace, scene, bot})
  const tree = readSpaceTree(document), presented = new Set<() => void>(), viewport = {...initialViewport}
  const presentation = {document, space: tree.space, viewPoint: tree.viewPoint, canvas: {getBoundingClientRect: () => ({left: 0, top: 0, ...viewport})},
    getProjection: () => ({frustumPlanes: () => [], projectPoint: (p: {x: number; y: number}) => ({x: p.x * 4, y: p.y * 4}), fly() {}}),
    subscribePresented(listener: () => void) {presented.add(listener); return () => {presented.delete(listener)}}, invalidate() {},
    render() {root.flush(); for (const listener of [...presented]) listener()},
  } as unknown as Presentation
  workspace.attach(presentation, network); scene.attach(presentation, network)
  let previous: AtomSceneRoute | undefined
  const confirmRoute = (value: AtomSceneRoute) => {
    if (JSON.stringify(previous) !== JSON.stringify(value)) workspace.parkViews()
    previous = value
    if (value.kind === "atom" && ["atom:1", "atom:2"].includes(value.ref)) workspace.select(workspace.getSnapshot().agents[0]!.key)
    else workspace.clearSelection()
    scene.applyRoute(value)
  }
  const entries = ["/fixture-verse/1"], events = new EventTarget()
  let entry = 0, historyState: unknown = null, routeApplications = 0
  const router = createProductRouter({source: {getSnapshot: () => ({status: "ready", verseId: input.verseId, graph: input.graph}), subscribe: () => () => {}},
    platform: {events, location: {get pathname() {return entries[entry]!}}, history: {get state() {return historyState},
      pushState(value, _unused, url) {historyState = value; entries.splice(++entry); entries.push(String(url))},
      replaceState(value, _unused, url) {historyState = value; entries[entry] = String(url)}}},
    applyRoute(value) {routeApplications++; confirmRoute(value.kind === "atom" ? {kind: "atom", ref: value.ref} : value.kind === "networks" ? value : {kind: "unavailable", message: value.kind})},
  })
  scene.setNavigation({atom(ref) {router.navigate({kind: "atom", verseId: "fixture-verse", atomId: ref.slice(5)})}, networks() {router.navigate({kind: "networks"})}})
  const display = () => [...document.querySelectorAll("[data-spatial-node-id]")].find(node => node.getAttribute("data-spatial-node-id") === scene.getSnapshot().selectedAtom?.ref)
  const stopFocus = document.subscribeMutations(batch => {
    if (scene.getSnapshot().mode === "atoms" && batch.records.some(record => record.target === tree.viewPoint || record.target === display()))
      workspace.setDisplayFocused(display()?.getAttribute("data-metafor-display-fitted") === "true")
  })
  router.start()
  const route = (value: AtomSceneRoute) => {
    if (value.kind === "atom") router.navigate({kind: "atom", verseId: "fixture-verse", atomId: value.ref.slice(5)})
    else if (value.kind === "networks") router.navigate(value)
    else confirmRoute(value)
  }
  const settle = async () => {for (let index = 0; index < 8; index++) {root.flush(); for (const listener of [...presented]) listener(); await Promise.resolve()} root.flush()}
  const fitSelected = () => {
    const node = scene.getSnapshot().geometryNodes.find(node => node.id === scene.getSnapshot().selectedAtom?.ref)!
    const r = node.rect, vp = tree.viewPoint
    const pose = ViewPoint.fitPoseForBounds({min: {x: r.x, y: r.y, z: r.z - .001}, max: {x: r.x + r.width, y: r.y + r.height, z: r.z}}, {x: 0, y: 0, z: 1}, {fov: vp.fov, aspect: viewport.width / viewport.height})
    document.transaction(() => {vp.x = pose.position.x; vp.y = pose.position.y; vp.z = pose.position.z; vp.targetX = pose.target.x; vp.targetY = pose.target.y; vp.targetZ = pose.target.z})
  }
  return {document, root, workspace, scene, network, tree, route, settle, fitSelected, input, viewport,
    get routeApplications() {return routeApplications},
    back() {if (entry > 0) {entry--; events.dispatchEvent(new Event("popstate"))}},
    get pathname() {return entries[entry]}, dispose() {router.dispose(); stopFocus(); root.unmount()}}
}

test("compiled Atom App has one Document/Space, all Matter geometry, only visited Atom Display, shared Room instances and Provider HUD", async () => {
  const f = fixture()
  try {
    f.route({kind: "atom", ref: "atom:1"}); await f.settle()
    expect(f.document.querySelectorAll("space")).toHaveLength(1)
    expect(f.document.querySelectorAll("viewpoint")).toHaveLength(1)
    expect(f.document.querySelectorAll("canvas")).toHaveLength(0)
    expect(f.document.querySelector("#agent-control-display")).toBeNull()
    const displays = [...f.document.querySelectorAll("[data-spatial-node-id]")].map(node => node.getAttribute("data-spatial-node-id"))
    expect(displays).toEqual(["atom:1"])
    expect(f.scene.getSnapshot().geometryNodes).toHaveLength(4)
    expect(f.document.querySelector("hud #storybook-execution-settings")).not.toBeNull()
    expect(f.document.querySelectorAll('[data-agent-atom="atom:2"]')).toHaveLength(1)
    const office = f.scene.getSnapshot().offices[0]!, r = f.scene.getSnapshot().geometryNodes.find(node => node.id === "atom:1")!.rect
    expect(office.office.bounds.max.z).toBe(180)
    expect(office.office.bounds.max.x - office.office.bounds.min.x).toBe(r.width)
    expect(office.office.bounds.max.y - office.office.bounds.min.y).toBe(r.height)
    const assets = f.document.querySelectorAll('xr-asset[name="Все агенты и устройства Verse"]')
    expect(assets).toHaveLength(1)
    const asset = assets[0]
    if (!(asset instanceof XRAssetElement)) throw new Error("Global instance asset is missing")
    expect(asset.factory).toBeFunction()
    const provider = f.document.querySelector('hud button[aria-controls="storybook-execution-settings"][aria-label="Настройки"]')
    if (!(provider instanceof HTMLButtonElement)) throw new Error("Provider HUD dock missing")
    provider.click(); await f.settle()
    expect(f.document.querySelector("hud #storybook-execution-settings")?.getAttribute("hidden")).toBeNull()
    expect([...f.document.querySelectorAll('[data-agent-atom="atom:2"] button')].some(button => button.getAttribute("aria-label") === "Провайдер")).toBeFalse()
  } finally {f.dispose()}
})

test("one compiled Chat moves between fitted upper Display, room and parking while draft survives route/back", async () => {
  const f = fixture()
  try {
    await f.settle(); f.fitSelected(); await f.settle()
    expect(f.pathname).toBe("/fixture-verse/1")
    const chat = f.document.querySelector('[data-agent-atom="atom:2"]')!, draft = chat.querySelector('textarea[aria-label="Сообщение"]')
    if (!(draft instanceof HTMLTextAreaElement)) throw new Error("Shared Chat Composer missing")
    expect(chat.parentElement?.getAttribute("data-agent-common-host")).toBe("true")
    draft.value = "Черновик одного Chat"; draft.dispatchEvent(new InputEvent("input", {bubbles: true})); await f.settle()
    f.tree.viewPoint.z += 250; await f.settle()
    expect(f.workspace.getSnapshot().mode).toBe("offices")
    expect(chat.parentElement?.getAttribute("data-agent-wall-host")).toBe("assistant")
    expect(chat.querySelector("textarea")).toBe(draft)
    f.fitSelected(); await f.settle()
    expect(chat.parentElement?.getAttribute("data-agent-common-host")).toBe("true")
    f.route({kind: "atom", ref: "atom:4"}); await f.settle()
    expect(chat.parentElement?.getAttribute("data-agent-parking")).toBe("true")
    expect(f.document.querySelectorAll('[data-agent-atom="atom:2"]')).toHaveLength(1)
    f.back(); await f.settle(); f.fitSelected(); await f.settle()
    expect(f.pathname).toBe("/fixture-verse/1")
    expect(f.document.querySelector('[data-agent-atom="atom:2"]')).toBe(chat)
    expect(chat.querySelector("textarea")).toBe(draft)
    expect(draft.value).toBe("Черновик одного Chat")
    expect(chat.parentElement?.getAttribute("data-agent-common-host")).toBe("true")
    expect(chat.ownerDocument).toBe(f.document)
  } finally {f.dispose()}
})

test("late old common-host cleanup preserves the new host and one Chat on Root→Agent→History Back", async () => {
  const f = fixture()
  try {
    await f.settle(); f.fitSelected(); await f.settle()
    const chat = f.document.querySelector('[data-agent-atom="atom:2"]')!, draft = chat.querySelector('textarea[aria-label="Сообщение"]')
    if (!(draft instanceof HTMLTextAreaElement)) throw new Error("Shared Chat Composer missing")
    const rootHost = chat.parentElement!
    expect(rootHost.getAttribute("data-agent-common-host")).toBe("true")
    expect(rootHost.closest("[data-spatial-node-id]")?.getAttribute("data-spatial-node-id")).toBe("atom:1")
    draft.value = "Один draft для двух Agent Surface"; draft.dispatchEvent(new InputEvent("input", {bubbles: true})); await f.settle()

    f.route({kind: "atom", ref: "atom:2"}); await f.settle(); f.fitSelected(); await f.settle()
    const agentHost = chat.parentElement!
    expect(agentHost).not.toBe(rootHost)
    expect(agentHost.closest("[data-spatial-node-id]")?.getAttribute("data-spatial-node-id")).toBe("atom:2")
    f.workspace.releaseCommon(rootHost)
    await f.settle()
    expect(chat.parentElement).toBe(agentHost)
    expect(chat.querySelector('textarea[aria-label="Сообщение"]')).toBe(draft)
    expect(draft.value).toBe("Один draft для двух Agent Surface")
    expect(f.document.querySelectorAll('[data-agent-atom="atom:2"]')).toHaveLength(1)

    f.back(); await f.settle(); f.fitSelected(); await f.settle()
    const restoredHost = chat.parentElement!
    expect(f.pathname).toBe("/fixture-verse/1")
    expect(restoredHost.closest("[data-spatial-node-id]")?.getAttribute("data-spatial-node-id")).toBe("atom:1")
    f.workspace.releaseCommon(agentHost)
    await f.settle()
    expect(chat.parentElement).toBe(restoredHost)
    expect(restoredHost.getAttribute("data-agent-common-host")).toBe("true")
    expect(f.document.querySelector('[data-agent-atom="atom:2"]')).toBe(chat)
    expect(chat.querySelector('textarea[aria-label="Сообщение"]')).toBe(draft)
    expect(draft.value).toBe("Один draft для двух Agent Surface")
    expect(f.document.querySelectorAll('[data-agent-atom="atom:2"]')).toHaveLength(1)
  } finally {f.dispose()}
})

test("portrait Display and Room follow native resize, keep fitted view and retain one Chat draft and Atom URI", async () => {
  const f = fixture({width: 390, height: 844})
  let now = performance.now()
  const clock = spyOn(performance, "now").mockImplementation(() => now)
  try {
    await f.settle(); f.fitSelected(); await f.settle()
    expect(f.scene.getSnapshot().geometryNodes.every(node => node.viewport.width === 390 && node.viewport.height === 844)).toBeTrue()
    const chat = f.document.querySelector('[data-agent-atom="atom:2"]')!, draft = chat.querySelector('textarea[aria-label="Сообщение"]')
    if (!(draft instanceof HTMLTextAreaElement)) throw new Error("Shared Chat Composer missing")
    draft.value = "Черновик portrait viewport"; draft.dispatchEvent(new InputEvent("input", {bubbles: true})); await f.settle()
    const beforeRoute = f.routeApplications, beforeGeometry = f.scene.spatial.getSnapshot()!.geometryRevision
    f.viewport.width = 430; f.viewport.height = 932
    await f.settle()
    now += 400; await f.settle()
    expect(f.scene.spatial.getSnapshot()!.geometryRevision).toBeGreaterThan(beforeGeometry)
    expect(f.scene.getSnapshot().geometryNodes.every(node => node.viewport.width === 430 && node.viewport.height === 932)).toBeTrue()
    const selected = f.document.querySelector('[data-spatial-node-id="atom:1"]')!
    expect(selected.getAttribute("data-metafor-display-fitted")).toBe("true")
    const office = f.scene.getSnapshot().offices[0]!, rect = f.scene.getSnapshot().geometryNodes.find(node => node.id === "atom:1")!.rect
    expect(office.office.bounds.max.x - office.office.bounds.min.x).toBe(rect.width)
    expect(office.office.bounds.max.y - office.office.bounds.min.y).toBe(rect.height)
    expect(f.document.querySelector('[data-agent-atom="atom:2"]')).toBe(chat)
    expect(chat.querySelector('textarea[aria-label="Сообщение"]')).toBe(draft)
    expect(draft.value).toBe("Черновик portrait viewport")
    expect(chat.parentElement?.getAttribute("data-agent-common-host")).toBe("true")
    expect(f.pathname).toBe("/fixture-verse/1")
    expect(f.routeApplications).toBe(beforeRoute)
  } finally {clock.mockRestore(); f.dispose()}
})
