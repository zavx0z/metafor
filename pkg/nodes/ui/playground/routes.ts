import {definePlaygroundRoutes, type PlaygroundNavigationItem} from "@ui/playground"
import {
  NODE_SOCKET_STORIES,
  NODE_SOCKET_STORY_ROUTES,
  isNodeSocketStoryRoute,
  nodeSocketSectionItems,
  nodeSocketVariantItems,
  type NodeSocketStoryRoute,
} from "./stories.ts"

export const NODE_LEGACY_PLAYGROUND_ROUTES = Object.freeze([
  "editor/scene",
  "editor/frames",
  "editor/links",
  "comparison/blender",
] as const)

export const NODE_PLAYGROUND_ROUTES = Object.freeze([
  ...NODE_LEGACY_PLAYGROUND_ROUTES,
  ...NODE_SOCKET_STORY_ROUTES,
])

export type NodeLegacyPlaygroundRoute = typeof NODE_LEGACY_PLAYGROUND_ROUTES[number]
export type NodePlaygroundRoute = NodeLegacyPlaygroundRoute | NodeSocketStoryRoute
export type NodePlaygroundGroup = "editor" | "socket" | "comparison"

export const NODE_PLAYGROUND_ROUTE_DECLARATION = definePlaygroundRoutes({
  routes: NODE_PLAYGROUND_ROUTES,
  fallback: NODE_SOCKET_STORIES.fallback as NodeSocketStoryRoute,
})

export const NODE_PLAYGROUND_CATALOG: readonly PlaygroundNavigationItem<NodePlaygroundRoute>[] = [
  {id: "editor", label: "Редактор нод", route: "editor/scene"},
  {id: "socket", label: "Сокет", route: NODE_SOCKET_STORIES.fallback as NodeSocketStoryRoute},
  {id: "comparison", label: "Сравнение", route: "comparison/blender"},
]

const EDITOR_SECTIONS: readonly PlaygroundNavigationItem<NodePlaygroundRoute>[] = [
  {id: "scene", label: "Полная сцена", route: "editor/scene"},
  {id: "frames", label: "Frame", route: "editor/frames"},
  {id: "links", label: "Link", route: "editor/links"},
]

const COMPARISON_SECTIONS: readonly PlaygroundNavigationItem<NodePlaygroundRoute>[] = [
  {id: "blender", label: "Blender 4.5", route: "comparison/blender"},
]

export function nodePlaygroundGroup(route: NodePlaygroundRoute): NodePlaygroundGroup {
  if (isNodeSocketStoryRoute(route)) return "socket"
  if (route.startsWith("comparison/")) return "comparison"
  return "editor"
}

export function nodePlaygroundCatalog(
  route: NodePlaygroundRoute,
): readonly PlaygroundNavigationItem<NodePlaygroundRoute>[] {
  if (!isNodeSocketStoryRoute(route)) return NODE_PLAYGROUND_CATALOG
  return NODE_PLAYGROUND_CATALOG.map((item) => item.id === "socket" ? {...item, route} : item)
}

export function nodePlaygroundSections(
  route: NodePlaygroundRoute,
): readonly PlaygroundNavigationItem<NodePlaygroundRoute>[] {
  if (isNodeSocketStoryRoute(route)) return nodeSocketSectionItems(route)
  if (nodePlaygroundGroup(route) === "comparison") return COMPARISON_SECTIONS
  return EDITOR_SECTIONS
}

export function nodePlaygroundDockItems(
  route: NodePlaygroundRoute,
): readonly PlaygroundNavigationItem<NodePlaygroundRoute>[] {
  if (isNodeSocketStoryRoute(route)) return nodeSocketVariantItems(route)
  return nodePlaygroundSections(route)
}

export function nodePlaygroundCatalogRoute(route: NodePlaygroundRoute): NodePlaygroundRoute {
  if (isNodeSocketStoryRoute(route)) return route
  if (nodePlaygroundGroup(route) === "comparison") return "comparison/blender"
  return "editor/scene"
}

export function nodePlaygroundSectionTitle(route: NodePlaygroundRoute): string {
  const group = nodePlaygroundGroup(route)
  if (group === "socket") return "Типы сокетов"
  if (group === "comparison") return "Эталон"
  return "Редактор"
}

export function nodePlaygroundInfo(route: NodePlaygroundRoute): Readonly<{
  title: string
  lines: readonly string[]
  status: string
}> {
  const group = nodePlaygroundGroup(route)
  if (group === "comparison") return {
    title: "Blender reference",
    lines: ["Blender 4.5.5 LTS", "Одна representative Node", "Равные FlexBox slots", "Project font + orthogonal Links"],
    status: route,
  }
  return {
    title: "Node components",
    lines: ["Frame / Node", "Socket / Link", "Nested containment", "Pan / zoom / selection"],
    status: route,
  }
}
