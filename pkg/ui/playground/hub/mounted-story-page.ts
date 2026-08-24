import {
  PlaygroundRouteTreeRouter,
  type PlaygroundRouteTree,
  type PlaygroundRouteTreeNode,
  type PlaygroundStoryRegistry,
} from "@ui/playground"

export type MountedStoryRouter<Route extends string> = Readonly<{
  /** Deterministic detail descendant rendered by the unchanged Workbench. */
  readonly current: Route
  /** Exact overview or leaf path kept in browser history. */
  readonly path: string
  readonly node: PlaygroundRouteTreeNode<Route>
  go(path: string): boolean
  subscribe(listener: (route: Route, previous: Route) => void): () => void
}>

/**
 * Keeps pathname hierarchy and detail rendering separate: an overview remains
 * in the URL while the historical Workbench renders one deterministic leaf.
 */
export function createMountedStoryRouter<Route extends string>(
  registry: PlaygroundStoryRegistry,
  basePath: string,
): MountedStoryRouter<Route> {
  const routeTree = registry.routeTree as PlaygroundRouteTree<Route>
  const router = new PlaygroundRouteTreeRouter(routeTree, {basePath})
  const detailRoute = (node: PlaygroundRouteTreeNode<Route>): Route =>
    representativeDetailRoute(registry, routeTree, node)

  return Object.freeze({
    get current(): Route {
      return detailRoute(router.current)
    },
    get path(): string {
      return router.current.path
    },
    get node(): PlaygroundRouteTreeNode<Route> {
      return router.current
    },
    go(path: string): boolean {
      return router.go(path)
    },
    subscribe(listener): () => void {
      return router.subscribe((node, previous) => {
        listener(detailRoute(node), detailRoute(previous))
      })
    },
  })
}

export function mountedStoryComponentPath(path: string): string {
  if (path.length === 0) return ""
  return path.split("/", 1)[0] ?? ""
}

export function mountedStorySectionPath(path: string): string {
  if (path.length === 0) return ""
  return path.split("/").slice(0, 2).join("/")
}

export function mountedStoryRepresentativeRoute<Route extends string>(
  registry: PlaygroundStoryRegistry,
  path: string,
): Route {
  const tree = registry.routeTree as PlaygroundRouteTree<Route>
  const node = tree.find(path)
  if (node === undefined) throw new Error(`Unknown mounted playground route: ${path}`)
  return representativeDetailRoute(registry, tree, node)
}

function representativeDetailRoute<Route extends string>(
  registry: PlaygroundStoryRegistry,
  tree: PlaygroundRouteTree<Route>,
  node: PlaygroundRouteTreeNode<Route>,
): Route {
  if (node.kind === "leaf") return node.path
  const prefix = node.path.length === 0 ? "" : `${node.path}/`
  if (registry.fallback.startsWith(prefix) && tree.find(registry.fallback)?.kind === "leaf") {
    return registry.fallback as Route
  }
  const descendant = tree.leaves.find((route) => route.startsWith(prefix))
  if (descendant === undefined) throw new Error(`Playground overview has no detail descendant: ${node.path}`)
  return descendant
}
