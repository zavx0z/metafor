import {
  definePlaygroundRoutes,
  playgroundRouteUrl,
} from "@ui/playground"

export const NODES_PLAYGROUND_ROUTE = "node-tree/runtime/live" as const
export const NODES_PLAYGROUND_PATH = playgroundRouteUrl(NODES_PLAYGROUND_ROUTE)
export const NODES_PLAYGROUND_READY_MARKER = Object.freeze({
  dataset: "nodesPlayground",
  value: "ready",
})

export const NODES_PLAYGROUND_ROUTE_DECLARATION = definePlaygroundRoutes({
  routes: [NODES_PLAYGROUND_ROUTE] as const,
  fallback: NODES_PLAYGROUND_ROUTE,
})

export type NodesPlaygroundRoute = typeof NODES_PLAYGROUND_ROUTE
