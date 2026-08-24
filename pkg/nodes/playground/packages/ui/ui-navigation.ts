import {
  definePlaygroundRouteTree,
  type PlaygroundNavigationItem,
  type PlaygroundOverviewItem,
  type PlaygroundStoryIndexItem,
} from "@ui/playground"
import {
  NODE_COMPONENT_STORIES,
  NODE_COMPONENT_STORY_ROUTES,
  NODE_SOCKET_STORIES,
  NODE_SOCKET_STORY_ROUTES,
  isNodeComponentStoryRoute,
  isNodeSocketStoryRoute,
  type NodeComponentStoryRoute,
  type NodeSocketStoryRoute,
} from "./ui-story-catalog.ts"

export const NODE_UI_PLAYGROUND_BASE_PATH = "/ui" as const

export const NODE_PLAYGROUND_ROUTES = Object.freeze([
  ...NODE_COMPONENT_STORY_ROUTES,
  ...NODE_SOCKET_STORY_ROUTES,
])

export type NodePlaygroundStoryRoute = NodeComponentStoryRoute | NodeSocketStoryRoute
export type NodePlaygroundRoute = string
export type NodePlaygroundGroup = "overview" | "editor" | "socket" | "comparison"

const NODE_PLAYGROUND_GROUP_LABELS = Object.freeze({
  editor: "Редактор",
  socket: "Сокеты",
  comparison: "Сравнение",
} satisfies Readonly<Record<Exclude<NodePlaygroundGroup, "overview">, string>>)

/** Canonical package route hierarchy: root overview, prefix overviews and leaves. */
export const NODE_PLAYGROUND_ROUTE_TREE = definePlaygroundRouteTree({
  leaves: NODE_PLAYGROUND_ROUTES,
})

const COMPONENT_ROUTES = Object.freeze({
  "node-editor": "node-editor",
  frame: "frame",
  link: "link",
  socket: "socket",
  comparison: "comparison",
} satisfies Readonly<Record<string, NodePlaygroundRoute>>)

export const NODE_PLAYGROUND_CATALOG: readonly PlaygroundNavigationItem<NodePlaygroundRoute>[] = [
  {
    id: "node-editor",
    label: "Редактор нод",
    route: COMPONENT_ROUTES["node-editor"],
    group: {id: "editor", label: NODE_PLAYGROUND_GROUP_LABELS.editor},
  },
  {
    id: "frame",
    label: "Frame",
    route: COMPONENT_ROUTES.frame,
    group: {id: "editor", label: NODE_PLAYGROUND_GROUP_LABELS.editor},
  },
  {
    id: "link",
    label: "Link",
    route: COMPONENT_ROUTES.link,
    group: {id: "editor", label: NODE_PLAYGROUND_GROUP_LABELS.editor},
  },
  {
    id: "socket",
    label: "Сокет",
    route: COMPONENT_ROUTES.socket,
    group: {id: "socket", label: NODE_PLAYGROUND_GROUP_LABELS.socket},
  },
  {
    id: "comparison",
    label: "Сравнение",
    route: COMPONENT_ROUTES.comparison,
    group: {id: "comparison", label: NODE_PLAYGROUND_GROUP_LABELS.comparison},
  },
]

const STORY_INDEX = Object.freeze([
  ...NODE_COMPONENT_STORIES.index,
  ...NODE_SOCKET_STORIES.index,
])

export function nodePlaygroundGroup(route: NodePlaygroundRoute): NodePlaygroundGroup {
  const componentId = nodePlaygroundComponentId(route)
  if (componentId === null) return "overview"
  if (componentId === "socket") return "socket"
  if (componentId === "comparison") return "comparison"
  return "editor"
}

export function nodePlaygroundCatalog(
  _route: NodePlaygroundRoute,
  collapsedGroups: ReadonlySet<string> = new Set(),
): readonly PlaygroundNavigationItem<NodePlaygroundRoute>[] {
  return NODE_PLAYGROUND_CATALOG.map((item) => ({
    ...item,
    ...(item.group === undefined ? {} : {group: {
      ...item.group,
      ...(collapsedGroups.has(item.group.id) ? {collapsed: true} : {}),
    }}),
  }))
}

export function nodePlaygroundSections(
  route: NodePlaygroundRoute,
): readonly PlaygroundNavigationItem<NodePlaygroundRoute>[] {
  const componentId = nodePlaygroundComponentId(route)
  if (componentId === null) return Object.freeze([])
  return NODE_PLAYGROUND_ROUTE_TREE.children(componentId).map((node) => ({
    id: node.segment,
    label: nodePlaygroundRouteLabel(node.path),
    route: node.path,
  }))
}

export function nodePlaygroundDockItems(
  route: NodePlaygroundRoute,
): readonly PlaygroundNavigationItem<NodePlaygroundRoute>[] {
  const sectionPath = nodePlaygroundSectionRoute(route)
  if (sectionPath === null) return Object.freeze([])
  return NODE_PLAYGROUND_ROUTE_TREE.children(sectionPath).map((node) => ({
    id: node.segment,
    label: nodePlaygroundRouteLabel(node.path),
    route: node.path,
  }))
}

export function nodePlaygroundCatalogRoute(route: NodePlaygroundRoute): NodePlaygroundRoute {
  return nodePlaygroundComponentId(route) ?? ""
}

export function nodePlaygroundSectionRoute(route: NodePlaygroundRoute): NodePlaygroundRoute | null {
  const segments = routeSegments(route)
  if (segments.length < 2) return null
  return segments.slice(0, 2).join("/")
}

export function nodePlaygroundSectionTitle(route: NodePlaygroundRoute): string {
  const componentId = nodePlaygroundComponentId(route)
  return componentId === null ? "Разделы" : nodePlaygroundRouteLabel(componentId)
}

export function nodePlaygroundDockTitle(route: NodePlaygroundRoute): string {
  return nodePlaygroundComponentId(route) === "socket" ? "Направление" : "Варианты"
}

export function nodePlaygroundIsOverview(route: NodePlaygroundRoute): boolean {
  return NODE_PLAYGROUND_ROUTE_TREE.find(route)?.kind === "overview"
}

export function nodePlaygroundOverviewItems(
  route: NodePlaygroundRoute,
): readonly PlaygroundOverviewItem<NodePlaygroundRoute>[] {
  const node = NODE_PLAYGROUND_ROUTE_TREE.find(route)
  if (node?.kind !== "overview") return Object.freeze([])
  if (node.path === "") {
    return Object.freeze(NODE_PLAYGROUND_CATALOG.map((item) => {
      const description = componentStoryIndex(item.id)?.apiName
      return Object.freeze({
        id: item.id,
        label: item.label,
        ...(description === undefined ? {} : {description}),
        route: item.route,
      })
    }))
  }
  return Object.freeze(NODE_PLAYGROUND_ROUTE_TREE.children(node.path).map((child) => {
    const description = child.kind === "leaf" ? nodePlaygroundStoryIndex(child.path).title : undefined
    return Object.freeze({
      id: child.segment,
      label: nodePlaygroundRouteLabel(child.path),
      ...(description === undefined ? {} : {description}),
      route: child.path,
    })
  }))
}

export function nodePlaygroundOverviewTitle(route: NodePlaygroundRoute): string {
  if (route === "") return "Компоненты @nodes/ui"
  return nodePlaygroundRouteLabel(route)
}

export function nodePlaygroundOverviewDescription(route: NodePlaygroundRoute): string {
  const depth = routeSegments(route).length
  if (depth === 0) return "Выберите компонент, чтобы открыть его разделы."
  if (depth === 1) return "Выберите раздел компонента."
  return "Выберите конкретный пример."
}

export async function loadNodePlaygroundStory(route: NodePlaygroundRoute) {
  if (isNodeSocketStoryRoute(route)) return NODE_SOCKET_STORIES.load(route)
  if (isNodeComponentStoryRoute(route)) return NODE_COMPONENT_STORIES.load(route)
  throw new Error(`Node playground route is not a detail story: ${route}`)
}

export function nodePlaygroundStoryIndex(route: NodePlaygroundRoute): PlaygroundStoryIndexItem {
  const story = STORY_INDEX.find((item) => item.route === route)
  if (story === undefined) throw new Error(`Node playground route is not a detail story: ${route}`)
  return story
}

export function isNodeEditorStoryRoute(route: NodePlaygroundRoute): route is NodeComponentStoryRoute {
  return isNodeComponentStoryRoute(route) && nodePlaygroundStoryIndex(route).componentId === "node-editor"
}

export function isNodeFrameStoryRoute(route: NodePlaygroundRoute): route is NodeComponentStoryRoute {
  return isNodeComponentStoryRoute(route) && nodePlaygroundStoryIndex(route).componentId === "frame"
}

export function isNodeLinkStoryRoute(route: NodePlaygroundRoute): route is NodeComponentStoryRoute {
  return isNodeComponentStoryRoute(route) && nodePlaygroundStoryIndex(route).componentId === "link"
}

function nodePlaygroundComponentId(route: NodePlaygroundRoute): string | null {
  const componentId = routeSegments(route)[0]
  return componentId !== undefined && NODE_PLAYGROUND_CATALOG.some(({id}) => id === componentId)
    ? componentId
    : null
}

function nodePlaygroundRouteLabel(route: NodePlaygroundRoute): string {
  const segments = routeSegments(route)
  if (segments.length === 0) return "Компоненты @nodes/ui"
  if (segments.length === 1) {
    return NODE_PLAYGROUND_CATALOG.find(({id}) => id === segments[0])?.label ?? segments[0]!
  }
  const story = firstStoryUnder(route)
  if (segments.length === 2) return story?.sectionLabel ?? segments[1]!
  return story?.variantLabel ?? segments.at(-1)!
}

function firstStoryUnder(route: NodePlaygroundRoute): PlaygroundStoryIndexItem | undefined {
  return STORY_INDEX.find((story) => story.route === route || story.route.startsWith(`${route}/`))
}

function componentStoryIndex(componentId: string): PlaygroundStoryIndexItem | undefined {
  return STORY_INDEX.find((story) => story.componentId === componentId)
}

function routeSegments(route: NodePlaygroundRoute): readonly string[] {
  return route === "" ? Object.freeze([]) : Object.freeze(route.split("/"))
}
