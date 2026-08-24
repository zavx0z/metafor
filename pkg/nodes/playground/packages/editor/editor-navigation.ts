import {
  definePlaygroundRoutes,
  playgroundRouteUrl,
} from "@ui/playground"

export const NODE_EDITOR_PLAYGROUND_BASE_PATH = "/editor" as const
export const NODE_EDITOR_PLAYGROUND_ROUTE = "live-node-tree" as const
export const NODE_EDITOR_PLAYGROUND_PATH = playgroundRouteUrl(NODE_EDITOR_PLAYGROUND_ROUTE, {
  basePath: NODE_EDITOR_PLAYGROUND_BASE_PATH,
})
export const NODE_EDITOR_PLAYGROUND_READY_MARKER = Object.freeze({
  dataset: "nodesPlayground",
  value: "ready",
})

export const NODE_EDITOR_PLAYGROUND_ROUTE_DECLARATION = definePlaygroundRoutes({
  routes: [NODE_EDITOR_PLAYGROUND_ROUTE] as const,
  fallback: NODE_EDITOR_PLAYGROUND_ROUTE,
})

export type NodeEditorPlaygroundRoute = typeof NODE_EDITOR_PLAYGROUND_ROUTE
