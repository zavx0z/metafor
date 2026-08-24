import {
  definePlaygroundStories,
  type PlaygroundNavigationItem,
  type PlaygroundStoryIndexItem,
  type PlaygroundStoryModule,
} from "@ui/playground"
import {
  NODE_PARAMETER_FIELD_KINDS,
  NODE_PARAMETER_FIELD_LABELS,
  NODE_PARAMETER_VARIANTS,
  NODE_PARAMETER_VARIANT_LABELS,
  type NodeParameterFieldKind,
  type NodeParameterStoryRoute,
  type NodeParameterVariant,
} from "./parameter-catalog.ts"

export type {NodeParameterStoryRoute} from "./parameter-catalog.ts"

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
  "parameter",
  "link",
  "comparison",
] as const)

export type NodeComponentId = typeof NODE_COMPONENT_IDS[number]
export const NODE_EDITOR_STORY_TARGETS = Object.freeze(["expanded", "collapsed"] as const)
export type NodeEditorStoryTarget = typeof NODE_EDITOR_STORY_TARGETS[number]
export type NodeEditorStoryRoute =
  | "node-editor/scene/default"
  | "node-editor/scene/selected"
  | "node-editor/scene/rotation-linked"
  | "node-editor/scene/translation-unlinked"
  | "node-editor/scene/output-only"
  | "node-editor/scene/mixed-sides"
  | "node-editor/scene/color-unlinked"
  | "node-editor/scene/inventory"
  | "node-editor/preview/closed"
  | "node-editor/preview/open"
  | "node-editor/preview/global-hidden"
  | "node-editor/preview/alternate"
  | "node-editor/preview/missing"
  | "node-editor/preview/zero"
  | "node-editor/preview/multiple"
  | "node-editor/preview/non-previewable"
  | "node-editor/collapsed/default"
  | "node-editor/collapsed/selected"
  | "node-editor/popup/select-open"
export type NodeComponentStoryRoute =
  | NodeEditorStoryRoute
  | NodeParameterStoryRoute
  | "frame/nested/default"
  | "link/orthogonal/selected"
  | "comparison/blender/default"

export const NODE_EDITOR_STORY_NODE_IDS: Readonly<Record<NodeEditorStoryTarget, string>> = Object.freeze({
  expanded: "scalar",
  collapsed: "collapsed",
})

export type NodeEditorStoryState = Readonly<{
  target: NodeEditorStoryTarget
  selected: boolean
  nodeId: string
  selection: Readonly<{kind: "node"; id: string}> | null
}>

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
  state?: Readonly<{
    target: NodeEditorStoryTarget
    selected: boolean
    selectOpen?: boolean
    translationLinked?: boolean
    rotationLinked?: boolean
    rotationOutput?: boolean
    colorLinked?: boolean
    previewEnabled?: boolean
    previewsVisible?: boolean
    previewable?: boolean
    previewBuffer?: "primary" | "alternate" | "missing" | "zero"
    previewNodes?: readonly string[]
    nodeId?: string
  }>,
) => async (): Promise<PlaygroundStoryModule> => {
  await import("@nodes/ui/node-editor")
  await import("@nodes/ui/blender-node")
  if (component === "link") await import("@nodes/ui/link-curve")
  const {createNodeComponentStory} = await import("./stories/node-components.ts")
  return createNodeComponentStory(component, state)
}

const loadParameterStory = (
  kind: NodeParameterFieldKind,
  variant: NodeParameterVariant,
) => async (): Promise<PlaygroundStoryModule> => {
  const {createParameterStory} = await import("./stories/parameter.ts")
  return createParameterStory(kind, variant)
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
          label: "Развёрнутая нода",
          variants: [
            {
              id: "default",
              label: "Обычная",
              title: "Редактор нод · Развёрнутая · Обычная",
              tags: ["expanded", "ordinary"],
              load: loadNodeComponentStory("node-editor", {target: "expanded", selected: false}),
            },
            {
              id: "selected",
              label: "Выбранная",
              title: "Редактор нод · Развёрнутая · Выбранная",
              tags: ["expanded", "selected"],
              load: loadNodeComponentStory("node-editor", {target: "expanded", selected: true}),
            },
            {
              id: "rotation-linked",
              label: "Rotation linked",
              title: "Редактор нод · Shifted Rotation Link",
              tags: ["expanded", "linked", "rotation", "evidence"],
              load: loadNodeComponentStory("node-editor", {
                target: "expanded",
                selected: false,
                rotationLinked: true,
              }),
            },
            {
              id: "translation-unlinked",
              label: "Translation unlinked",
              title: "Редактор нод · Translation без связи",
              tags: ["expanded", "unlinked", "translation", "evidence"],
              load: loadNodeComponentStory("node-editor", {
                target: "expanded",
                selected: false,
                translationLinked: false,
              }),
            },
            {
              id: "output-only",
              label: "Output-only",
              title: "Редактор нод · Rotation output-only",
              tags: ["expanded", "output", "rotation", "evidence"],
              load: loadNodeComponentStory("node-editor", {
                target: "expanded",
                selected: false,
                nodeId: "transform",
                rotationOutput: true,
              }),
            },
            {
              id: "mixed-sides",
              label: "Left + right",
              title: "Редактор нод · Matrix mixed sockets",
              tags: ["expanded", "input", "output", "matrix", "evidence"],
              load: loadNodeComponentStory("node-editor", {
                target: "expanded",
                selected: false,
                nodeId: "matrix",
              }),
            },
            {
              id: "color-unlinked",
              label: "Color unlinked",
              title: "Редактор нод · ColorInput без связи",
              tags: ["expanded", "unlinked", "color", "interaction"],
              load: loadNodeComponentStory("node-editor", {
                target: "expanded",
                selected: false,
                nodeId: "shader",
                colorLinked: false,
              }),
            },
            {
              id: "inventory",
              label: "Path + Collection",
              title: "Редактор нод · Полный Field inventory",
              tags: ["expanded", "path", "collection", "reference", "interaction"],
              load: loadNodeComponentStory("node-editor", {
                target: "expanded",
                selected: false,
                nodeId: "asset",
              }),
            },
          ],
        }, {
          id: "preview",
          label: "Node Preview",
          variants: [
            {
              id: "closed",
              label: "Preview closed",
              title: "Редактор нод · Preview toggle closed",
              tags: ["preview", "toggle", "closed"],
              load: loadNodeComponentStory("node-editor", {
                target: "expanded",
                selected: false,
                nodeId: "scalar",
                previewable: true,
                previewEnabled: false,
              }),
            },
            {
              id: "open",
              label: "Preview open",
              title: "Редактор нод · Preview image open",
              tags: ["preview", "toggle", "image", "open"],
              load: loadNodeComponentStory("node-editor", {
                target: "expanded",
                selected: false,
                nodeId: "scalar",
                previewable: true,
                previewEnabled: true,
              }),
            },
            {
              id: "global-hidden",
              label: "Global Previews off",
              title: "Редактор нод · Preview globally hidden",
              tags: ["preview", "global", "hidden"],
              load: loadNodeComponentStory("node-editor", {
                target: "expanded",
                selected: false,
                nodeId: "scalar",
                previewable: true,
                previewEnabled: true,
                previewsVisible: false,
              }),
            },
            {
              id: "alternate",
              label: "Buffer updated",
              title: "Редактор нод · Preview alternate buffer",
              tags: ["preview", "buffer", "update"],
              load: loadNodeComponentStory("node-editor", {
                target: "expanded",
                selected: false,
                nodeId: "scalar",
                previewable: true,
                previewEnabled: true,
                previewBuffer: "alternate",
              }),
            },
            {
              id: "missing",
              label: "Missing buffer",
              title: "Редактор нод · Preview buffer missing",
              tags: ["preview", "buffer", "missing"],
              load: loadNodeComponentStory("node-editor", {
                target: "expanded",
                selected: false,
                nodeId: "scalar",
                previewable: true,
                previewEnabled: true,
                previewBuffer: "missing",
              }),
            },
            {
              id: "zero",
              label: "Zero-size buffer",
              title: "Редактор нод · Preview buffer zero size",
              tags: ["preview", "buffer", "zero"],
              load: loadNodeComponentStory("node-editor", {
                target: "expanded",
                selected: false,
                nodeId: "scalar",
                previewable: true,
                previewEnabled: true,
                previewBuffer: "zero",
              }),
            },
            {
              id: "multiple",
              label: "Multiple previews",
              title: "Редактор нод · Multiple preview panels",
              tags: ["preview", "multiple", "nodes"],
              load: loadNodeComponentStory("node-editor", {
                target: "expanded",
                selected: false,
                nodeId: "scalar",
                previewable: true,
                previewEnabled: true,
                previewNodes: ["scalar", "shader"],
              }),
            },
            {
              id: "non-previewable",
              label: "Non-previewable",
              title: "Редактор нод · No preview capability",
              tags: ["preview", "capability", "absent"],
              load: loadNodeComponentStory("node-editor", {
                target: "expanded",
                selected: false,
                nodeId: "transform",
                previewable: false,
              }),
            },
          ],
        }, {
          id: "collapsed",
          label: "Свернутая нода",
          variants: [
            {
              id: "default",
              label: "Обычная",
              title: "Редактор нод · Свернутая · Обычная",
              tags: ["collapsed", "ordinary"],
              load: loadNodeComponentStory("node-editor", {target: "collapsed", selected: false}),
            },
            {
              id: "selected",
              label: "Выбранная",
              title: "Редактор нод · Свернутая · Выбранная",
              tags: ["collapsed", "selected"],
              load: loadNodeComponentStory("node-editor", {target: "collapsed", selected: true}),
            },
          ],
        }, {
          id: "popup",
          label: "Раскрытые controls",
          variants: [{
            id: "select-open",
            label: "Select раскрыт",
            title: "Редактор нод · Select раскрыт",
            tags: ["expanded", "select", "open", "overlay"],
            load: loadNodeComponentStory("node-editor", {target: "expanded", selected: false, selectOpen: true}),
          }],
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
        id: "parameter",
        label: "Параметры",
        apiName: "Parameter",
        tags: ["parameter", "field", "socket", "link"],
        sections: NODE_PARAMETER_FIELD_KINDS.map((kind) => ({
          id: kind,
          label: NODE_PARAMETER_FIELD_LABELS[kind],
          variants: NODE_PARAMETER_VARIANTS.map((variant) => ({
            id: variant,
            label: NODE_PARAMETER_VARIANT_LABELS[variant],
            title: `${NODE_PARAMETER_FIELD_LABELS[kind]} · ${NODE_PARAMETER_VARIANT_LABELS[variant]}`,
            tags: ["parameter", "field", kind, variant],
            load: loadParameterStory(kind, variant),
          })),
        })),
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

export function nodeEditorStoryRoute(
  target: NodeEditorStoryTarget,
  selected: boolean,
): NodeEditorStoryRoute {
  if (target === "expanded") return selected ? "node-editor/scene/selected" : "node-editor/scene/default"
  return selected ? "node-editor/collapsed/selected" : "node-editor/collapsed/default"
}

export function nodeEditorStoryState(args: Readonly<Record<string, unknown>>): NodeEditorStoryState {
  const target = args.target
  if (target !== "expanded" && target !== "collapsed") {
    throw new Error(`Unknown NodeEditor story target: ${String(target)}`)
  }
  if (typeof args.selected !== "boolean") {
    throw new Error(`Invalid NodeEditor selected state: ${String(args.selected)}`)
  }
  const nodeId = typeof args["target-node-id"] === "string"
    ? args["target-node-id"]
    : NODE_EDITOR_STORY_NODE_IDS[target]
  return Object.freeze({
    target,
    selected: args.selected,
    nodeId,
    selection: args.selected ? Object.freeze({kind: "node", id: nodeId}) : null,
  })
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
