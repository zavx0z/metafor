import {definePlaygroundRoutes, type PlaygroundNavigationItem} from "@ui/playground"
import {
  NODE_COMPONENT_STORIES,
  NODE_COMPONENT_STORY_ROUTES,
  NODE_SOCKET_STORIES,
  NODE_SOCKET_STORY_ROUTES,
  isNodeSocketStoryRoute,
  nodeComponentSectionItems,
  nodeComponentStoryIndex,
  nodeComponentVariantItems,
  nodeSocketSectionItems,
  nodeSocketVariantItems,
  type NodeComponentStoryRoute,
  type NodeSocketStoryRoute,
} from "./stories.ts"

export const NODE_PLAYGROUND_ROUTES = Object.freeze([
  ...NODE_COMPONENT_STORY_ROUTES,
  ...NODE_SOCKET_STORY_ROUTES,
])

export type NodePlaygroundRoute = NodeComponentStoryRoute | NodeSocketStoryRoute
export type NodePlaygroundGroup = "editor" | "socket" | "comparison"

export const NODE_PLAYGROUND_ROUTE_DECLARATION = definePlaygroundRoutes({
  routes: NODE_PLAYGROUND_ROUTES,
  fallback: NODE_SOCKET_STORIES.fallback as NodeSocketStoryRoute,
})

const COMPONENT_ROUTES = Object.freeze({
  "node-editor": "node-editor/scene/default",
  frame: "frame/nested/default",
  link: "link/orthogonal/selected",
  socket: NODE_SOCKET_STORIES.fallback as NodeSocketStoryRoute,
  comparison: "comparison/blender/default",
} satisfies Readonly<Record<string, NodePlaygroundRoute>>)

export const NODE_PLAYGROUND_CATALOG: readonly PlaygroundNavigationItem<NodePlaygroundRoute>[] = [
  {id: "node-editor", label: "Редактор нод", route: COMPONENT_ROUTES["node-editor"]},
  {id: "frame", label: "Frame", route: COMPONENT_ROUTES.frame},
  {id: "link", label: "Link", route: COMPONENT_ROUTES.link},
  {id: "socket", label: "Сокет", route: COMPONENT_ROUTES.socket},
  {id: "comparison", label: "Сравнение", route: COMPONENT_ROUTES.comparison},
]

const LEGACY_ROUTE_ALIASES: Readonly<Record<string, NodePlaygroundRoute>> = Object.freeze({
  "editor/scene": COMPONENT_ROUTES["node-editor"],
  "editor/frames": COMPONENT_ROUTES.frame,
  "editor/links": COMPONENT_ROUTES.link,
  "socket/types": COMPONENT_ROUTES.socket,
  "socket/shapes": COMPONENT_ROUTES.socket,
  "socket/states": COMPONENT_ROUTES.socket,
  "comparison/blender": COMPONENT_ROUTES.comparison,
})

export function normalizeNodePlaygroundPath(pathname: string): NodePlaygroundRoute | null {
  const route = pathname.replace(/^\/+|\/+$/g, "")
  return LEGACY_ROUTE_ALIASES[route] ?? null
}

export function nodePlaygroundGroup(route: NodePlaygroundRoute): NodePlaygroundGroup {
  if (isNodeSocketStoryRoute(route)) return "socket"
  return nodeComponentStoryIndex(route).componentId === "comparison" ? "comparison" : "editor"
}

export function nodePlaygroundCatalog(
  route: NodePlaygroundRoute,
): readonly PlaygroundNavigationItem<NodePlaygroundRoute>[] {
  const componentId = isNodeSocketStoryRoute(route) ? "socket" : nodeComponentStoryIndex(route).componentId
  return NODE_PLAYGROUND_CATALOG.map((item) => item.id === componentId ? {...item, route} : item)
}

export function nodePlaygroundSections(
  route: NodePlaygroundRoute,
): readonly PlaygroundNavigationItem<NodePlaygroundRoute>[] {
  return isNodeSocketStoryRoute(route)
    ? nodeSocketSectionItems(route)
    : nodeComponentSectionItems(route)
}

export function nodePlaygroundDockItems(
  route: NodePlaygroundRoute,
): readonly PlaygroundNavigationItem<NodePlaygroundRoute>[] {
  return isNodeSocketStoryRoute(route)
    ? nodeSocketVariantItems(route)
    : nodeComponentVariantItems(route)
}

export function nodePlaygroundCatalogRoute(route: NodePlaygroundRoute): NodePlaygroundRoute {
  return route
}

export function nodePlaygroundSectionTitle(route: NodePlaygroundRoute): string {
  if (isNodeSocketStoryRoute(route)) return "Типы сокетов"
  return nodeComponentStoryIndex(route).componentLabel
}

export async function loadNodePlaygroundStory(route: NodePlaygroundRoute) {
  return isNodeSocketStoryRoute(route)
    ? NODE_SOCKET_STORIES.load(route)
    : NODE_COMPONENT_STORIES.load(route)
}

export function nodePlaygroundStoryIndex(route: NodePlaygroundRoute) {
  return isNodeSocketStoryRoute(route)
    ? NODE_SOCKET_STORIES.find(route)!
    : NODE_COMPONENT_STORIES.find(route)!
}

export function isNodeEditorStoryRoute(route: NodePlaygroundRoute): boolean {
  return !isNodeSocketStoryRoute(route) && nodeComponentStoryIndex(route).componentId === "node-editor"
}

export function isNodeFrameStoryRoute(route: NodePlaygroundRoute): boolean {
  return !isNodeSocketStoryRoute(route) && nodeComponentStoryIndex(route).componentId === "frame"
}

export function isNodeLinkStoryRoute(route: NodePlaygroundRoute): boolean {
  return !isNodeSocketStoryRoute(route) && nodeComponentStoryIndex(route).componentId === "link"
}
