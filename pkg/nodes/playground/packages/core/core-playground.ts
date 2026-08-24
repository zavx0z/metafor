import {resolvePlaygroundRouteTree} from "@ui/playground/route-tree"
import {
  CORE_PLAYGROUND_BASE_PATH,
  CORE_PLAYGROUND_ROUTE_TREE,
} from "./core-navigation.ts"

document.documentElement.dataset.nodesPlayground = "starting"
document.documentElement.dataset.nodesPlaygroundPage = "core"

const resolution = resolvePlaygroundRouteTree(
  CORE_PLAYGROUND_ROUTE_TREE,
  window.location,
  {basePath: CORE_PLAYGROUND_BASE_PATH},
)
if (resolution.kind === "not-found") throw new Error(`Unknown core playground route: ${window.location.pathname}`)
document.documentElement.dataset.nodesPlaygroundRouteKind = resolution.node.kind
await import("./core-detail.ts")
