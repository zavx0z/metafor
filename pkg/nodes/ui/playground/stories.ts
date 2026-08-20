import {
  definePlaygroundStories,
  type PlaygroundNavigationItem,
  type PlaygroundStoryIndexItem,
  type PlaygroundStoryModule,
} from "@ui/playground"

export const NODE_SOCKET_KINDS = Object.freeze([
  "boolean",
  "float",
  "integer",
  "vector",
  "rotation",
  "color",
  "string",
  "menu",
  "object",
  "collection",
  "image",
  "material",
  "texture",
  "geometry",
  "matrix",
  "shader",
  "bundle",
  "closure",
  "custom",
] as const)

export type NodeSocketKind = typeof NODE_SOCKET_KINDS[number]

export const NODE_SOCKET_DIRECTIONS = Object.freeze([
  "input",
  "output",
  "bidirectional",
] as const)

export type NodeSocketDirection = typeof NODE_SOCKET_DIRECTIONS[number]
export type NodeSocketStoryRoute = `socket/${NodeSocketKind}/${NodeSocketDirection}`

export const NODE_SOCKET_LABELS: Readonly<Record<NodeSocketKind, string>> = Object.freeze({
  boolean: "Boolean",
  float: "Float",
  integer: "Integer",
  vector: "Vector",
  rotation: "Rotation",
  color: "Color",
  string: "String",
  menu: "Menu",
  object: "Object",
  collection: "Collection",
  image: "Image",
  material: "Material",
  texture: "Texture",
  geometry: "Geometry",
  matrix: "Matrix",
  shader: "Shader",
  bundle: "Bundle",
  closure: "Closure",
  custom: "Custom",
})

export const NODE_SOCKET_DIRECTION_LABELS: Readonly<Record<NodeSocketDirection, string>> = Object.freeze({
  input: "Вход",
  output: "Выход",
  bidirectional: "Двунаправленный",
})

const loadSocketStory = (
  kind: NodeSocketKind,
  direction: NodeSocketDirection,
) => async (): Promise<PlaygroundStoryModule> => {
  const {createSocketStory} = await import("./stories/socket.ts")
  return createSocketStory({kind, direction})
}

export const NODE_SOCKET_STORIES = definePlaygroundStories({
  groups: [{
    id: "node-components",
    label: "Компоненты нод",
    components: [{
      id: "socket",
      label: "Сокет",
      apiName: "BlenderSocket",
      tags: ["endpoint", "тип", "направление"],
      sections: NODE_SOCKET_KINDS.map((kind) => ({
        id: kind,
        label: NODE_SOCKET_LABELS[kind],
        variants: NODE_SOCKET_DIRECTIONS.map((direction) => ({
          id: direction,
          label: NODE_SOCKET_DIRECTION_LABELS[direction],
          title: `${NODE_SOCKET_LABELS[kind]} · ${NODE_SOCKET_DIRECTION_LABELS[direction]}`,
          tags: [kind, direction],
          load: loadSocketStory(kind, direction),
        })),
      })),
    }],
  }],
  fallback: {component: "socket", section: "boolean", variant: "input"},
})

export const NODE_SOCKET_STORY_ROUTES = Object.freeze(
  [...NODE_SOCKET_STORIES.declaration.routes] as NodeSocketStoryRoute[],
)

export function isNodeSocketStoryRoute(route: string): route is NodeSocketStoryRoute {
  return NODE_SOCKET_STORIES.find(route) !== undefined
}

export function nodeSocketStoryIndex(route: NodeSocketStoryRoute): PlaygroundStoryIndexItem {
  const story = NODE_SOCKET_STORIES.find(route)
  if (story === undefined) throw new Error(`Unknown Node Socket story: ${route}`)
  return story
}

export function nodeSocketRoute(
  kind: NodeSocketKind,
  direction: NodeSocketDirection,
): NodeSocketStoryRoute {
  return `socket/${kind}/${direction}`
}

export function nodeSocketSectionItems(
  route: NodeSocketStoryRoute,
): readonly PlaygroundNavigationItem<NodeSocketStoryRoute>[] {
  const selected = nodeSocketStoryIndex(route)
  return NODE_SOCKET_KINDS.map((kind) => ({
    id: kind,
    label: NODE_SOCKET_LABELS[kind],
    route: nodeSocketRoute(kind, selected.variantId as NodeSocketDirection),
    searchText: `${kind} ${NODE_SOCKET_LABELS[kind]}`.toLocaleLowerCase("ru-RU"),
  }))
}

export function nodeSocketVariantItems(
  route: NodeSocketStoryRoute,
): readonly PlaygroundNavigationItem<NodeSocketStoryRoute>[] {
  const selected = nodeSocketStoryIndex(route)
  return NODE_SOCKET_DIRECTIONS.map((direction) => ({
    id: direction,
    label: NODE_SOCKET_DIRECTION_LABELS[direction],
    route: nodeSocketRoute(selected.sectionId as NodeSocketKind, direction),
  }))
}
