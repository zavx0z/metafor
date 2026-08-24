import {
  definePlaygroundRouteTree,
  playgroundRouteTreeUrl,
  type PlaygroundRouteTree,
} from "@ui/playground/route-tree"

export const LAYOUT_PLAYGROUND_BASE_PATH = "/layout" as const
export const LAYOUT_PLAYGROUND_DETAIL_ROUTE = "fixed-adaptive" as const
export const LAYOUT_PLAYGROUND_ROUTE_TREE: PlaygroundRouteTree<typeof LAYOUT_PLAYGROUND_DETAIL_ROUTE> =
  definePlaygroundRouteTree({leaves: [LAYOUT_PLAYGROUND_DETAIL_ROUTE] as const})
export const LAYOUT_PLAYGROUND_OVERVIEW_PATH = playgroundRouteTreeUrl(
  LAYOUT_PLAYGROUND_ROUTE_TREE,
  "",
  {basePath: LAYOUT_PLAYGROUND_BASE_PATH},
)
export const LAYOUT_PLAYGROUND_DETAIL_PATH = playgroundRouteTreeUrl(
  LAYOUT_PLAYGROUND_ROUTE_TREE,
  LAYOUT_PLAYGROUND_DETAIL_ROUTE,
  {basePath: LAYOUT_PLAYGROUND_BASE_PATH},
)
