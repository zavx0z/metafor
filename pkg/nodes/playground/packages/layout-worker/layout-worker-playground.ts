import {resolvePlaygroundRouteTree} from "@ui/playground/route-tree"
import {
  LAYOUT_WORKER_PLAYGROUND_BASE_PATH,
  LAYOUT_WORKER_PLAYGROUND_ROUTE_TREE,
} from "./layout-worker-navigation.ts"

document.documentElement.dataset.nodesPlayground = "starting"
document.documentElement.dataset.nodesPlaygroundPage = "layout-worker"

const resolution = resolvePlaygroundRouteTree(
  LAYOUT_WORKER_PLAYGROUND_ROUTE_TREE,
  window.location,
  {basePath: LAYOUT_WORKER_PLAYGROUND_BASE_PATH},
)
if (resolution.kind === "not-found") {
  throw new Error(`Unknown layout-worker playground route: ${window.location.pathname}`)
}
document.documentElement.dataset.nodesPlaygroundRouteKind = resolution.node.kind
await import("./layout-worker-detail.ts")
