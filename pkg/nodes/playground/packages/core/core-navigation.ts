import {
  definePlaygroundRouteTree,
  playgroundRouteTreeUrl,
  type PlaygroundRouteTree,
} from "@ui/playground/route-tree"

export const CORE_PLAYGROUND_BASE_PATH = "/core" as const
export const CORE_PLAYGROUND_DETAIL_ROUTE = "live-node-tree" as const
export const CORE_PLAYGROUND_ROUTE_TREE: PlaygroundRouteTree<typeof CORE_PLAYGROUND_DETAIL_ROUTE> =
  definePlaygroundRouteTree({leaves: [CORE_PLAYGROUND_DETAIL_ROUTE] as const})
export const CORE_PLAYGROUND_OVERVIEW_PATH = playgroundRouteTreeUrl(
  CORE_PLAYGROUND_ROUTE_TREE,
  "",
  {basePath: CORE_PLAYGROUND_BASE_PATH},
)
export const CORE_PLAYGROUND_DETAIL_PATH = playgroundRouteTreeUrl(
  CORE_PLAYGROUND_ROUTE_TREE,
  CORE_PLAYGROUND_DETAIL_ROUTE,
  {basePath: CORE_PLAYGROUND_BASE_PATH},
)
