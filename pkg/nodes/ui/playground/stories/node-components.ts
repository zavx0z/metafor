import {definePlaygroundStoryModule, type PlaygroundStoryArgs, type PlaygroundStoryModule} from "@ui/playground/stories"
import type {NodeComponentId} from "../stories.ts"

type NodeComponentStoryArgs = PlaygroundStoryArgs & Readonly<{
  component: NodeComponentId
  selected: boolean
}>

const COMPONENT_LABELS: Readonly<Record<NodeComponentId, string>> = Object.freeze({
  "node-editor": "Редактор нод",
  frame: "Frame",
  link: "Link",
  comparison: "Blender comparison",
})

export function createNodeComponentStory(component: NodeComponentId): PlaygroundStoryModule {
  return definePlaygroundStoryModule<NodeComponentStoryArgs>({
    defaultArgs: {
      component,
      selected: component === "frame" || component === "link",
    },
    controls: component === "frame" || component === "link"
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
        '  title: "BLENDER COMPARISON",',
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
