import type {UiRuntime} from "@ui/elements/runtime"
import {
  PlaygroundBackdropSurface,
  PlaygroundOverviewSurface,
  PlaygroundRouteTreeRouter,
  type PlaygroundRouteTree,
  type PlaygroundRouteTreeNode,
  type PlaygroundStoryIndexItem,
  type PlaygroundStoryRegistry,
} from "@ui/playground"

export type MountedStoryLeafRouter<Route extends string> = Readonly<{
  readonly current: Route
  go(route: Route): void
  subscribe(listener: (route: Route, previous: Route) => void): () => void
}>

export type MountedStoryRoute<Route extends string> =
  | Readonly<{
      kind: "overview"
      node: Extract<PlaygroundRouteTreeNode<Route>, {kind: "overview"}>
      router: PlaygroundRouteTreeRouter<Route>
    }>
  | Readonly<{
      kind: "leaf"
      node: Extract<PlaygroundRouteTreeNode<Route>, {kind: "leaf"}>
      router: MountedStoryLeafRouter<Route>
    }>

export function createMountedStoryRoute<Route extends string>(
  registry: PlaygroundStoryRegistry,
  basePath: string,
): MountedStoryRoute<Route> {
  const routeTree = registry.routeTree as PlaygroundRouteTree<Route>
  const router = new PlaygroundRouteTreeRouter(routeTree, {basePath})
  const node = router.current
  if (node.kind === "overview") return Object.freeze({kind: "overview", node, router})
  return Object.freeze({kind: "leaf", node, router: leafRouter(router)})
}

export function mountStoryOverview<Route extends string>(
  runtime: UiRuntime,
  canvas: HTMLCanvasElement,
  registry: PlaygroundStoryRegistry,
  route: Extract<MountedStoryRoute<Route>, {kind: "overview"}>,
  packageTitle: string,
): void {
  const backdrop = new PlaygroundBackdropSurface()
  const overview = new PlaygroundOverviewSurface<string>({
    title: overviewTitle(registry, route.node, packageTitle),
    description: route.node.path.length === 0
      ? "Выберите следующий уровень каталога сценариев пакета."
      : `Раздел ${route.node.path}`,
    items: registry.routeTree.children(route.node.path).map((child) => overviewItem(registry, child)),
    onNavigate(path) {
      if (!route.router.go(path)) throw new Error(`Unknown mounted story route: ${path}`)
      window.location.reload()
    },
  })
  runtime.addSurface(backdrop, ({w, h}) => ({x: 0, y: 0, w, h}))
  runtime.addSurface(overview, ({w, h}) => ({
    x: 3,
    y: 3,
    w: Math.max(1, w - 6),
    h: Math.max(1, h - 6),
  }))
  new ResizeObserver(() => runtime.handleResize()).observe(canvas)
  runtime.handleResize()
}

function leafRouter<Route extends string>(
  router: PlaygroundRouteTreeRouter<Route>,
): MountedStoryLeafRouter<Route> {
  return Object.freeze({
    get current(): Route {
      const current = router.current
      if (current.kind !== "leaf") throw new Error(`Mounted story route is not a leaf: ${current.path}`)
      return current.path
    },
    go(route: Route): void {
      if (!router.go(route)) throw new Error(`Unknown mounted story route: ${route}`)
    },
    subscribe(listener): () => void {
      return router.subscribe((node, previous) => {
        if (node.kind !== "leaf") {
          window.location.reload()
          return
        }
        const previousRoute = previous.kind === "leaf" ? previous.path : node.path
        listener(node.path, previousRoute)
      })
    },
  })
}

function overviewTitle(
  registry: PlaygroundStoryRegistry,
  node: PlaygroundRouteTreeNode,
  packageTitle: string,
): string {
  if (node.path.length === 0) return packageTitle
  const story = representativeStory(registry, node.path)
  if (node.depth === 1) return story.componentLabel
  if (node.depth === 2) return story.sectionLabel
  return story.variantLabel
}

function overviewItem(
  registry: PlaygroundStoryRegistry,
  node: PlaygroundRouteTreeNode,
) {
  const story = representativeStory(registry, node.path)
  return Object.freeze({
    id: node.path,
    label: node.kind === "leaf"
      ? story.variantLabel
      : node.depth === 1
        ? story.componentLabel
        : story.sectionLabel,
    description: node.kind === "leaf" ? story.title : story.apiName,
    route: node.path,
  })
}

function representativeStory(registry: PlaygroundStoryRegistry, path: string): PlaygroundStoryIndexItem {
  const exact = registry.find(path)
  if (exact !== undefined) return exact
  const prefix = path.length === 0 ? "" : `${path}/`
  const story = registry.index.find(({route}) => route.startsWith(prefix))
  if (story === undefined) throw new Error(`Overview has no story descendants: ${path}`)
  return story
}
