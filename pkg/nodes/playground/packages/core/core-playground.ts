import {resolvePlaygroundRouteTree} from "@ui/playground/route-tree"
import {
  CORE_PLAYGROUND_BASE_PATH,
  CORE_PLAYGROUND_DETAIL_PATH,
  CORE_PLAYGROUND_ROUTE_TREE,
} from "./core-navigation.ts"

document.documentElement.dataset.nodesPlayground = "starting"
document.documentElement.dataset.nodesPlaygroundPage = "core"

const overview = requiredElement("core-overview")
const detail = requiredElement("core-detail")
const resolution = resolvePlaygroundRouteTree(
  CORE_PLAYGROUND_ROUTE_TREE,
  window.location,
  {basePath: CORE_PLAYGROUND_BASE_PATH},
)
if (resolution.kind === "not-found") throw new Error(`Unknown core playground route: ${window.location.pathname}`)
document.documentElement.dataset.nodesPlaygroundRouteKind = resolution.node.kind
if (resolution.node.kind === "overview") {
  overview.hidden = false
  requiredLink("core-detail-link").href = CORE_PLAYGROUND_DETAIL_PATH
  document.documentElement.dataset.nodesPlayground = "ready"
} else {
  detail.hidden = false
  await import("./core-detail.ts")
}

function requiredElement(id: string): HTMLElement {
  const element = document.getElementById(id)
  if (!(element instanceof HTMLElement)) throw new Error(`Core playground element is missing: ${id}`)
  return element
}

function requiredLink(id: string): HTMLAnchorElement {
  const element = document.getElementById(id)
  if (!(element instanceof HTMLAnchorElement)) throw new Error(`Core playground link is missing: ${id}`)
  return element
}
