import {DisplayElement, type DOMSlotContent, type Presentation} from "@zavx0z/immersive"
import {ViewPoint} from "@zavx0z/immersive/engine"
import {createSpatialTreeState, type SpatialTreeSnapshot} from "@zavx0z/immersive/nodes/spatial/tree"
import {createSubjectGraph} from "@zavx0z/storybook-app-web-page-shell/workspace"
import type {DevelopmentCatalog, DevelopmentPackage} from "../../../release/shared/development"

/** Глубина Source комнаты согласована с её офисом и публичным SpatialTree. */
export const DEVELOPMENT_ROOM_BODY_DEPTH = 180
const MAX_VIEWS = 32
type GeometryNode = SpatialTreeSnapshot["nodes"][number]
type View = {display: DisplayElement; dispose(): void; ready?: Promise<void>; content?: Promise<void>; reload?(): Promise<void>}
type Viewport = Readonly<{width: number; height: number}>

export type DevelopmentRoomView = "overview" | "display" | "room"
export type DevelopmentRoomSnapshot = Readonly<{
  catalog: DevelopmentCatalog | null
  selectedPackage: DevelopmentPackage | null
  view: DevelopmentRoomView
  canGoBack: boolean
  loading: boolean
  error: string | null
  geometryNodes: readonly GeometryNode[]
}>

/**
 * Source Package hierarchy проецируется через public Storybook workspace в
 * существующий Immersive Root. Только выбранный Package получает содержимое;
 * геометрия остальных комнат остаётся лёгкой. URL принадлежит внешнему router.
 */
export function createDevelopmentRoomScene(options: Readonly<{
  navigate(packageName: string): void
  visit(packageName: string): void
  canRelease?(packageName: string): boolean
  createView(root: Presentation, id: string, title: string, mount: (content: DOMSlotContent | null) => void,
    display: DisplayElement, onRelease: () => void): View
}>) {
  const source = createSpatialTreeState()
  const visible = createSpatialTreeState()
  const listeners = new Set<() => void>()
  const views = new Map<string, View>()
  const pending = new Set<string>()
  let catalog: DevelopmentCatalog | null = null
  let selectedName: string | null = null
  let root: Presentation | null = null
  let graph: ReturnType<typeof createSubjectGraph<View>> | null = null
  let view: DevelopmentRoomView = "overview"
  let active = false
  let disposed = false
  let openingDisplay = false
  let unresolvedRoute = false
  let pendingInitialFocus = false
  let configuredKey = ""
  let sceneError: string | null = null
  let viewportSize: Viewport | null = null
  let resizeQueued = false
  let stopCamera = () => {}, stopPresented = () => {}
  let snapshot: DevelopmentRoomSnapshot = {catalog, selectedPackage: null, view, canGoBack: false, loading: false,
    error: null, geometryNodes: []}
  const assertActive = () => {if (disposed) throw new Error("Development room scene is disposed")}
  const selectedPackage = () => catalog?.packages.find(pkg => pkg.name === selectedName) ?? null
  const viewport = (): Viewport | null => {
    const rect = root?.canvas.getBoundingClientRect()
    return rect && rect.width > 0 && rect.height > 0 && Number.isFinite(rect.width) && Number.isFinite(rect.height)
      ? {width: Math.round(rect.width), height: Math.round(rect.height)} : null
  }
  const derive = () => {
    const value = source.getSnapshot()
    snapshot = {catalog, selectedPackage: selectedPackage(), view, canGoBack: view !== "overview" && selectedPackage() !== null,
      loading: selectedName !== null && pending.has(selectedName),
      error: sceneError,
      geometryNodes: value?.geometryNodes ?? value?.nodes ?? []}
    for (const listener of listeners) listener()
  }
  const updateVisibility = () => {
    for (const [name, item] of views) item.display.hidden = !active || view !== "display" || name !== selectedName
  }
  const trackContent = (id: string, item: View, result: Promise<void>) => {
    pending.add(id)
    derive()
    void result.then(() => {
      if (views.get(id) !== item) return
      pending.delete(id)
      if (selectedName === id) sceneError = null
      derive()
    }, error => {
      if (views.get(id) !== item) return
      pending.delete(id)
      if (selectedName === id) sceneError = error instanceof Error ? error.message : "Содержание Package недоступно"
      derive()
    })
  }
  const enter = () => {
    if (!root || !graph || !selectedName || !selectedPackage() || view !== "display" || !active) return false
    const node = snapshot.geometryNodes.find(node => node.id === selectedName)
    const size = viewport()
    if (!node || !size) return false
    graph.select(selectedName, false)
    openingDisplay = false
    pendingInitialFocus = false
    view = "room"
    const r = node.rect, eye = root.viewPoint
    const bounds = {min: {x: r.x, y: r.y, z: r.z - DEVELOPMENT_ROOM_BODY_DEPTH}, max: {x: r.x + r.width, y: r.y + r.height, z: r.z}}
    const pose = ViewPoint.fitPoseForBounds(bounds, {x: 0, y: -1, z: 0}, {fov: eye.fov, aspect: size.width / size.height})
    const range = ViewPoint.depthRangeForBounds(bounds, pose)
    root.document.transaction(() => {
      eye.x = pose.position.x
      eye.y = pose.position.y
      eye.z = pose.position.z
      eye.targetX = pose.target.x
      eye.targetY = pose.target.y
      eye.targetZ = pose.target.z
      eye.near = Math.max(1, range?.near ?? 1)
      eye.far = Math.max(100000, range?.far ?? 100000)
      eye.controls = true
      eye.navigation = "fly"
      eye.flySpeed = DEVELOPMENT_ROOM_BODY_DEPTH / 40
      updateVisibility()
    })
    derive()
    if (selectedPackage()?.resolution === "source") options.visit(selectedName)
    root.invalidate()
    return true
  }
  const observeRoom = () => {
    if (!root || !active || view !== "display" || !selectedName) return
    const node = snapshot.geometryNodes.find(node => node.id === selectedName)
    if (!node) return
    const r = node.rect, eye = root.viewPoint
    if (openingDisplay) {
      if (eye.z >= r.z) openingDisplay = false
      else return
    }
    if (eye.z < r.z && eye.x >= r.x && eye.x <= r.x + r.width && eye.y >= r.y && eye.y <= r.y + r.height) enter()
  }
  const refresh = (focus: boolean, retryContent = false) => {
    if (!graph || !catalog) {derive(); return}
    const sourcePackages = catalog.packages.filter(pkg => pkg.resolution === "source")
    const packageNames = new Set(sourcePackages.map(pkg => pkg.name))
    const items = sourcePackages.map(pkg => ({id: pkg.name, label: pkg.label,
      ...(pkg.ownerName && packageNames.has(pkg.ownerName) ? {parentId: pkg.ownerName} : {})}))
    const key = JSON.stringify(items)
    const size = viewport()
    if (!size) {derive(); return}
    const resized = !viewportSize || size.width !== viewportSize.width || size.height !== viewportSize.height
    if (key !== configuredKey) {
      configuredKey = key
      graph.configure(items, id => options.navigate(id))
    }
    if (resized) {viewportSize = size; graph.updateViewport(size)}
    const pkg = selectedPackage()
    if (pkg?.resolution === "source") {
      if (!views.has(pkg.name) && views.size >= MAX_VIEWS) {
        const evict = [...views.keys()].find(id => id !== pkg.name && options.canRelease?.(id) !== false)
        if (!evict) {
          sceneError = "Сохраните открытые черновики перед переходом к другому Package"
          derive()
          return
        }
        graph.releaseView(evict)
      }
      try {
        const residentBefore = views.has(pkg.name)
        const current = graph.createView({id: pkg.name, title: pkg.label})
        if (!residentBefore) sceneError = null
        if (retryContent && !pending.has(pkg.name) && current.reload) {
          sceneError = null
          trackContent(pkg.name, current, current.reload())
        }
      } catch (error) {
        sceneError = error instanceof Error ? error.message : "Не удалось открыть Package"
        derive()
        return
      }
      const resident = views.get(pkg.name)
      if (resident) {views.delete(pkg.name); views.set(pkg.name, resident)}
      if (active) {
        graph.select(pkg.name, focus || pendingInitialFocus)
        pendingInitialFocus = false
      }
    } else {
      sceneError = null
      if (focus && active) graph.fit()
    }
    updateVisibility()
    derive()
  }
  const stopSource = source.subscribe(() => {visible.publish(source.getSnapshot()); updateVisibility(); derive()})
  return {
    spatial: visible,
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {listeners.add(listener); return () => {listeners.delete(listener)}},
    attach(value: Presentation) {
      assertActive()
      if (root === value) return
      if (root) throw new Error("Development room scene already belongs to another Presentation")
      root = value
      graph = createSubjectGraph<View>({
        root: value,
        source,
        preserveViewPoint: true,
        layout: {bodyDepth: DEVELOPMENT_ROOM_BODY_DEPTH},
        getViewport: viewport,
        createView(id, title, mount, display, onRelease) {
          const release = () => {views.delete(id); pending.delete(id); onRelease()}
          const result = options.createView(value, id, title, mount, display, release)
          views.set(id, result)
          if (result.ready) {
            pending.add(id)
            void result.ready.then(() => {
              if (views.get(id) !== result) return
              if (result.content) trackContent(id, result, result.content)
              else {pending.delete(id); derive()}
            }, error => {
              const current = views.get(id) === result
              if (current) {
                pending.delete(id)
                graph?.releaseView(id)
              }
              if (!current && (error as {name?: string})?.name === "AbortError") return
              if (selectedName === id) sceneError = error instanceof Error ? error.message : "Не удалось открыть Package"
              derive()
            })
          } else if (result.content) trackContent(id, result, result.content)
          return result
        },
      })
      stopCamera = value.document.subscribeMutations(batch => {
        if (batch.records.some(record => record.target === value.viewPoint)) observeRoom()
      })
      stopPresented = value.subscribePresented(() => {
        const size = viewport()
        if (size && (!viewportSize || size.width !== viewportSize.width || size.height !== viewportSize.height)) {
          if (!resizeQueued) {
            resizeQueued = true
            queueMicrotask(() => {
              resizeQueued = false
              if (!disposed && graph && active) refresh(false)
            })
          }
        }
        observeRoom()
        updateVisibility()
      })
      refresh(true)
    },
    configure(next: DevelopmentCatalog) {
      assertActive()
      const initial = catalog === null
      catalog = next
      if (unresolvedRoute) {
        const sourcePackage = selectedPackage()?.resolution === "source"
        view = sourcePackage ? "display" : "overview"
        openingDisplay = sourcePackage
        pendingInitialFocus = sourcePackage
        unresolvedRoute = false
      }
      refresh(initial && active && selectedName === null)
    },
    applyRoute(packageName: string | null) {
      assertActive()
      const changed = selectedName !== packageName
      selectedName = packageName
      const sourcePackage = catalog?.packages.find(pkg => pkg.name === packageName)?.resolution === "source"
      if (changed) {
        unresolvedRoute = catalog === null && packageName !== null
        view = sourcePackage ? "display" : "overview"
        openingDisplay = sourcePackage
        pendingInitialFocus = sourcePackage
        sceneError = null
      }
      refresh(changed, !changed)
    },
    setActive(next: boolean) {
      assertActive()
      if (active === next) return
      active = next
      updateVisibility()
      derive()
      if (next) refresh(false)
    },
    enterRoom: enter,
    showDisplay() {
      assertActive()
      if (!graph || !selectedName || selectedPackage()?.resolution !== "source") return false
      view = "display"
      openingDisplay = true
      pendingInitialFocus = false
      graph.select(selectedName, true)
      updateVisibility()
      derive()
      return true
    },
    fit() {
      assertActive()
      view = "overview"
      unresolvedRoute = false
      pendingInitialFocus = false
      updateVisibility()
      derive()
      graph?.fit()
    },
    zoom(factor: number) {assertActive(); graph?.zoom(factor)},
    back() {
      assertActive()
      if (!graph || !selectedName || view === "overview") return false
      if (view === "room") {
        view = "display"
        openingDisplay = true
        graph.select(selectedName, true)
      } else {
        view = "overview"
        graph.fit()
      }
      updateVisibility()
      derive()
      return true
    },
    dispose() {
      if (disposed) return
      disposed = true
      stopCamera()
      stopPresented()
      stopSource()
      graph?.dispose()
      graph = null
      source.publish(null)
      visible.publish(null)
      views.clear()
      listeners.clear()
      root = null
    },
  }
}

export type DevelopmentRoomSceneModel = ReturnType<typeof createDevelopmentRoomScene>
