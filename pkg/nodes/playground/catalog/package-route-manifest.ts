import {
  playgroundRouteTreeUrl,
  resolvePlaygroundRouteTree,
  type PlaygroundRouteTree,
  type PlaygroundRouteTreeResolution,
} from "@ui/playground/route-tree"
import {
  NODE_EDITOR_PLAYGROUND_ROUTE_TREE,
} from "../packages/editor/editor-navigation.ts"
import {
  CORE_PLAYGROUND_ROUTE_TREE,
} from "../packages/core/core-navigation.ts"
import {
  LAYOUT_PLAYGROUND_ROUTE_TREE,
} from "../packages/layout/layout-navigation.ts"
import {
  LAYOUT_WORKER_PLAYGROUND_ROUTE_TREE,
} from "../packages/layout-worker/layout-worker-navigation.ts"
import {NODE_PLAYGROUND_ROUTE_TREE} from "../packages/ui/ui-navigation.ts"
import {
  nodesPackageCatalogEntry,
  nodesPackageForPath,
  type NodesPackageCatalogEntry,
  type NodesPackagePlaygroundId,
} from "./package-catalog.ts"

const NODES_PACKAGE_ROUTE_TREES: Readonly<Record<NodesPackagePlaygroundId, PlaygroundRouteTree<string>>> =
  Object.freeze({
    core: CORE_PLAYGROUND_ROUTE_TREE,
    editor: NODE_EDITOR_PLAYGROUND_ROUTE_TREE,
    layout: LAYOUT_PLAYGROUND_ROUTE_TREE,
    "layout-worker": LAYOUT_WORKER_PLAYGROUND_ROUTE_TREE,
    ui: NODE_PLAYGROUND_ROUTE_TREE,
  })

export type NodesPackageRouteResolution = Readonly<{
  package: NodesPackageCatalogEntry
  resolution: PlaygroundRouteTreeResolution<string>
}>

export function nodesPackageRouteTree(id: NodesPackagePlaygroundId): PlaygroundRouteTree<string> {
  return NODES_PACKAGE_ROUTE_TREES[id]
}

export function nodesPackageOverviewRoute(id: NodesPackagePlaygroundId): string {
  const entry = nodesPackageCatalogEntry(id)
  return playgroundRouteTreeUrl(nodesPackageRouteTree(id), "", {basePath: entry.routePrefix})
}

export function resolveNodesPackageRoute(pathname: string): NodesPackageRouteResolution | null {
  const entry = nodesPackageForPath(pathname)
  if (entry === null) return null
  return Object.freeze({
    package: entry,
    resolution: resolvePlaygroundRouteTree(
      nodesPackageRouteTree(entry.id),
      {pathname},
      {basePath: entry.routePrefix},
    ),
  })
}
