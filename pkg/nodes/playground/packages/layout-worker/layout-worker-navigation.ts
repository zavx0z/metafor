import {
  definePlaygroundRouteTree,
  playgroundRouteTreeUrl,
  type PlaygroundRouteTree,
} from "@ui/playground/route-tree"

export const LAYOUT_WORKER_PLAYGROUND_BASE_PATH = "/layout-worker" as const
export const LAYOUT_WORKER_PLAYGROUND_DETAIL_ROUTE = "protocol" as const
export const LAYOUT_WORKER_PLAYGROUND_ROUTE_TREE: PlaygroundRouteTree<typeof LAYOUT_WORKER_PLAYGROUND_DETAIL_ROUTE> =
  definePlaygroundRouteTree({leaves: [LAYOUT_WORKER_PLAYGROUND_DETAIL_ROUTE] as const})
export const LAYOUT_WORKER_PLAYGROUND_OVERVIEW_PATH = playgroundRouteTreeUrl(
  LAYOUT_WORKER_PLAYGROUND_ROUTE_TREE,
  "",
  {basePath: LAYOUT_WORKER_PLAYGROUND_BASE_PATH},
)
export const LAYOUT_WORKER_PLAYGROUND_DETAIL_PATH = playgroundRouteTreeUrl(
  LAYOUT_WORKER_PLAYGROUND_ROUTE_TREE,
  LAYOUT_WORKER_PLAYGROUND_DETAIL_ROUTE,
  {basePath: LAYOUT_WORKER_PLAYGROUND_BASE_PATH},
)
