import {DisplayElement, type DOMSlotContent, type Presentation} from "@zavx0z/immersive"
import {createSpatialTreeController, createSpatialTreeState, type SpatialTreeController, type SpatialTreeSnapshot} from "@zavx0z/immersive/nodes/spatial/tree"
import type {AtomRef, RuntimeAtom} from "@metafor/types/metafor/graph"
import type {AgentWorkspaceModel} from "./agent-workspace"
import type {AgentOfficeSnapshot, AgentWorkspaceSnapshot} from "./agent-workspace-types"
import type {NetworkSpaceModel} from "./network-space"
import {projectRuntimeAtoms, type RuntimeAtomProjection} from "./atom-projection"
import {bindAtomDisplayGlass} from "./atom-display-glass"

const BODY_DEPTH = 180
type Viewport = Readonly<{width: number; height: number}>
type GeometryNode = SpatialTreeSnapshot["nodes"][number]
type Network = Pick<NetworkSpaceModel, "attach" | "suspend" | "fit" | "zoom" | "updateViewport">

/** Подтверждённый адрес от release router; визуальный выбор сам не меняет URL. */
export type AtomSceneRoute = {kind: "atom"; ref: AtomRef} | {kind: "networks"} | {kind: "unavailable"; message: string}
/** Snapshot содержит только наблюдаемое содержимое и фактическую геометрию SpatialTree. */
export interface AtomSceneSnapshot {
  readonly mode: "atoms" | "networks" | "unavailable"
  readonly message: string | null
  readonly selectedAtom: RuntimeAtom | null
  readonly source: AgentWorkspaceSnapshot
  readonly geometryNodes: readonly GeometryNode[]
  readonly offices: readonly {office: AgentOfficeSnapshot; position: {x: number; y: number; z: number}}[]
}

/**
 * Адаптер предметного Graph к одному public SpatialTree в существующем Root.
 * Configure зависит только от identity, parent и label; value/State refresh
 * обновляет содержимое без перестройки геометрии и сброса камеры. Размер каждого
 * Display равен фактическому CSS viewport Root; resize перестраивает геометрию
 * через public configure/updateViewport. Вписанный Display следует новому fit,
 * свободная камера сохраняет свою позу. Офисы занимают
 * фактическое тело owning Atom: локальный Z 0..180, мировое начало rect.z-180.
 * Content монтируется только для адресованного Atom; геометрия остальных
 * комнат остаётся в SpatialTree без их интерфейсов и подписок представления.
 * Selection запрашивает navigation, applyRoute подтверждает адрес. Сети получают
 * камеру только по явному маршруту; adapter не создаёт Document/canvas/frame loop.
 * @see ../README.md; atom-scene.spec.ts.
 */
export function createAtomScene(options: Readonly<{
  workspace: Pick<AgentWorkspaceModel, "getSnapshot" | "subscribe">
  contentFor(atom: RuntimeAtom): DOMSlotContent
}>) {
  const spatial = createSpatialTreeState(), visible = createSpatialTreeState(), listeners = new Set<() => void>()
  let source = options.workspace.getSnapshot().input
  let route: AtomSceneRoute = {kind: "unavailable", message: "Адрес Atom ещё не получен"}
  let projection: RuntimeAtomProjection | null = null
  let root: Presentation | null = null, network: Network | null = null
  let controller: SpatialTreeController | null = null, glass: ReturnType<typeof bindAtomDisplayGlass> | null = null
  let stopPresented = () => {}, configuredKey = "", selected: AtomRef | null = null, disposed = false
  let geometryViewport: Viewport | null = null, resizeQueued = false
  let deferredFocus = false
  let navigation: {atom(ref: AtomRef, focus?: boolean): void; networks(): void} | null = null
  let pendingFocus: {ref: AtomRef; focus: boolean} | null = null
  const residents = new Set<AtomRef>()
  let snapshot: AtomSceneSnapshot = {mode: "unavailable", message: route.message, selectedAtom: null, source, geometryNodes: [], offices: []}
  const assertActive = () => {if (disposed) throw new Error("Atom scene is disposed")}
  const viewport = () => {
    const rect = root?.canvas.getBoundingClientRect()
    return rect && Number.isFinite(rect.width) && Number.isFinite(rect.height) && rect.width > 0 && rect.height > 0
      ? {width: Math.max(1, Math.round(rect.width)), height: Math.max(1, Math.round(rect.height))}
      : null
  }
  const derive = () => {
    const selectedAtom = route.kind === "atom" ? projection?.lookupRuntimeAtom(route.ref) ?? null : null
    const available = source.status === "ready" && source.graph !== null
    const mode = route.kind === "networks" ? "networks" : route.kind === "atom" && available && selectedAtom ? "atoms" : "unavailable"
    const geometryNodes = mode === "atoms" ? spatial.getSnapshot()?.geometryNodes ?? spatial.getSnapshot()?.nodes ?? [] : []
    const byRef = new Map(geometryNodes.map(node => [node.id, node]))
    const offices: AtomSceneSnapshot["offices"][number][] = []
    for (const office of source.offices) {
      const node = byRef.get(office.owner)
      if (!node || !projection?.lookupRuntimeAtom(office.owner)) continue
      const r = node.rect
      offices.push({office: {...office, bounds: {min: {x: -r.width / 2, y: -r.height / 2, z: 0}, max: {x: r.width / 2, y: r.height / 2, z: BODY_DEPTH}}},
        position: {x: r.x + r.width / 2, y: r.y + r.height / 2, z: r.z - BODY_DEPTH}})
    }
    snapshot = {mode, message: mode === "unavailable" ? route.kind === "unavailable" ? route.message : source.error ?? "Выбранный Atom недоступен" : null,
      selectedAtom: mode === "atoms" ? selectedAtom : null, source, geometryNodes, offices}
    for (const listener of listeners) listener()
  }
  const displayFor = (id: string): DisplayElement | null => {
    for (const element of root?.document.querySelectorAll("[data-spatial-node-id]") ?? [])
      if (element instanceof DisplayElement && element.getAttribute("data-spatial-node-id") === id) return element
    return null
  }
  const releaseAtoms = () => {
    glass?.dispose(); glass = null
    controller?.dispose(); controller = null
    configuredKey = ""; selected = null; geometryViewport = null; deferredFocus = false; residents.clear()
  }
  const content = (ref: AtomRef) => {
    if (route.kind !== "atom" || route.ref !== ref) return
    const atom = projection?.lookupRuntimeAtom(ref)
    if (!controller || !atom) return
    residents.add(ref)
    controller.setContent(ref, options.contentFor(atom))
  }
  const requestSelect = (id: string, focus = true) => {
    assertActive()
    if (!projection?.lookupRuntimeAtom(id) || !navigation) return false
    const ref = id as AtomRef
    pendingFocus = {ref, focus}
    navigation.atom(ref, focus)
    return true
  }
  function refresh(focus = false) {
    source = options.workspace.getSnapshot().input
    projection = source.graph ? projectRuntimeAtoms(source.graph) : null
    derive()
    if (!root || snapshot.mode !== "atoms") {
      releaseAtoms()
      derive()
      return
    }
    network?.suspend()
    const size = viewport()
    if (!size) {deferredFocus ||= focus; return}
    focus ||= deferredFocus
    deferredFocus = false
    const resized = geometryViewport !== null && (size.width !== geometryViewport.width || size.height !== geometryViewport.height)
    const wasFitted = selected !== null && displayFor(selected)?.getAttribute("data-metafor-display-fitted") === "true"
    if (!controller) {
      controller = createSpatialTreeController({root, state: spatial, preserveViewPoint: true, showGrid: false,
        layout: {bodyDepth: BODY_DEPTH, layerGap: 600}, getViewport: viewport})
      glass = bindAtomDisplayGlass({root, source: spatial, displayFor})
    }
    // Без node.viewport публичный SpatialTree использует фактический размер Root.
    const nodes = projection!.nodes
    const key = JSON.stringify(nodes.map(node => [node.id, node.parentId ?? null, node.label]))
    if (key !== configuredKey || resized) {
      configuredKey = key
      geometryViewport = size
      controller.updateViewport(size)
      glass?.updateViewport(size)
      for (const ref of residents) if (!projection!.lookupRuntimeAtom(ref)) residents.delete(ref)
      controller.configure(nodes, requestSelect, id => content(id as AtomRef))
    }
    for (const ref of residents) if (route.kind !== "atom" || ref !== route.ref) {
      controller.release(ref)
      residents.delete(ref)
    }
    if (route.kind === "atom") {
      content(route.ref)
      controller.ensureDisplay(route.ref)
      const fit = focus || resized && wasFitted
      if (selected !== route.ref || fit) controller.select(route.ref, fit)
      selected = route.ref
    }
    glass?.updateViewport(size)
    glass?.update()
    derive()
  }
  const stopSpatial = spatial.subscribe(() => {
    const value = spatial.getSnapshot()
    const ref = route.kind === "atom" ? route.ref : null
    visible.publish(value ? {...value,
      nodes: value.nodes.filter(node => node.id === ref),
      disabledHitIds: new Set(value.selectedId === ref && value.selectedVolumeId ? [value.selectedVolumeId] : []),
    } : null)
    derive()
  })
  const stopSource = options.workspace.subscribe(() => {
    // Camera focus/selection меняют view workspace, но не наблюдаемый source.
    // Повторный setContent из presented callback повторно вошёл бы в Root.render.
    if (!disposed && options.workspace.getSnapshot().input !== source) refresh()
  })
  return {
    spatial: visible,
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {listeners.add(listener); return () => {listeners.delete(listener)}},
    attach(value: Presentation, networkModel: Network) {
      assertActive()
      if (root === value) return
      if (root) throw new Error("Atom scene already belongs to another Presentation")
      root = value; network = networkModel
      stopPresented = root.subscribePresented(() => {
        if (disposed || snapshot.mode !== "atoms") return
        const size = viewport()
        if (size && (!geometryViewport || size.width !== geometryViewport.width || size.height !== geometryViewport.height)) {
          if (resizeQueued) return
          resizeQueued = true
          // configure вызывает Root.render; выполняем после завершения presented frame.
          queueMicrotask(() => {
            resizeQueued = false
            if (!disposed && snapshot.mode === "atoms") refresh()
          })
          return
        }
        glass?.update()
      })
      if (route.kind === "networks") {network.attach(root); network.fit()} else refresh(true)
    },
    applyRoute(next: AtomSceneRoute) {
      assertActive()
      const changed = next.kind !== route.kind || next.kind === "atom" && (route.kind !== "atom" || next.ref !== route.ref)
      route = next
      const focus = next.kind === "atom" && pendingFocus?.ref === next.ref ? pendingFocus.focus : changed
      pendingFocus = null
      if (next.kind === "networks") {
        releaseAtoms()
        if (root) {network?.attach(root); if (changed) network?.fit()}
        derive()
      } else {if (root && next.kind === "unavailable") network?.suspend(); refresh(focus)}
    },
    setNavigation(value: NonNullable<typeof navigation>) {assertActive(); navigation = value},
    select: requestSelect,
    navigateNetworks() {assertActive(); navigation?.networks()},
    fit() {assertActive(); if (snapshot.mode === "atoms") controller?.fit(); else if (snapshot.mode === "networks") network?.fit()},
    zoom(factor: number) {assertActive(); if (snapshot.mode === "atoms") controller?.zoom(factor); else if (snapshot.mode === "networks") network?.zoom(factor)},
    dispose() {
      if (disposed) return
      disposed = true; stopSource(); stopSpatial(); stopPresented(); releaseAtoms(); network?.suspend(); spatial.publish(null); visible.publish(null); listeners.clear(); root = null; network = null
    },
  }
}

/** Retained consumer модели Atom scene для Visual composition root. */
export type AtomSceneModel = ReturnType<typeof createAtomScene>
