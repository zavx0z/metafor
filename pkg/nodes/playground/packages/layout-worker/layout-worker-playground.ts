import {resolvePlaygroundRouteTree} from "@ui/playground/route-tree"
import {
  LAYOUT_WORKER_PLAYGROUND_BASE_PATH,
  LAYOUT_WORKER_PLAYGROUND_DETAIL_PATH,
  LAYOUT_WORKER_PLAYGROUND_ROUTE_TREE,
} from "./layout-worker-navigation.ts"

document.documentElement.dataset.nodesPlayground = "starting"
document.documentElement.dataset.nodesPlaygroundPage = "layout-worker"

const overview = requiredElement("layout-worker-overview")
const detail = requiredElement("layout-worker-detail")
const resolution = resolvePlaygroundRouteTree(
  LAYOUT_WORKER_PLAYGROUND_ROUTE_TREE,
  window.location,
  {basePath: LAYOUT_WORKER_PLAYGROUND_BASE_PATH},
)
if (resolution.kind === "not-found") {
  throw new Error(`Unknown layout-worker playground route: ${window.location.pathname}`)
}
document.documentElement.dataset.nodesPlaygroundRouteKind = resolution.node.kind
if (resolution.node.kind === "overview") {
  overview.hidden = false
  requiredLink("layout-worker-detail-link").href = LAYOUT_WORKER_PLAYGROUND_DETAIL_PATH
  document.documentElement.dataset.nodesPlayground = "ready"
} else {
  detail.hidden = false
  await import("./layout-worker-detail.ts")
}

function requiredElement(id: string): HTMLElement {
  const element = document.getElementById(id)
  if (!(element instanceof HTMLElement)) throw new Error(`Layout Worker playground element is missing: ${id}`)
  return element
}

function requiredLink(id: string): HTMLAnchorElement {
  const element = document.getElementById(id)
  if (!(element instanceof HTMLAnchorElement)) throw new Error(`Layout Worker playground link is missing: ${id}`)
  return element
}
