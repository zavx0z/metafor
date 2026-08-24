import {resolvePlaygroundRouteTree} from "@ui/playground/route-tree"
import {
  LAYOUT_PLAYGROUND_BASE_PATH,
  LAYOUT_PLAYGROUND_ROUTE_TREE,
} from "./layout-navigation.ts"

document.documentElement.dataset.nodesPlayground = "starting"
document.documentElement.dataset.nodesPlaygroundPage = "layout"
document.documentElement.dataset.nodesLayoutPlayground = "starting"

const resolution = resolvePlaygroundRouteTree(
  LAYOUT_PLAYGROUND_ROUTE_TREE,
  window.location,
  {basePath: LAYOUT_PLAYGROUND_BASE_PATH},
)
if (resolution.kind === "not-found") throw new Error(`Неизвестный route стенда раскладки: ${window.location.pathname}`)
document.documentElement.dataset.nodesPlaygroundRouteKind = resolution.node.kind
await import("./layout-detail.ts")
