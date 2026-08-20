import {definePlaygroundRoutes, type PlaygroundNavigationItem} from "@ui/playground"

export const NODE_PLAYGROUND_ROUTES = Object.freeze([
  "editor/scene",
  "editor/frames",
  "editor/links",
  "socket/types",
  "socket/shapes",
  "socket/states",
  "comparison/blender",
] as const)

export type NodePlaygroundRoute = typeof NODE_PLAYGROUND_ROUTES[number]
export type NodePlaygroundGroup = "editor" | "socket" | "comparison"

export const NODE_PLAYGROUND_ROUTE_DECLARATION = definePlaygroundRoutes({
  routes: NODE_PLAYGROUND_ROUTES,
  fallback: "editor/scene",
})

export const NODE_PLAYGROUND_CATALOG: readonly PlaygroundNavigationItem<NodePlaygroundRoute>[] = [
  {id: "editor", label: "Редактор нод", route: "editor/scene"},
  {id: "socket", label: "Сокеты", route: "socket/types"},
  {id: "comparison", label: "Сравнение", route: "comparison/blender"},
]

const EDITOR_SECTIONS: readonly PlaygroundNavigationItem<NodePlaygroundRoute>[] = [
  {id: "scene", label: "Полная сцена", route: "editor/scene"},
  {id: "frames", label: "Frame", route: "editor/frames"},
  {id: "links", label: "Link", route: "editor/links"},
]

const SOCKET_SECTIONS: readonly PlaygroundNavigationItem<NodePlaygroundRoute>[] = [
  {id: "types", label: "Типы", route: "socket/types"},
  {id: "shapes", label: "Формы", route: "socket/shapes"},
  {id: "states", label: "Состояния", route: "socket/states"},
]

const COMPARISON_SECTIONS: readonly PlaygroundNavigationItem<NodePlaygroundRoute>[] = [
  {id: "blender", label: "Blender 4.5", route: "comparison/blender"},
]

export function nodePlaygroundGroup(route: NodePlaygroundRoute): NodePlaygroundGroup {
  if (route.startsWith("socket/")) return "socket"
  if (route.startsWith("comparison/")) return "comparison"
  return "editor"
}

export function nodePlaygroundSections(route: NodePlaygroundRoute): readonly PlaygroundNavigationItem<NodePlaygroundRoute>[] {
  const group = nodePlaygroundGroup(route)
  if (group === "socket") return SOCKET_SECTIONS
  if (group === "comparison") return COMPARISON_SECTIONS
  return EDITOR_SECTIONS
}

export function nodePlaygroundCatalogRoute(route: NodePlaygroundRoute): NodePlaygroundRoute {
  const group = nodePlaygroundGroup(route)
  if (group === "socket") return "socket/types"
  if (group === "comparison") return "comparison/blender"
  return "editor/scene"
}

export function nodePlaygroundSectionTitle(route: NodePlaygroundRoute): string {
  const group = nodePlaygroundGroup(route)
  if (group === "socket") return "Сокеты"
  if (group === "comparison") return "Эталон"
  return "Редактор"
}

export function nodePlaygroundInfo(route: NodePlaygroundRoute): Readonly<{
  title: string
  lines: readonly string[]
  status: string
}> {
  const group = nodePlaygroundGroup(route)
  if (group === "socket") return {
    title: "Socket contract",
    lines: ["19 типов", "8 форм", "input / output / bidirectional", "Без Fields и Parameters"],
    status: route,
  }
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
