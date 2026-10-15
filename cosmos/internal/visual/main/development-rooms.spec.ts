import {afterAll, beforeAll, expect, test} from "bun:test"
import {mkdtemp, rm, symlink} from "node:fs/promises"
import {join, resolve} from "node:path"
import {pathToFileURL} from "node:url"
import {createDocument, createDocumentClipboardController, createDomRoot, Event as DomEvent, flushDocumentLayoutObservers, type DOMComponentConstructor, type Presentation} from "@zavx0z/immersive"
import {createDocumentRenderer, readDisplayStyle} from "@zavx0z/immersive/renderer/html"
import {createSpaceElementFactories, readSpaceTree, XRAssetElement} from "@zavx0z/immersive/space"
import type {DevelopmentCatalog} from "../../../release/shared/development"
import type {DevelopmentRoomAgentsModel} from "./development-room-agents"
import type {DevelopmentRoomSceneModel} from "./development-room-scene"
import {loadBot, type Bot} from "./bot"
import {createDevelopmentCatalog} from "../../../release/server/development-catalog"
import visualTemplatePlugin from "../build/template.plugin"

let directory = "", bot: Bot
let Fixture: DOMComponentConstructor<{active: boolean; bot: Bot; scene: DevelopmentRoomSceneModel; agents: DevelopmentRoomAgentsModel; onSelectPackage?(name: string): void}>
let createScene: typeof import("./development-room-scene").createDevelopmentRoomScene
let createAgents: typeof import("./development-room-agents").createDevelopmentRoomAgents
let createSurface: typeof import("@zavx0z/storybook-app-web-page-shell/surface").createEmbeddedSurface
let createContent: typeof import("@zavx0z/storybook-app-web-page-package/content").createSourcePackageContent
let projectCatalog: typeof import("./development-room-minimap").sourcePackageCatalog
let roomCatalogItems: typeof import("./development-room-catalog").developmentRoomCatalogItems
let actualRootCatalog: DevelopmentCatalog
beforeAll(async () => {
  directory = await mkdtemp(join(import.meta.dir, ".compiled-development-rooms-"))
  await symlink(resolve(import.meta.dir, "../node_modules"), join(directory, "node_modules"), "dir")
  const result = await Bun.build({
    entrypoints: ["development-rooms.fixture.tsx", "development-room-scene.ts", "development-room-agents.ts"].map(file => join(import.meta.dir, file)),
    outdir: directory, target: "bun", conditions: ["metafor:main"], format: "esm", splitting: true,
    external: ["@zavx0z/immersive", "@zavx0z/immersive/*"],
    plugins: [visualTemplatePlugin],
  })
  if (!result.success) throw new AggregateError(result.logs, "Development Rooms did not compile")
  const load = (file: string) => import(pathToFileURL(join(directory, file)).href)
  const fixtureModule = await load("development-rooms.fixture.js")
  Fixture = fixtureModule.DevelopmentRoomsFixture
  createSurface = fixtureModule.createEmbeddedSurface
  createContent = fixtureModule.createSourcePackageContent
  projectCatalog = fixtureModule.sourcePackageCatalog
  roomCatalogItems = fixtureModule.developmentRoomCatalogItems
  createScene = (await load("development-room-scene.js")).createDevelopmentRoomScene
  createAgents = (await load("development-room-agents.js")).createDevelopmentRoomAgents
  const bytes = await Bun.file(new URL("./bots.glb", import.meta.url)).arrayBuffer()
  bot = await loadBot(`data:model/gltf-binary;base64,${Buffer.from(bytes).toString("base64")}`)
  const assignedRoot = await createDevelopmentCatalog({id: "fixture", rootPackage: "metafor",
    roots: [{name: "metafor", directory: resolve(import.meta.dir, "../../../.."), writable: true}], stateDirectory: "/unused"})
  actualRootCatalog = {...assignedRoot.snapshot,
    packages: assignedRoot.snapshot.packages.filter(pkg => pkg.name === "metafor"),
    nodes: assignedRoot.snapshot.nodes?.filter(node => node.packageName === "metafor") ?? []}
}, 60_000)
afterAll(async () => {if (directory) await rm(directory, {recursive: true, force: true})})

const catalog: DevelopmentCatalog = {schema: "cosmos:development/v1", workspaceId: "fixture", rootPackage: "@fixture/root", revision: "one", dependencies: [],
  packages: [
    {name: "@fixture/root", label: "Root", address: "/root", owner: null, ownerName: null, resolution: "source", writable: true},
    {name: "@fixture/child", label: "Child", address: "/child", owner: "@fixture/root", ownerName: "@fixture/root", resolution: "source", writable: true},
    {name: "@fixture/storybook", label: "Storybook", address: "/storybook", owner: null, ownerName: null, resolution: "source", writable: true},
    {name: "@fixture/immersive", label: "Immersive", address: "/immersive", owner: null, ownerName: null, resolution: "source", writable: true},
    {name: "@fixture/highlighter", label: "Highlighter", address: "/highlighter", owner: null, ownerName: null, resolution: "source", writable: true},
    {name: "external-lib", label: "External", address: "/external", owner: null, ownerName: null, resolution: "external", writable: false},
  ]}

test("Workbench nodes use the assigned Package route; node identity stays in the event", () => {
  const pkg = actualRootCatalog.packages[0]!
  const nodes = actualRootCatalog.nodes!
  const items = roomCatalogItems(pkg, nodes)
  expect(nodes.find(node => node.id === "package:metafor")).toMatchObject({kind: "package", routePath: "", sourcePath: "package.json"})
  expect(items.find(item => item.id === "package:metafor")).toMatchObject({route: "/cosmos/package/metafor"})
  expect(items.some(item => item.parentId === "package:metafor")).toBe(true)
  expect(items.every(item => item.route === pkg.address)).toBe(true)
})

test("Minimap keeps all assigned source Package names in a bounded forest and excludes external metadata", () => {
  const sources = Array.from({length: 437}, (_, index) => ({name: `@fixture/package-${index}`, label: `Package ${index}`,
    address: `/package-${index}`, owner: null, ownerName: index < 4 ? null : `@fixture/package-${index % 4}`,
    resolution: "source" as const, writable: true}))
  const externals = Array.from({length: 58}, (_, index) => ({name: `external-${index}`, label: `External ${index}`,
    address: `/external-${index}`, owner: null, ownerName: null, resolution: "external" as const, writable: false}))
  const projected = projectCatalog({...catalog, packages: [...sources, ...externals]})
  expect(projected.items).toHaveLength(437)
  expect(projected.items.filter(item => !("parentId" in item))).toHaveLength(4)
  expect(projected.items[4]).toMatchObject({id: "@fixture/package-4", parentId: "@fixture/package-0"})
  expect(projected.names.has("@fixture/package-436")).toBe(true)
  expect(projected.names.has("external-0")).toBe(false)
})

test("compiled Source Surface rolls back a failed first mount and opens the same Package on retry", async () => {
  const document = createDocument({elementFactories: createSpaceElementFactories()})
  const html = document.createElement("html"), body = document.createElement("body")
  html.append(body)
  document.append(html)
  const clipboard = createDocumentClipboardController(document)
  const root = createDomRoot(body)
  let attempts = 0, contentAttempts = 0
  const scene = createScene({
    navigate() {},
    visit() {},
    createView(presentation, id, title, mount, display, release) {
      const handle = createSurface({root: presentation, display, hudId: "cosmos-development-hud", title, mount,
        onRelease: release})
      const nodes = actualRootCatalog.nodes!.filter(node => node.packageName === id)
      let content: ReturnType<typeof createContent> | null = null
      const ready = handle.ready.then(surface => {
        surface.workbench.update("catalog.items", attempts++ === 0
          ? [{id: nodes[0]!.id, label: nodes[0]!.label, route: ""}]
          : roomCatalogItems(actualRootCatalog.packages[0]!, nodes))
        surface.workbench.update("catalog.active", `package:${id}`)
        content = createContent({surface, content: {
          packageName: id,
          node: nodes[0]!,
          revision: "one",
          overview: {label: title, description: "Исходный Package"},
          documentation: null,
          entries: [],
          contracts: [],
          dependencies: [],
          scenarios: {sourcePaths: [], executable: false, reason: "not prepared"},
        }})
      }).catch(error => {handle.dispose(); throw error})
      const readContent = async () => {
        if (contentAttempts++ === 0) throw new Error("Содержание Package недоступно")
      }
      const initialContent = ready.then(readContent)
      void initialContent.catch(() => {})
      return {display, ready, content: initialContent, reload: () => ready.then(readContent),
        dispose() {content?.dispose(); handle.dispose()}}
    },
  })
  scene.configure(actualRootCatalog)
  scene.setActive(true)
  const agents = createAgents({
    content: async () => {throw new Error("not used")},
    agents: {list: async () => [], create: async () => {throw new Error("not used")}},
    chat: () => {throw new Error("not used")},
  }, () => null)
  const selections: string[] = []
  const selectPackage = (name: string) => {selections.push(name); scene.applyRoute(name)}
  root.render(Fixture, {active: true, scene, agents, bot, onSelectPackage: selectPackage})
  const tree = readSpaceTree(document), presented = new Set<() => void>()
  const presentation = {document, space: tree.space, viewPoint: tree.viewPoint,
    canvas: {getBoundingClientRect: () => ({left: 0, top: 0, width: 1200, height: 800})},
    getProjection: () => ({kind: "space", owner: tree.space, frustumPlanes: () => [],
      projectPoint: (p: {x: number; y: number}) => ({x: p.x, y: p.y}), fly() {}}),
    subscribePresented(listener: () => void) {presented.add(listener); return () => {presented.delete(listener)}},
    invalidate() {}, render() {root.flush(); for (const listener of presented) listener()},
  } as unknown as Presentation
  scene.attach(presentation)
  const renderer = createDocumentRenderer({document, root: tree.space, viewport: {width: 1200, height: 800}})
  const settle = async () => {for (let n = 0; n < 8; n++) {root.flush(); renderer.flush(); flushDocumentLayoutObservers(document); await Bun.sleep(0)}}
  try {
    await settle()
    const rootRow = [...document.querySelectorAll('[data-storybook-minimap] [role="treeitem"]')]
      .find(node => node.textContent?.includes("MetaFor"))
    expect(rootRow).toBeDefined()
    document.transaction(() => rootRow!.dispatchEvent(new DomEvent("click", {bubbles: true})))
    await settle()
    expect(selections).toEqual(["metafor"])
    expect(scene.getSnapshot().error).toBe("Catalog item route must not be empty")
    expect(document.querySelectorAll("[data-storybook-workbench]")).toHaveLength(0)
    document.transaction(() => rootRow!.dispatchEvent(new DomEvent("click", {bubbles: true})))
    await settle()
    expect(selections).toEqual(["metafor", "metafor"])
    expect(attempts).toBe(2)
    expect(scene.getSnapshot().error).toBe("Содержание Package недоступно")
    expect(document.querySelectorAll('[data-spatial-node-id="metafor"] [data-storybook-workbench]')).toHaveLength(1)
    const display = document.querySelector('[data-spatial-node-id="metafor"]') as import("@zavx0z/immersive").DisplayElement
    scene.configure({...actualRootCatalog, revision: "content-error"})
    expect(scene.getSnapshot().error).toBe("Содержание Package недоступно")
    document.transaction(() => rootRow!.dispatchEvent(new DomEvent("click", {bubbles: true})))
    await settle()
    expect(selections).toEqual(["metafor", "metafor", "metafor"])
    expect(scene.getSnapshot().error).toBeNull()
    expect(document.querySelector('[data-spatial-node-id="metafor"]')).toBe(display)
    scene.setActive(false)
    scene.configure({...actualRootCatalog, revision: "two"})
    root.render(Fixture, {active: false, scene, agents, bot, onSelectPackage: selectPackage})
    await settle()
    expect(display.hidden).toBe(true)
    scene.setActive(true)
    root.render(Fixture, {active: true, scene, agents, bot, onSelectPackage: selectPackage})
    await settle()
    expect(display.hidden).toBe(false)
    expect(scene.getSnapshot().catalog?.revision).toBe("two")
    const returnedRow = [...document.querySelectorAll('[data-storybook-minimap] [role="treeitem"]')]
      .find(node => node.textContent?.includes("MetaFor"))
    expect(returnedRow).toBeDefined()
    document.transaction(() => returnedRow!.dispatchEvent(new DomEvent("click", {bubbles: true})))
    await settle()
    expect(selections).toEqual(["metafor", "metafor", "metafor", "metafor"])
    expect(attempts).toBe(2)
    expect(document.querySelectorAll('[data-spatial-node-id="metafor"] [data-storybook-workbench]')).toHaveLength(1)
  } finally {
    renderer.dispose()
    root.unmount()
    agents.dispose()
    scene.dispose()
    clipboard.dispose()
  }
})

test("actual renderer keeps one Space and package Display, enters nested room with two overhead chats, opens one fullscreen and returns", async () => {
  const document = createDocument({elementFactories: createSpaceElementFactories()}), html = document.createElement("html"), body = document.createElement("body")
  html.append(body)
  document.append(html)
  const clipboard = createDocumentClipboardController(document)
  const root = createDomRoot(body)
  const created: string[] = [], visits: string[] = []
  const agents = createAgents({
    content: async () => {throw new Error("not used")},
    agents: {async list(name) {visits.push(name); return [{executorId: "one", label: "Первый"}, {executorId: "two", label: "Второй"}]},
      async create() {throw new Error("not used")}},
    chat({executorId}) {
      created.push(executorId)
      const element = document.createElement("div")
      element.setAttribute("data-chat-executor", executorId)
      return {element, moveTo(host) {host.append(element)}, setVisible(value) {element.hidden = !value}, dispose() {element.remove()}}
    },
  }, name => catalog.packages.find(pkg => pkg.name === name)?.address ?? null)
  const scene = createScene({navigate() {}, visit(name) {agents.setRoom(name); void agents.visit(name)},
    createView(presentation, id, title, mount, display, release) {
      const handle = createSurface({root: presentation, display, hudId: "cosmos-development-hud", title, mount, onRelease: release})
      let content: ReturnType<typeof createContent> | null = null
      const ready = handle.ready.then(surface => {
        content = createContent({surface, content: {packageName: id, node: {id, kind: "package", packageName: id, label: title,
          parentId: id === "@fixture/child" ? "@fixture/root" : null, childIds: [], routePath: id, sourcePath: "."}, revision: "one",
          overview: {label: title, description: `Описание ${title}`}, documentation: null, entries: [], contracts: [],
          dependencies: [], scenarios: {sourcePaths: [], executable: false, reason: "not prepared"}}})
      }).catch(error => {handle.dispose(); throw error})
      return {display, ready, dispose() {content?.dispose(); handle.dispose()}}
    }})
  scene.configure(catalog)
  scene.applyRoute(null)
  scene.setActive(true)
  agents.setActive(true)
  const selections: string[] = []
  const selectPackage = (name: string) => {selections.push(name); scene.applyRoute(name)}
  root.render(Fixture, {active: true, scene, agents, bot, onSelectPackage: selectPackage})
  const tree = readSpaceTree(document), presented = new Set<() => void>()
  const presentation = {document, space: tree.space, viewPoint: tree.viewPoint,
    canvas: {getBoundingClientRect: () => ({left: 0, top: 0, width: 1200, height: 800})},
    getProjection: () => ({kind: "space", owner: tree.space, frustumPlanes: () => [], projectPoint: (p: {x: number; y: number}) => ({x: p.x, y: p.y}), fly() {}}),
    subscribePresented(listener: () => void) {presented.add(listener); return () => {presented.delete(listener)}},
    invalidate() {}, render() {root.flush(); for (const listener of presented) listener()},
  } as unknown as Presentation
  scene.attach(presentation)
  agents.attach(presentation)
  const renderer = createDocumentRenderer({document, root: tree.space, viewport: {width: 1200, height: 800}})
  const settle = async () => {for (let n = 0; n < 8; n++) {root.flush(); renderer.flush(); flushDocumentLayoutObservers(document); await Bun.sleep(0)}}
  try {
    await settle()
    expect(document.querySelectorAll("space")).toHaveLength(1)
    expect(document.querySelectorAll("viewpoint")).toHaveLength(1)
    expect(document.querySelectorAll("hud")).toHaveLength(1)
    const hud = document.querySelector("hud")!
    const minimap = hud.querySelector("[data-storybook-minimap]")!
    expect(minimap).not.toBeNull()
    expect(minimap.closest("[data-window-area]")?.parentElement).toBe(hud)
    expect(minimap.textContent).toContain("Storybook")
    expect(minimap.textContent).toContain("Immersive")
    expect(minimap.textContent).toContain("Highlighter")
    expect(minimap.textContent).not.toContain("External")
    expect(scene.getSnapshot().view).toBe("overview")
    expect(scene.getSnapshot().geometryNodes.map(node => [node.id, node.parentId ?? null])).toEqual([
      ["@fixture/root", null], ["@fixture/child", "@fixture/root"],
      ["@fixture/storybook", null], ["@fixture/immersive", null], ["@fixture/highlighter", null],
    ])
    expect(document.querySelectorAll("[data-storybook-workbench]")).toHaveLength(0)
    const storybookRow = [...minimap.querySelectorAll('[role="treeitem"]')].find(node => node.textContent?.includes("Storybook")) as import("@zavx0z/immersive").HTMLElement | undefined
    expect(storybookRow).toBeDefined()
    storybookRow!.dispatchEvent(new DomEvent("click", {bubbles: true}))
    await settle()
    expect(selections).toEqual(["@fixture/storybook"])
    scene.applyRoute("@fixture/child")
    await settle()
    expect(document.querySelector('[data-spatial-node-id="@fixture/child"]')).not.toBeNull()
    expect(document.querySelector('[data-spatial-node-id="@fixture/child"] [data-storybook-workbench]')).not.toBeNull()
    expect(document.querySelector('[data-spatial-node-id="@fixture/root"] [data-storybook-workbench]')).toBeNull()
    expect(scene.enterRoom()).toBe(true)
    await settle()
    expect(visits).toEqual(["@fixture/child"])
    expect(created).toEqual(["one", "two"])
    expect(document.querySelectorAll("[data-development-actor]")).toHaveLength(2)
    const office = document.querySelector('xr-asset[name="Агенты Child"]')
    expect(office).toBeInstanceOf(XRAssetElement)
    expect((office as XRAssetElement).visible).toBe(true)
    const first = document.querySelector('[data-chat-executor="one"]')!
    const second = document.querySelector('[data-chat-executor="two"]')!
    expect(first.closest("[data-development-chat-wall]")).not.toBeNull()
    expect(second.closest("[data-development-chat-wall]")).not.toBeNull()
    agents.open("one")
    await settle()
    expect(document.querySelector('[data-chat-executor="one"]')).toBe(first)
    expect(first.closest("[data-development-chat-window]")).not.toBeNull()
    expect(second.closest("[data-development-chat-wall]")).not.toBeNull()
    agents.close()
    await settle()
    expect(first.closest("[data-development-chat-wall]")).not.toBeNull()
    expect(scene.back()).toBe(true)
    await settle()
    expect(scene.getSnapshot().view).toBe("display")
    expect(document.querySelector('[data-spatial-node-id="@fixture/child"] [data-storybook-workbench]')).not.toBeNull()
    scene.setActive(false)
    agents.setActive(false)
    root.render(Fixture, {active: false, scene, agents, bot, onSelectPackage: selectPackage})
    await settle()
    expect(first.closest("[data-development-chat-parking]")).not.toBeNull()
    expect(document.querySelectorAll("space")).toHaveLength(1)
    expect(hud.querySelector("[data-storybook-minimap]")).toBeNull()
    scene.setActive(true)
    agents.setActive(true)
    root.render(Fixture, {active: true, scene, agents, bot, onSelectPackage: selectPackage})
    await settle()
    expect(document.querySelector('[data-spatial-node-id="@fixture/child"] [data-storybook-workbench]')).not.toBeNull()
    expect(document.querySelector('[data-chat-executor="one"]')).toBe(first)
    expect(readDisplayStyle(document, document.querySelector('[data-spatial-node-id="@fixture/child"]') as import("@zavx0z/immersive").DisplayElement).transform.visible).toBe(true)
  } finally {
    renderer.dispose()
    root.unmount()
    agents.dispose()
    scene.dispose()
    clipboard.dispose()
  }
})
