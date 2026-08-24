import {
  definePlaygroundRouteTree,
  playgroundRouteTreeUrl,
} from "@ui/playground"

export const NODE_EDITOR_PLAYGROUND_BASE_PATH = "/editor" as const
export const NODE_EDITOR_PLAYGROUND_ROUTE = "live-node-tree" as const
export const NODE_EDITOR_PLAYGROUND_ROUTE_TREE = definePlaygroundRouteTree({
  leaves: [NODE_EDITOR_PLAYGROUND_ROUTE] as const,
})
export const NODE_EDITOR_PLAYGROUND_OVERVIEW_PATH = playgroundRouteTreeUrl(NODE_EDITOR_PLAYGROUND_ROUTE_TREE, "", {
  basePath: NODE_EDITOR_PLAYGROUND_BASE_PATH,
})
export const NODE_EDITOR_PLAYGROUND_PATH = playgroundRouteTreeUrl(NODE_EDITOR_PLAYGROUND_ROUTE_TREE, NODE_EDITOR_PLAYGROUND_ROUTE, {
  basePath: NODE_EDITOR_PLAYGROUND_BASE_PATH,
})
export const NODE_EDITOR_PLAYGROUND_READY_MARKER = Object.freeze({
  dataset: "nodesPlayground",
  value: "ready",
})

export type NodeEditorPlaygroundRoute = typeof NODE_EDITOR_PLAYGROUND_ROUTE
