import type {DevelopmentCatalog, DevelopmentObserver} from "../../../release/shared/development"
/**
Browser entrypoint готовой визуальной среды Cosmos.

Release предоставляет native Canvas и declaration default font. Visual
подключает свой декларативный App через Browser createRoot/render; готовый runtime
экспортируется после первого представленного кадра. Его unmount освобождает
компоненты, browser lifecycle и объявленные App stylesheet links.

Пользовательский [закон визуальной среды](../README.md#визуальная-среда-main)
отделяет эту инфраструктуру от смысла показываемых Quantum/metafor данных.
Сценарии проверяют [Visual App](./app.spec.ts) и
[граница Cosmos](../../../tests/ham-005.boundary.spec.ts).

@packageDocumentation
*/

import {createRoot, type CustomEvent, type DOMComponentConstructor, type Event, type HTMLElement} from "@zavx0z/immersive"
import {inspectRoot} from "@zavx0z/immersive"
import {App} from "./app.tsx"
import {createNetworkSpace} from "./network-space.tsx"
import {createAgentWorkspace, type AgentWorkspaceSource} from "./agent-workspace"
import {loadBot} from "./bot"
import {createProductAnnotationState} from "./product-annotation-state"
import {createClientControls} from "./client-controls"
import {createClientDiagnostics} from "./client-diagnostics"
import {awaitVisualReady} from "./readiness"
import {createAtomScene, type AtomSceneModel, type AtomSceneRoute} from "./atom-scene"
import {AtomSurface, agentsForAtom} from "./atom-surface"
import type {ClientViewAction} from "@metafor/types/cosmos/client"
import type {InfrastructureProjection} from "./infrastructure-model.ts"
import type {ReleaseSettingsClient} from "./release-settings"
import {createDevelopmentRoomScene} from "./development-room-scene"
import {createDevelopmentRoomAgents} from "./development-room-agents"
import {createDevelopmentRoomClient, selectSourcePackage} from "./development-room-client"
import {createDevelopmentSocket, developmentChatFetcher, developmentSourceClient, readDevelopmentCatalog} from "./development-client"
import {createEmbeddedSurface} from "@zavx0z/storybook-app-web-page-shell/surface"
import {createPinnedChatHost} from "@zavx0z/storybook-app-web-page-shell-workbench/chat"
import {createSourcePackageContent} from "@zavx0z/storybook-app-web-page-package/content"
import {createDevelopmentRoomPresentations} from "./development-room-presentations"
import {inspectDevelopmentRoom} from "./development-room-inspection"

export type {AgentWorkspaceSource, AgentWorkspaceSnapshot, AgentOfficeSnapshot, AgentOfficeActor, AgentConnectableSlot, AgentFieldValue, AgentFieldUpdate,
  CosmosConversationClient, CosmosConversationDirectoryClient, CosmosConversationSnapshot, CosmosConversationSelection} from "./agent-workspace-types"
export {CosmosAgentChat, type CosmosAgentChatProps} from "./cosmos-agent-chat"
export type {InfrastructureProjection} from "./infrastructure-model.ts"

/** Точный browser environment этого platform entrypoint. */
export const environment = "main" as const

const canvas = globalThis.document.getElementById("visual-canvas")
if (!(canvas instanceof HTMLCanvasElement)) throw new Error("Window visual canvas #visual-canvas is missing")
const packageVersion = import.meta.env.COSMOS_PACKAGE_VERSION
if (typeof packageVersion !== "string" || packageVersion.length === 0) {
  throw new Error("Window visual package version is missing")
}

/** Управление единственным приложением; render обновляет его без потери состояния. */
export const root = createRoot(canvas)
const network = createNetworkSpace()
const workspace = createAgentWorkspace({externalNavigation: true})
const scene: AtomSceneModel = createAtomScene({workspace, contentFor: atom => ({
  type: AtomSurface as unknown as DOMComponentConstructor<{atom: typeof atom; workspace: typeof workspace; scene: AtomSceneModel}>,
  props: {atom, workspace, scene}, key: atom.ref,
})})
const annotations = createProductAnnotationState()
let releaseManagement: ReleaseSettingsClient | undefined
let development: {active: boolean; packageName: string | null} | undefined
let developmentNavigation: {open(): void; quantum(): void; navigate(name: string): void; observe: DevelopmentObserver} | undefined
let developmentCatalog: DevelopmentCatalog | null = null
function selectDevelopmentPackage(name: string) {
  if (!developmentNavigation) throw Object.assign(new Error("Development navigation is not assigned"), {code: "unsupported"})
  selectSourcePackage(developmentCatalog, name, developmentNavigation.navigate)
}
let developmentCatalogRequest: Promise<void> | null = null
let developmentCatalogError: string | null = null
const developmentDirty = new Map<string, boolean>()
function captureCamera() {
  const eye = runtime.viewPoint
  return {x: eye.x, y: eye.y, z: eye.z, targetX: eye.targetX, targetY: eye.targetY, targetZ: eye.targetZ,
    fov: eye.fov, near: eye.near, far: eye.far, controls: eye.controls, navigation: eye.navigation, flySpeed: eye.flySpeed}
}
let quantumCamera: ReturnType<typeof captureCamera> | null = null
let developmentCamera: ReturnType<typeof captureCamera> | null = null
function restoreCamera(value: ReturnType<typeof captureCamera>) {
  runtime.document.transaction(() => {
    const eye = runtime.viewPoint
    eye.x = value.x; eye.y = value.y; eye.z = value.z
    eye.targetX = value.targetX; eye.targetY = value.targetY; eye.targetZ = value.targetZ
    eye.fov = value.fov; eye.near = value.near; eye.far = value.far
    eye.controls = value.controls; eye.navigation = value.navigation; eye.flySpeed = value.flySpeed
  })
  runtime.invalidate()
}
const developmentPorts = createDevelopmentRoomClient(() => developmentCatalog, ({address, label, executorId}) => {
  if (!developmentNavigation) throw new Error("Development navigation is not assigned")
  return createPinnedChatHost({document: root.document, address, label, executorId, fetcher: developmentChatFetcher,
    createSocket: () => createDevelopmentSocket(developmentNavigation!.observe)})
})
const developmentAgents = createDevelopmentRoomAgents(developmentPorts,
  packageName => developmentCatalog?.packages.find(pkg => pkg.name === packageName)?.address ?? null)
const developmentScene = createDevelopmentRoomScene({
  navigate(name) {developmentNavigation?.navigate(name)},
  visit(name) {developmentAgents.setRoom(name); void developmentAgents.visit(name)},
  canRelease(name) {return developmentDirty.get(name) !== true},
  createView(presentation, id, title, mount, display, onRelease) {
    const catalog = developmentCatalog
    const pkg = catalog?.packages.find(value => value.name === id)
    if (!pkg || !catalog) throw new Error("Package отсутствует в назначенном каталоге Cosmos")
    const nodes = catalog.nodes?.filter(node => node.packageName === id) ?? []
    const nodeIds = new Set(nodes.map(node => node.id))
    const surface = createEmbeddedSurface({root: presentation, display, hudId: "cosmos-development-hud",
      title, statusOwner: "Cosmos", mount, onRelease})
    let disposed = false
    let contentRequest = 0
    let contentController: ReturnType<typeof createSourcePackageContent> | null = null
    surface.workbench.update("catalog.label", "Структура Package")
    surface.workbench.update("catalog.items", nodes.map(node => ({id: node.id, label: node.label, route: node.routePath,
      searchText: `${node.label} ${node.sourcePath}`,
      ...(node.parentId && nodeIds.has(node.parentId) ? {parentId: node.parentId} : {})})))
    surface.workbench.update("catalog.active", `package:${id}`)
    surface.showMessage("Package", title, "Загрузка содержания Package…")
    const showNode = async (nodeId?: string) => {
      const request = ++contentRequest
      const content = await developmentPorts.content(id, nodeId)
      if (disposed || request !== contentRequest) return
      surface.workbench.update("catalog.active", content.node.id)
      if (contentController) {
        await contentController.update({...content, resourceBase: new URL(content.resourceBase, globalThis.location.href).href})
        return
      }
      const presentations = createDevelopmentRoomPresentations({document: presentation.document, catalog,
        package: pkg, sourceClient: developmentSourceClient, navigate: name => developmentNavigation?.navigate(name),
        onDirtyChange: dirty => developmentDirty.set(id, dirty)})
      contentController = createSourcePackageContent({surface,
        content: {...content, resourceBase: new URL(content.resourceBase, globalThis.location.href).href},
        dependencyPresentation: presentations.dependency,
        ...(presentations.source ? {sourcePresentation: presentations.source} : {})})
      await contentController.ready
    }
    const navigate = (event: Event) => {
      const nodeId = (event as CustomEvent<{id: string}>).detail?.id
      if (nodeId && nodeIds.has(nodeId)) void showNode(nodeId).catch(error => {
        if (!disposed) surface.showMessage("Package", title, error instanceof Error ? error.message : "Содержание узла недоступно")
      })
    }
    surface.workbench.element.addEventListener(surface.workbench.events.navigate, navigate)
    void showNode().catch(error => {if (!disposed) surface.showMessage("Package", title, error instanceof Error ? error.message : "Содержание Package недоступно")})
    return {display, dispose() {
      disposed = true
      contentRequest++
      surface.workbench.element.removeEventListener(surface.workbench.events.navigate, navigate)
      contentController?.dispose()
      developmentDirty.delete(id)
      surface.dispose()
    }}
  },
})
function ensureDevelopmentCatalog(retry = false) {
  if (developmentCatalogRequest || developmentCatalog && !retry) return
  const scope = new AbortController()
  developmentCatalogRequest = readDevelopmentCatalog(scope.signal, retry).then(value => {
    developmentCatalog = value
    developmentCatalogError = null
    developmentScene.configure(value)
    if (!workspace.disposed) renderApp()
  }).catch(error => {
    developmentCatalogError = error instanceof Error ? error.message : "Не удалось получить каталог Cosmos"
    if (!workspace.disposed) renderApp()
  }).finally(() => {developmentCatalogRequest = null})
}
let currentBot: Awaited<ReturnType<typeof loadBot>> | undefined
function renderApp() {root.render(
  <App
    network={network}
    workspace={workspace}
    annotations={annotations}
    scene={scene}
    bot={currentBot}
    releaseManagement={releaseManagement}
    development={development}
    developmentScene={developmentScene}
    developmentAgents={developmentAgents}
    developmentError={developmentCatalogError}
    onRefreshDevelopmentCatalog={() => ensureDevelopmentCatalog(true)}
    onSelectDevelopmentPackage={selectDevelopmentPackage}
    onDevelopment={developmentNavigation?.open}
    onQuantum={developmentNavigation?.quantum}
  />,
)}
renderApp()

/** Один History owner и тот же client push channel назначаются release. */
export function connectDevelopmentNavigation(input: NonNullable<typeof developmentNavigation>): () => void {
  developmentNavigation = input
  renderApp()
  return () => {if (developmentNavigation === input) developmentNavigation = undefined}
}
export function presentDevelopment(packageName: string | null) {
  if (!developmentNavigation) throw new Error("Development navigation is not assigned")
  const switched = !development?.active
  const samePackage = development?.packageName === packageName
  if (switched) {quantumCamera = captureCamera(); workspace.parkViews(); scene.setActive(false)}
  development = {active: true, packageName}
  renderApp()
  ensureBot()
  developmentScene.setActive(true)
  developmentAgents.setActive(true)
  developmentAgents.setRoom(packageName)
  developmentScene.applyRoute(packageName)
  if (switched && samePackage && developmentCamera) restoreCamera(developmentCamera)
  ensureDevelopmentCatalog()
}
/** Release назначает Settings capability тому же App; cleanup не создаёт transport или второй Document. */
export function connectReleaseManagement(client: ReleaseSettingsClient): () => void {
  releaseManagement = client
  if (!workspace.disposed) renderApp()
  return () => {
    if (releaseManagement !== client) return
    releaseManagement = undefined
    if (!workspace.disposed) renderApp()
  }
}

/**
Принимает полный read-only снимок от владельца наблюдения и обновляет то же
приложение. Сохранившиеся пространственные сущности сохраняют identity; unmount root
завершает модель. После unmount вызов отклоняется. Transport Visual не создаёт.
*/
export function presentInfrastructure(projection: InfrastructureProjection): void {
  network.present(projection)
}

/** Явно возвращает пространственный обзор всей наблюдаемой сети. */
export function fitInfrastructure(): void { scene.navigateNetworks() }

/** Window router назначает адрес; движение камеры этот адрес не меняет. */
let addressedRoute: AtomSceneRoute | undefined
export function presentAtomRoute(route: AtomSceneRoute): void {
  const wasDeveloping = development?.active === true
  if (wasDeveloping) developmentCamera = captureCamera()
  if (wasDeveloping) development = {...development!, active: false}
  if (wasDeveloping) {
    developmentScene.setActive(false)
    developmentAgents.setActive(false)
  }
  const routeChanged = JSON.stringify(addressedRoute) !== JSON.stringify(route)
  if (routeChanged) workspace.parkViews()
  addressedRoute = route
  if (route.kind === "atom") {
    ensureBot()
    const scoped = agentsForAtom(workspace, route.ref)
    if (!scoped.some(agent => agent.key === workspace.getSnapshot().selected)) {
      if (scoped.length) workspace.select(scoped[0]!.key)
      else workspace.clearSelection()
    }
  } else workspace.clearSelection()
  scene.applyRoute(route)
  scene.setActive(true)
  if (wasDeveloping) {
    renderApp()
    if (quantumCamera && !routeChanged) restoreCamera(quantumCamera)
  }
}

/** Callback передаёт выбор узла единственному History owner, не создавая второй router. */
export function connectAtomNavigation(navigation: Parameters<AtomSceneModel["setNavigation"]>[0]): () => void {
  scene.setNavigation(navigation)
  return () => {if (!workspace.disposed) scene.setNavigation({atom() {}, networks() {}})}
}

/** Подключает только назначенный read-only source; cleanup отписывает UI, не владея transport source. */
export function connectAgents(source: AgentWorkspaceSource): () => void {
  return workspace.connect(source)
}

/** Подключает отдельный служебный feedback transport выбранного Agent; draft не изменяется. */
export function connectAnnotationFeedback(bridge: Parameters<typeof annotations.connectFeedback>[1]): () => void {
  return annotations.connectFeedback(workspace, bridge)
}

/** Release наблюдает первый кадр через диагностику того же root. */
export const runtime = await awaitVisualReady(root, () => inspectRoot(root).whenReady())
export const clientDiagnostics = createClientDiagnostics(runtime, {
  viewport: () => {
    const rect = runtime.canvas.getBoundingClientRect()
    return {width: rect.width, height: rect.height, devicePixelRatio: globalThis.devicePixelRatio ?? 1}
  },
})
workspace.attach(runtime, network)
scene.attach(runtime, network)
developmentScene.attach(runtime)
developmentAgents.attach(runtime)
annotations.attach(runtime)
const selectedDisplay = () => {
  const ref = scene.getSnapshot().selectedAtom?.ref
  return [...runtime.document.querySelectorAll("[data-spatial-node-id]")].find(node => node.getAttribute("data-spatial-node-id") === ref) as HTMLElement | undefined
}
const stopFocus = runtime.document.subscribeMutations(batch => {
  if (scene.getSnapshot().mode !== "atoms" || !batch.records.some(record => record.target === runtime.viewPoint || record.target === selectedDisplay())) return
  workspace.setDisplayFocused(selectedDisplay()?.getAttribute("data-metafor-display-fitted") === "true")
})
/** Owning Window предоставляет этот же Document и его аннотации через client Oracle. */
const controls = createClientControls(runtime, workspace, {identity: annotations.identity!, annotations, textRoot: () => selectedDisplay() ?? null})
export const clientControls = {
  inspect() {
    const base = controls.inspect()
    return development?.active
      ? inspectDevelopmentRoom(base, developmentScene.getSnapshot(), developmentAgents.getSnapshot(), developmentCatalogError)
      : base
  },
  act(action: ClientViewAction) {
    if (action.type === "package.select") {
      selectDevelopmentPackage(action.packageName)
      return {outcome: "dispatched" as const}
    }
    if (action.type === "atom.select") {
      if (!scene.select(action.atomRef)) throw new Error("Atom is absent from this Verse")
      return {outcome: "dispatched" as const}
    }
    if (action.type === "view.change") {
      if (action.view === "network") scene.navigateNetworks()
      else if (action.view === "offices") scene.fit()
      else {const atom = scene.getSnapshot().selectedAtom; if (atom) scene.select(atom.ref, true)}
      return {outcome: "dispatched" as const}
    }
    return controls.act(action)
  },
  dispose() {stopFocus(); controls.dispose(); clientDiagnostics.dispose()},
}
let loadingBot: Promise<void> | undefined
function ensureBot() {
  loadingBot ??= loadBot(`/@internal/visual/bots.glb?env=main&version=${packageVersion}`).then(bot => {
    currentBot = bot
    if (!workspace.disposed) renderApp()
  }).catch(error => console.error("[@internal/visual:main]", "не удалось загрузить avatar asset офиса", {
    error: error instanceof Error ? error.message : String(error),
  }))
}

console.debug("[@internal/visual:main]", "основное visual-окружение создано", {
  space: runtime.space,
  viewPoint: runtime.viewPoint,
  display: runtime.document.querySelector("display"),
  dock: runtime.document.getElementById("main-display-dock"),
})
