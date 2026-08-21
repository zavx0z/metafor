import {definePlaygroundStoryModule, type PlaygroundStoryArgs, type PlaygroundStoryModule} from "@ui/playground/stories"
import {
  NODE_EDITOR_STORY_NODE_IDS,
  NODE_EDITOR_STORY_TARGETS,
  nodeEditorStoryState,
  type NodeComponentId,
  type NodeEditorStoryTarget,
} from "../stories.ts"

type NodeComponentStoryArgs = PlaygroundStoryArgs & Readonly<{
  component: NodeComponentId
  selected: boolean
  target?: NodeEditorStoryTarget
  "select-open": boolean
  "translation-linked": boolean
  "rotation-linked": boolean
  "rotation-output": boolean
  "color-linked": boolean
  "target-node-id": string
  "previewable": boolean
  "preview-enabled": boolean
  "overlays-visible": boolean
  "previews-visible": boolean
  "preview-buffer": "primary" | "alternate" | "missing" | "zero"
  "preview-nodes": readonly string[]
}>

const COMPONENT_LABELS: Readonly<Record<NodeComponentId, string>> = Object.freeze({
  "node-editor": "Редактор нод",
  frame: "Frame",
  link: "Link",
  comparison: "Сравнение с Blender",
})

export function createNodeComponentStory(
  component: NodeComponentId,
  initialState?: Readonly<{
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
): PlaygroundStoryModule {
  if (component === "node-editor" && initialState === undefined) {
    throw new Error("NodeEditor story requires an exact target and selected state")
  }
  return definePlaygroundStoryModule<NodeComponentStoryArgs>({
    defaultArgs: {
      component,
      selected: initialState?.selected ?? (component === "frame" || component === "link"),
      "select-open": initialState?.selectOpen === true,
      "translation-linked": initialState?.translationLinked !== false,
      "rotation-linked": initialState?.rotationLinked === true,
      "rotation-output": initialState?.rotationOutput === true,
      "color-linked": initialState?.colorLinked !== false,
      "target-node-id": initialState?.nodeId ?? NODE_EDITOR_STORY_NODE_IDS[initialState?.target ?? "expanded"],
      "previewable": initialState?.previewable === true,
      "preview-enabled": initialState?.previewEnabled === true,
      "overlays-visible": true,
      "previews-visible": initialState?.previewsVisible !== false,
      "preview-buffer": initialState?.previewBuffer ?? "primary",
      "preview-nodes": initialState?.previewNodes ?? (initialState?.previewable === true ? ["scalar"] : []),
      ...(initialState === undefined ? {} : {target: initialState.target}),
    },
    controls: component === "node-editor"
      ? [
          {
            key: "target",
            label: "Нода",
            group: "Состояние",
            kind: "select",
            options: NODE_EDITOR_STORY_TARGETS.map((target) => ({
              value: target,
              label: target === "expanded" ? "Развёрнутая" : "Свернутая",
            })),
          },
          {key: "selected", label: "Выбрана", group: "Состояние", kind: "boolean"},
          {key: "select-open", label: "Select раскрыт", group: "Состояние", kind: "boolean"},
          ...(initialState?.previewable === undefined ? [] : [
            {key: "preview-enabled", label: "Preview ноды", group: "Preview", kind: "boolean" as const},
            {key: "overlays-visible", label: "Global Overlays", group: "Preview", kind: "boolean" as const},
            {key: "previews-visible", label: "Global Previews", group: "Preview", kind: "boolean" as const},
            {
              key: "preview-buffer",
              label: "Buffer",
              group: "Preview",
              kind: "select" as const,
              options: [
                {value: "primary", label: "Primary"},
                {value: "alternate", label: "Alternate"},
                {value: "missing", label: "Missing"},
                {value: "zero", label: "Zero size"},
              ],
            },
          ]),
        ]
      : component === "frame" || component === "link"
        ? [{key: "selected", label: "Выбран", group: "Состояние", kind: "boolean"}]
        : [],
    render() {
      // Surface-based production previews остаются отдельными UiSurface owners в client.ts.
    },
    source(args) {
      if (args.component === "comparison") return [
        'import {NodeEditor} from "@nodes/ui/node-editor"',
        'import {createBlenderNodeRenderers} from "@nodes/ui/blender-node"',
        "",
        "const editor = new NodeEditor({",
        "  renderers: createBlenderNodeRenderers(),",
        '  title: "СРАВНЕНИЕ С BLENDER",',
        "})",
        "editor.setTree(comparisonTree)",
      ].join("\n")
      if (args.component === "link") return [
        'import {NodeEditor} from "@nodes/ui/node-editor"',
        'import {createBlenderNodeRenderers} from "@nodes/ui/blender-node"',
        'import {sampleLinkBezierPath} from "@nodes/ui/link-curve"',
        "",
        "void sampleLinkBezierPath",
        "const editor = new NodeEditor({renderers: createBlenderNodeRenderers()})",
        "editor.setTree(tree)",
        ...(args.selected ? ['editor.select({kind: "link", id: "matrix-shader"})'] : ["editor.select(null)"]),
      ].join("\n")
      if (args.component === "frame") return [
        'import {NodeEditor} from "@nodes/ui/node-editor"',
        'import {createBlenderNodeRenderers} from "@nodes/ui/blender-node"',
        "",
        "const editor = new NodeEditor({renderers: createBlenderNodeRenderers()})",
        "editor.setTree(tree)",
        ...(args.selected ? ['editor.select({kind: "frame", id: "data-frame"})'] : ["editor.select(null)"]),
      ].join("\n")
      if (args.component === "node-editor") {
        const state = nodeEditorStoryState(args)
        return [
          'import {NodeEditor} from "@nodes/ui/node-editor"',
          'import {createBlenderNodeRenderers} from "@nodes/ui/blender-node"',
          "",
          `const targetNodeId = ${JSON.stringify(state.nodeId)}`,
          "if (!tree.nodes.some(({node}) => node.id === targetNodeId)) {",
          '  throw new Error(`Missing story Node: ${targetNodeId}`)',
          "}",
          "const editor = new NodeEditor({",
          "  renderers: createBlenderNodeRenderers(),",
          `  title: ${JSON.stringify(COMPONENT_LABELS[component])},`,
          "})",
          `editor.setOverlayState({overlays: ${args["overlays-visible"]}, previews: ${args["previews-visible"]}})`,
          "editor.setTree(tree)",
          ...(state.selected
            ? ['editor.select({kind: "node", id: targetNodeId})']
            : ["editor.select(null)"]),
        ].join("\n")
      }
      return [
        'import {NodeEditor} from "@nodes/ui/node-editor"',
        'import {createBlenderNodeRenderers} from "@nodes/ui/blender-node"',
        "",
        "const editor = new NodeEditor({",
        "  renderers: createBlenderNodeRenderers(),",
        `  title: ${JSON.stringify(COMPONENT_LABELS[component])},`,
        "})",
        "editor.setTree(tree)",
      ].join("\n")
    },
  })
}
