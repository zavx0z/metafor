import {afterAll, beforeAll, expect, spyOn, test} from "bun:test"
import {mkdtemp, rm, symlink} from "node:fs/promises"
import {join, resolve} from "node:path"
import {pathToFileURL} from "node:url"
import {createDocument, createDomRoot, HTMLTextAreaElement, HTMLButtonElement, InputEvent, subscribeDocumentCompiledStyleSheets, type DOMComponentConstructor, type Presentation} from "@zavx0z/immersive"
import {readDisplayStyle} from "@zavx0z/immersive/renderer/html"
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
let agentsForAtom: typeof import("./atom-surface").agentsForAtom
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
  agentsForAtom = (await load("atom-surface.js")).agentsForAtom
  createWorkspace = (await load("agent-workspace.js")).createAgentWorkspace
  createScene = (await load("atom-scene.js")).createAtomScene
  createNetwork = (await load("network-space.js")).createNetworkSpace
  const bytes = await Bun.file(new URL("./bots.glb", import.meta.url)).arrayBuffer()
  bot = await loadBot(`data:model/gltf-binary;base64,${Buffer.from(bytes).toString("base64")}`)
}, 30_000)
afterAll(async () => {if (directory) await rm(directory, {recursive: true, force: true})})

function fixture(initialViewport = {width: 1200, height: 800}, actorCount = 1) {
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
  const secondSnapshot: AtomViewSnapshot = {...actorSnapshot, ref: "atom:3", configuration: {...actorSnapshot.configuration, id: "second"}}
  const second: AtomContext = {ref: "atom:3", getSnapshot: () => secondSnapshot, subscribe: () => () => {}, actions: {async sendMessage() {}}}
  let input: AgentWorkspaceSnapshot = {status: "ready", graph, verseId: "fixture-verse", observedWorld: {root: graph.root, cutId: "one"}, offices: [
    {id: "office-root", owner: "atom:1", label: "Environment", bounds: {min: {x: -4500, y: -3500, z: 0}, max: {x: 4500, y: 3500, z: 2600}}, agents: [{id: "assistant", atom: actor}, ...(actorCount > 1 ? [{id: "second", atom: second}] : [])]},
  ]}
  const sourceListeners = new Set<() => void>()
  workspace.connect({getSnapshot: () => input, subscribe(listener) {sourceListeners.add(listener); return () => {sourceListeners.delete(listener)}}})
  root.render(App, {network, workspace, scene, bot})
  const tree = readSpaceTree(document), presented = new Set<() => void>(), viewport = {...initialViewport}
  let pausedFrames = false
  const presentation = {document, space: tree.space, viewPoint: tree.viewPoint, canvas: {getBoundingClientRect: () => ({left: 0, top: 0, ...viewport})},
    getProjection: () => ({frustumPlanes: () => [], projectPoint: (p: {x: number; y: number}) => ({x: p.x * 4, y: p.y * 4}), fly() {}}),
    subscribePresented(listener: () => void) {presented.add(listener); return () => {presented.delete(listener)}}, invalidate() {},
    render() {root.flush(); if (!pausedFrames) for (const listener of [...presented]) listener()},
  } as unknown as Presentation
  workspace.attach(presentation, network); scene.attach(presentation, network)
  let previous: AtomSceneRoute | undefined
  const confirmRoute = (value: AtomSceneRoute) => {
    if (JSON.stringify(previous) !== JSON.stringify(value)) workspace.parkViews()
    previous = value
    if (value.kind === "atom") {
      const scoped = agentsForAtom(workspace, value.ref)
      if (!scoped.some(agent => agent.key === workspace.getSnapshot().selected)) {
        if (scoped.length) workspace.select(scoped[0]!.key)
        else workspace.clearSelection()
      }
    } else workspace.clearSelection()
    scene.applyRoute(value)
  }
  const entries = ["/fixture-verse/1"], events = new EventTarget()
  let entry = 0, historyState: unknown = null, routeApplications = 0
  const router = createProductRouter({source: {getSnapshot: () => ({status: input.status === "error" ? "unavailable" : input.status, verseId: input.verseId, graph: input.graph,
    ...(input.observedWorld ? {observedWorld: input.observedWorld} : {}), ...(input.error ? {error: input.error} : {})}),
    subscribe(listener) {sourceListeners.add(listener); return () => {sourceListeners.delete(listener)}}},
    platform: {events, location: {get pathname() {return entries[entry]!}}, history: {get state() {return historyState},
      pushState(value, _unused, url) {historyState = value; entries.splice(++entry); entries.push(String(url))},
      replaceState(value, _unused, url) {historyState = value; entries[entry] = String(url)}}},
    applyRoute(value, application) {
      routeApplications++
      if (application.preservePresentation) return
      confirmRoute(value.kind === "atom" ? {kind: "atom", ref: value.ref} : value.kind === "networks" ? value : {kind: "unavailable", message: value.kind})
    },
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
  const settle = async () => {for (let index = 0; index < 8; index++) {root.flush(); if (!pausedFrames) for (const listener of [...presented]) listener(); await Promise.resolve()} root.flush()}
  const fitSelected = () => {
    const node = scene.getSnapshot().geometryNodes.find(node => node.id === scene.getSnapshot().selectedAtom?.ref)!
    const r = node.rect, vp = tree.viewPoint
    const pose = ViewPoint.fitPoseForBounds({min: {x: r.x, y: r.y, z: r.z - .001}, max: {x: r.x + r.width, y: r.y + r.height, z: r.z}}, {x: 0, y: 0, z: 1}, {fov: vp.fov, aspect: viewport.width / viewport.height})
    document.transaction(() => {vp.x = pose.position.x; vp.y = pose.position.y; vp.z = pose.position.z; vp.targetX = pose.target.x; vp.targetY = pose.target.y; vp.targetZ = pose.target.z})
  }
  return {document, root, workspace, scene, network, tree, route, settle, fitSelected, viewport,
    get input() {return input},
    get routeResolution() {return router.getSnapshot()},
    update(next: AgentWorkspaceSnapshot) {input = next; for (const listener of sourceListeners) listener()},
    pausePresented() {pausedFrames = true},
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
    expect(f.document.querySelectorAll('[data-agent-atom="atom:2"]')).toHaveLength(0)
    expect(f.document.querySelector('[data-spatial-node-id="atom:1"] [aria-label="Инспектор Atom"]')).not.toBeNull()
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
    expect(f.scene.enterRoom()).toBeTrue()
    await f.settle()
    expect(f.document.querySelectorAll('[data-agent-atom="atom:2"]')).toHaveLength(1)
    expect([...f.document.querySelectorAll('[data-agent-atom="atom:2"] button')].some(button => button.getAttribute("aria-label") === "Провайдер")).toBeFalse()
  } finally {f.dispose()}
})

test("one compiled Chat stays with its Agent while Atom inspector and route change", async () => {
  const f = fixture()
  try {
    await f.settle(); f.fitSelected(); await f.settle()
    expect(f.pathname).toBe("/fixture-verse/1")
    expect(f.document.querySelector('[data-agent-atom="atom:2"]')).toBeNull()
    expect(f.scene.enterRoom()).toBeTrue()
    await f.settle()
    const chat = f.document.querySelector('[data-agent-atom="atom:2"]')!, draft = chat.querySelector('textarea[aria-label="Сообщение"]')
    if (!(draft instanceof HTMLTextAreaElement)) throw new Error("Shared Chat Composer missing")
    expect(chat.parentElement?.getAttribute("data-agent-wall-host")).toBe("assistant")
    draft.value = "Черновик одного Chat"; draft.dispatchEvent(new InputEvent("input", {bubbles: true})); await f.settle()
    f.tree.viewPoint.z += 250; await f.settle()
    expect(f.workspace.getSnapshot().mode).toBe("offices")
    expect(chat.parentElement?.getAttribute("data-agent-wall-host")).toBe("assistant")
    expect(chat.querySelector("textarea")).toBe(draft)
    expect(f.scene.back()).toBeTrue()
    await f.settle()
    f.fitSelected(); await f.settle()
    expect(chat.parentElement?.getAttribute("data-agent-parking")).toBe("true")
    expect(chat.querySelector("textarea")).toBe(draft)
    expect(draft.value).toBe("Черновик одного Chat")
    expect(f.scene.enterRoom()).toBeTrue()
    await f.settle()
    expect(chat.parentElement?.getAttribute("data-agent-wall-host")).toBe("assistant")
    f.route({kind: "atom", ref: "atom:4"}); await f.settle()
    expect(chat.parentElement?.getAttribute("data-agent-parking")).toBe("true")
    expect(f.document.querySelectorAll('[data-agent-atom="atom:2"]')).toHaveLength(1)
    f.back(); await f.settle(); f.fitSelected(); await f.settle()
    expect(f.pathname).toBe("/fixture-verse/1")
    expect(chat.parentElement?.getAttribute("data-agent-parking")).toBe("true")
    expect(f.scene.enterRoom()).toBeTrue()
    await f.settle()
    expect(f.document.querySelector('[data-agent-atom="atom:2"]')).toBe(chat)
    expect(chat.querySelector("textarea")).toBe(draft)
    expect(draft.value).toBe("Черновик одного Chat")
    expect(chat.parentElement?.getAttribute("data-agent-wall-host")).toBe("assistant")
    expect(chat.ownerDocument).toBe(f.document)
  } finally {f.dispose()}
})

test("Office Display remains valid at CSS and DOM publication while the same Chat moves to parking", async () => {
  const f = fixture()
  let displays = readSpaceTree(f.document).displays
  const failures: string[] = []
  let publications = 0
  const inspect = () => {
    publications++
    for (const display of displays) {
      try {readDisplayStyle(f.document, display)}
      catch (error) {failures.push(`${display.getAttribute("data-display-id") ?? display.id}: ${String(error)}`)}
    }
  }
  const stopStyles = subscribeDocumentCompiledStyleSheets(f.document, inspect)
  const stopMutations = f.document.subscribeMutations(() => {displays = readSpaceTree(f.document).displays; inspect()})
  try {
    await f.settle()
    expect(f.scene.enterRoom()).toBeTrue()
    await f.settle()
    const chat = f.document.querySelector('[data-agent-atom="atom:2"]')!
    const draft = chat.querySelector('textarea[aria-label="Сообщение"]')
    if (!(draft instanceof HTMLTextAreaElement)) throw new Error("Shared Chat Composer missing")
    draft.value = "Draft survives Display teardown"
    draft.dispatchEvent(new InputEvent("input", {bubbles: true}))
    await f.settle()
    f.route({kind: "atom", ref: "atom:4"})
    await f.settle()
    f.back()
    await f.settle()
    expect(f.scene.enterRoom()).toBeTrue()
    await f.settle()
    expect(publications).toBeGreaterThan(0)
    expect(failures).toEqual([])
    expect(f.document.querySelector('[data-agent-atom="atom:2"]')).toBe(chat)
    expect(chat.querySelector('textarea[aria-label="Сообщение"]')).toBe(draft)
    expect(draft.value).toBe("Draft survives Display teardown")
    expect(chat.ownerDocument).toBe(f.document)
    expect(chat.parentElement?.getAttribute("data-agent-wall-host")).toBe("assistant")
  } finally {stopStyles(); stopMutations(); f.dispose()}
})

test("root and Agent Atom use the same inspector while their one Chat retains its draft", async () => {
  const f = fixture()
  try {
    await f.settle(); f.fitSelected(); await f.settle()
    expect(f.document.querySelector('[data-spatial-node-id="atom:1"] [aria-label="Инспектор Atom"]')).not.toBeNull()
    expect(f.scene.enterRoom()).toBeTrue()
    await f.settle()
    const chat = f.document.querySelector('[data-agent-atom="atom:2"]')!, draft = chat.querySelector('textarea[aria-label="Сообщение"]')
    if (!(draft instanceof HTMLTextAreaElement)) throw new Error("Shared Chat Composer missing")
    expect(chat.parentElement?.getAttribute("data-agent-wall-host")).toBe("assistant")
    expect(f.document.querySelector('[data-spatial-node-id="atom:1"] [aria-label="Инспектор Atom"]')).not.toBeNull()
    expect(f.document.querySelector('[data-spatial-node-id="atom:1"] [data-agent-common-host]')).toBeNull()
    draft.value = "Один draft при навигации"; draft.dispatchEvent(new InputEvent("input", {bubbles: true})); await f.settle()

    f.route({kind: "atom", ref: "atom:2"}); await f.settle(); f.fitSelected(); await f.settle()
    expect(f.document.querySelector('[data-spatial-node-id="atom:2"] [aria-label="Инспектор Atom"]')).not.toBeNull()
    expect(f.document.querySelector('[data-spatial-node-id="atom:2"] [data-agent-common-host]')).toBeNull()
    expect(chat.parentElement?.getAttribute("data-agent-parking")).toBe("true")
    expect(chat.querySelector('textarea[aria-label="Сообщение"]')).toBe(draft)
    expect(draft.value).toBe("Один draft при навигации")

    f.back(); await f.settle(); f.fitSelected(); await f.settle()
    expect(f.pathname).toBe("/fixture-verse/1")
    expect(chat.parentElement?.getAttribute("data-agent-parking")).toBe("true")
    expect(f.scene.enterRoom()).toBeTrue()
    await f.settle()
    expect(chat.parentElement?.getAttribute("data-agent-wall-host")).toBe("assistant")
    expect(f.document.querySelector('[data-agent-atom="atom:2"]')).toBe(chat)
    expect(chat.querySelector('textarea[aria-label="Сообщение"]')).toBe(draft)
    expect(draft.value).toBe("Один draft при навигации")
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
    expect(f.scene.enterRoom()).toBeTrue()
    await f.settle()
    const chat = f.document.querySelector('[data-agent-atom="atom:2"]')!, draft = chat.querySelector('textarea[aria-label="Сообщение"]')
    if (!(draft instanceof HTMLTextAreaElement)) throw new Error("Shared Chat Composer missing")
    draft.value = "Черновик portrait viewport"; draft.dispatchEvent(new InputEvent("input", {bubbles: true})); await f.settle()
    expect(f.scene.back()).toBeTrue()
    await f.settle()
    f.fitSelected()
    await f.settle()
    expect(chat.parentElement?.getAttribute("data-agent-parking")).toBe("true")
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
    expect(f.scene.enterRoom()).toBeTrue()
    await f.settle()
    expect(chat.parentElement?.getAttribute("data-agent-wall-host")).toBe("assistant")
    expect(f.pathname).toBe("/fixture-verse/1")
    expect(f.routeApplications).toBe(beforeRoute)
  } finally {clock.mockRestore(); f.dispose()}
})

for (const scenario of [{width: 1200, height: 800, agents: 1}, {width: 390, height: 844, agents: 2}])
test(`room opens the same Chat in a fill Window and Back restores its head and draft (${scenario.agents} agents, ${scenario.width}×${scenario.height})`, async () => {
  const f = fixture({width: scenario.width, height: scenario.height}, scenario.agents)
  let now = performance.now()
  const clock = spyOn(performance, "now").mockImplementation(() => now)
  const pulse = async () => {
    for (let step = 0; step < 25; step++) {
      now += 16
      await f.settle()
    }
  }
  const pose = () => [f.tree.viewPoint.x, f.tree.viewPoint.y, f.tree.viewPoint.z,
    f.tree.viewPoint.targetX, f.tree.viewPoint.targetY, f.tree.viewPoint.targetZ]
  try {
    await f.settle()
    expect(f.scene.enterRoom()).toBeTrue()
    await f.settle()
    const chat = f.document.querySelector('[data-agent-atom="atom:2"]')!
    const draft = chat.querySelector('textarea[aria-label="Сообщение"]')
    if (!(draft instanceof HTMLTextAreaElement)) throw new Error("Shared Chat Composer missing")
    draft.value = "Один Chat на весь viewport"
    draft.dispatchEvent(new InputEvent("input", {bubbles: true}))
    await f.settle()
    const roomPose = pose()
    const room = f.scene.getSnapshot().geometryNodes.find(node => node.id === "atom:1")!.rect
    expect(f.tree.viewPoint.y).toBeLessThan(room.y)
    expect(f.tree.viewPoint.targetX).toBe(f.tree.viewPoint.x)
    expect(f.tree.viewPoint.targetZ).toBe(f.tree.viewPoint.z)
    const key = f.workspace.getSnapshot().agents[0]!.key
    f.workspace.openChat(key)
    await pulse()
    expect(f.workspace.getSnapshot().focusedChat).toBe(key)
    expect(f.scene.getSnapshot().view).toBe("room")
    expect(chat.closest("[data-room-chat-host]")).not.toBeNull()
    expect(chat.closest("[data-window]")?.getAttribute("data-layout")).toBe("fill")
    expect(f.document.querySelectorAll('[data-agent-atom="atom:2"]')).toHaveLength(1)
    expect(chat.querySelector('textarea[aria-label="Сообщение"]')).toBe(draft)
    expect(draft.value).toBe("Один Chat на весь viewport")
    expect(f.document.querySelectorAll("canvas")).toHaveLength(0)
    f.workspace.closeChat()
    await pulse()
    expect(f.workspace.getSnapshot().focusedChat).toBeNull()
    expect(f.scene.getSnapshot().view).toBe("room")
    expect(chat.parentElement?.getAttribute("data-agent-wall-host")).toBe("assistant")
    expect(f.document.querySelector('[data-agent-atom="atom:2"]')).toBe(chat)
    expect(chat.querySelector('textarea[aria-label="Сообщение"]')).toBe(draft)
    expect(draft.value).toBe("Один Chat на весь viewport")
    expect(chat.ownerDocument).toBe(f.document)
    expect(pose()).toEqual(roomPose)
    expect(f.pathname).toBe("/fixture-verse/1")
  } finally {clock.mockRestore(); f.dispose()}
})

test("hidden room keeps its selected fullscreen Chat through transient source errors and same-world refresh", async () => {
  const f = fixture({width: 1142, height: 1088}, 2)
  try {
    await f.settle()
    expect(f.scene.enterRoom()).toBeTrue()
    await f.settle()
    f.pausePresented()
    const selected = f.workspace.getSnapshot().agents.find(agent => agent.id === "second")!.key
    const chat = f.document.querySelector('[data-agent-atom="atom:3"]')!
    const draft = chat.querySelector('textarea[aria-label="Сообщение"]')
    if (!(draft instanceof HTMLTextAreaElement)) throw new Error("Second Chat Composer missing")
    draft.value = "Сохранить выбранный Qwen при ошибке наблюдения"
    draft.dispatchEvent(new InputEvent("input", {bubbles: true}))
    f.workspace.openChat(selected)
    await f.settle()
    expect(chat.closest("[data-room-chat-host]")).not.toBeNull()
    const pose = () => [f.tree.viewPoint.x, f.tree.viewPoint.y, f.tree.viewPoint.z,
      f.tree.viewPoint.targetX, f.tree.viewPoint.targetY, f.tree.viewPoint.targetZ]
    const before = pose()
    const assertRetained = () => {
      expect(f.scene.getSnapshot().view).toBe("room")
      expect(f.workspace.getSnapshot().selected).toBe(selected)
      expect(f.workspace.getSnapshot().focusedChat).toBe(selected)
      expect(f.document.querySelector('[data-agent-atom="atom:3"]') === chat).toBeTrue()
      expect(chat.closest("[data-room-chat-host]")).not.toBeNull()
      expect(chat.querySelector('textarea[aria-label="Сообщение"]') === draft).toBeTrue()
      expect(draft.value).toBe("Сохранить выбранный Qwen при ошибке наблюдения")
      expect(pose()).toEqual(before)
      expect(f.pathname).toBe("/fixture-verse/1")
    }
    f.update({...f.input, graph: structuredClone(f.input.graph)})
    await f.settle()
    assertRetained()
    for (const error of ["Failed to fetch", "Observation temporarily unavailable"]) {
      f.update({...f.input, status: "error", error})
      await f.settle()
      expect(f.workspace.getSnapshot().input.status).toBe("error")
      expect(f.workspace.getSnapshot().input.error).toBe(error)
      expect(f.scene.getSnapshot().message).toBe(error)
      expect(f.routeResolution).toMatchObject({kind: "unavailable", error})
      expect(f.document.querySelector("#metafor-room-chat [data-window-title]")?.textContent).toContain("Наблюдение недоступно")
      assertRetained()
    }
    f.update({...f.input, status: "ready", error: null, graph: structuredClone(f.input.graph)})
    await f.settle()
    assertRetained()
    expect(f.document.querySelector("#metafor-room-chat [data-window-title]")?.textContent).not.toContain("Наблюдение недоступно")
    f.update({...f.input, status: "error", error: "Another world", observedWorld: {...f.input.observedWorld!, cutId: "two"}})
    await f.settle()
    expect(f.scene.getSnapshot().mode).toBe("unavailable")
    expect(f.workspace.getSnapshot().focusedChat).toBeNull()
  } finally {f.dispose()}
})
