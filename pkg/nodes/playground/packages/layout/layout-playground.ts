import {resolvePlaygroundRouteTree} from "@ui/playground/route-tree"
import {
  LAYOUT_PLAYGROUND_BASE_PATH,
  LAYOUT_PLAYGROUND_DETAIL_PATH,
  LAYOUT_PLAYGROUND_ROUTE_TREE,
} from "./layout-navigation.ts"

document.documentElement.dataset.nodesPlayground = "starting"
document.documentElement.dataset.nodesPlaygroundPage = "layout"
document.documentElement.dataset.nodesLayoutPlayground = "starting"

const overview = requiredElement("layout-overview")
const detail = requiredElement("layout-detail")
const resolution = resolvePlaygroundRouteTree(
  LAYOUT_PLAYGROUND_ROUTE_TREE,
  window.location,
  {basePath: LAYOUT_PLAYGROUND_BASE_PATH},
)
if (resolution.kind === "not-found") throw new Error(`Неизвестный route стенда раскладки: ${window.location.pathname}`)
document.documentElement.dataset.nodesPlaygroundRouteKind = resolution.node.kind
if (resolution.node.kind === "overview") {
  overview.hidden = false
  requiredLink("layout-detail-link").href = LAYOUT_PLAYGROUND_DETAIL_PATH
  document.documentElement.dataset.nodesLayoutPlayground = "ready"
  document.documentElement.dataset.nodesLayoutSvgCount = "0"
  document.documentElement.dataset.nodesPlayground = "ready"
} else {
  detail.hidden = false
  await import("./layout-detail.ts")
}

function requiredElement(id: string): HTMLElement {
  const element = document.getElementById(id)
  if (!(element instanceof HTMLElement)) throw new Error(`Не найден элемент стенда раскладки: ${id}`)
  return element
}

function requiredLink(id: string): HTMLAnchorElement {
  const element = document.getElementById(id)
  if (!(element instanceof HTMLAnchorElement)) throw new Error(`Не найдена ссылка стенда раскладки: ${id}`)
  return element
}
