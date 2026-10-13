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

import {createRoot, type DOMComponentConstructor, type HTMLElement} from "@zavx0z/immersive"
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

export type {AgentWorkspaceSource, AgentWorkspaceSnapshot, AgentOfficeSnapshot, AgentConnectableSlot} from "./agent-workspace-types"
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
root.render(
  <App
    network={network}
    workspace={workspace}
    annotations={annotations}
    scene={scene}
  />,
)

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
  if (JSON.stringify(addressedRoute) !== JSON.stringify(route)) workspace.parkViews()
  addressedRoute = route
  if (route.kind === "atom") {
    const scoped = agentsForAtom(workspace, route.ref)
    if (!scoped.some(agent => agent.key === workspace.getSnapshot().selected)) {
      if (scoped.length) workspace.select(scoped[0]!.key)
      else workspace.clearSelection()
    }
  } else workspace.clearSelection()
  scene.applyRoute(route)
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
  inspect: controls.inspect,
  act(action: ClientViewAction) {
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
void loadBot(`/@internal/visual/bots.glb?env=main&version=${packageVersion}`).then(bot => {
  if (!workspace.disposed) root.render(<App network={network} workspace={workspace} annotations={annotations} scene={scene} bot={bot} />)
}).catch(error => console.error("[@internal/visual:main]", "не удалось загрузить avatar asset офиса", {
  error: error instanceof Error ? error.message : String(error),
}))

console.debug("[@internal/visual:main]", "основное visual-окружение создано", {
  space: runtime.space,
  viewPoint: runtime.viewPoint,
  display: runtime.document.querySelector("display"),
  dock: runtime.document.getElementById("main-display-dock"),
})
