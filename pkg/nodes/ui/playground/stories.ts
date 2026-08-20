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

export const NODE_COMPONENT_IDS = Object.freeze([
  "node-editor",
  "frame",
  "link",
  "comparison",
] as const)

export type NodeComponentId = typeof NODE_COMPONENT_IDS[number]
export type NodeComponentStoryRoute =
  | "node-editor/scene/default"
  | "frame/nested/default"
  | "link/orthogonal/selected"
  | "comparison/blender/default"

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

const loadNodeComponentStory = (
  component: NodeComponentId,
) => async (): Promise<PlaygroundStoryModule> => {
  await import("@nodes/ui/node-editor")
  await import("@nodes/ui/blender-node")
  if (component === "link") await import("@nodes/ui/link-curve")
  const {createNodeComponentStory} = await import("./stories/node-components.ts")
  return createNodeComponentStory(component)
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

export const NODE_COMPONENT_STORIES = definePlaygroundStories({
  groups: [{
    id: "node-components",
    label: "Компоненты нод",
    components: [
      {
        id: "node-editor",
        label: "Редактор нод",
        apiName: "NodeEditor",
        sections: [{
          id: "scene",
          label: "Полная сцена",
          variants: [{id: "default", label: "Основная", title: "Редактор нод · Полная сцена", load: loadNodeComponentStory("node-editor")}],
        }],
      },
      {
        id: "frame",
        label: "Frame",
        apiName: "BlenderFrame",
        sections: [{
          id: "nested",
          label: "Вложенный Frame",
          variants: [{id: "default", label: "Выбран", title: "Frame · Вложенность", load: loadNodeComponentStory("frame")}],
        }],
      },
      {
        id: "link",
        label: "Link",
        apiName: "BlenderLink",
        sections: [{
          id: "orthogonal",
          label: "Ортогональный Link",
          variants: [{id: "selected", label: "Выбран", title: "Link · Ортогональный", load: loadNodeComponentStory("link")}],
        }],
      },
      {
        id: "comparison",
        label: "Сравнение",
        apiName: "NodeEditor",
        sections: [{
          id: "blender",
          label: "Blender 4.5",
          variants: [{id: "default", label: "Референс", title: "Blender 4.5 · Сравнение", load: loadNodeComponentStory("comparison")}],
        }],
      },
    ],
  }],
  fallback: {component: "node-editor", section: "scene", variant: "default"},
})

export const NODE_COMPONENT_STORY_ROUTES = Object.freeze(
  [...NODE_COMPONENT_STORIES.declaration.routes] as NodeComponentStoryRoute[],
)

export function isNodeSocketStoryRoute(route: string): route is NodeSocketStoryRoute {
  return NODE_SOCKET_STORIES.find(route) !== undefined
}

export function isNodeComponentStoryRoute(route: string): route is NodeComponentStoryRoute {
  return NODE_COMPONENT_STORIES.find(route) !== undefined
}

export function nodeSocketStoryIndex(route: NodeSocketStoryRoute): PlaygroundStoryIndexItem {
  const story = NODE_SOCKET_STORIES.find(route)
  if (story === undefined) throw new Error(`Unknown Node Socket story: ${route}`)
  return story
}

export function nodeComponentStoryIndex(route: NodeComponentStoryRoute): PlaygroundStoryIndexItem {
  const story = NODE_COMPONENT_STORIES.find(route)
  if (story === undefined) throw new Error(`Unknown Node component story: ${route}`)
  return story
}

export function nodeComponentSectionItems(
  route: NodeComponentStoryRoute,
): readonly PlaygroundNavigationItem<NodeComponentStoryRoute>[] {
  const selected = nodeComponentStoryIndex(route)
  const sections = new Map<string, PlaygroundStoryIndexItem>()
  for (const story of NODE_COMPONENT_STORIES.index) {
    if (story.componentId === selected.componentId && !sections.has(story.sectionId)) sections.set(story.sectionId, story)
  }
  return [...sections.values()].map((story) => ({
    id: story.sectionId,
    label: story.sectionLabel,
    route: story.route as NodeComponentStoryRoute,
  }))
}

export function nodeComponentVariantItems(
  route: NodeComponentStoryRoute,
): readonly PlaygroundNavigationItem<NodeComponentStoryRoute>[] {
  return NODE_COMPONENT_STORIES.variants(route).map((story) => ({
    id: story.variantId,
    label: story.variantLabel,
    route: story.route as NodeComponentStoryRoute,
  }))
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
