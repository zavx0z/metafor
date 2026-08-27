import {
  createGraphNodeTree,
  reconcileGraphNodeTree,
} from "@metafor/node-tree/graph"
import type {Graph} from "@metafor/types/metafor/graph"
import type {
  StorybookStoryArgs,
} from "@zavx0z/storybook/stories"
import {createGraphFixture} from "../../../tests/graph/fixture.ts"
import {GraphNodeTreePresentationController} from "./node-tree-presentation.ts"
import {
  GRAPH_NODE_TREE_STORY_KIND,
  type GraphNodeTreeStoryModule,
} from "./node-tree-story.ts"
import {graphNodeTreeStorySource} from "./source.ts"

type NodeTreeStoryArgs = StorybookStoryArgs & Readonly<{
  incremented: boolean
}>

/** Creates the lazy live presentation of the real Graph-to-NodeTree adapter. */
export function createGraphNodeTreeStory(): GraphNodeTreeStoryModule {
  return Object.freeze({
    kind: GRAPH_NODE_TREE_STORY_KIND,
    defaultArgs: Object.freeze({incremented: false}),
    controls: Object.freeze([{
      key: "incremented",
      label: "Изменить runtime count",
      group: "Graph",
      kind: "boolean",
      interactive: true,
    }]),
    render() {},
    source(args) {
      const current = args as NodeTreeStoryArgs
      const typescript = [
        'import {createGraphNodeTree, reconcileGraphNodeTree} from "@metafor/node-tree/graph"',
        'import {createGraphNodeTreeHierarchicalProjector} from "./hierarchical-node-tree-projector.ts"',
        'import {NodeEditor} from "@nodes/ui/node-editor"',
        'import {createNodeRenderers} from "@nodes/ui/node"',
        "",
        "const tree = createGraphNodeTree(graph)",
        `reconcileGraphNodeTree(tree, nextGraph) // count = ${current.incremented ? 1 : 0}`,
        "const projection = await tree.project(createGraphNodeTreeHierarchicalProjector(), {",
        '  cacheKey: "graph-live",',
        "  context: {viewport},",
        "})",
        "const editor = new NodeEditor({renderers: createNodeRenderers()})",
        "editor.setProjection(projection)",
      ].join("\n")
      return graphNodeTreeStorySource(typescript)
    },
    async createPreview() {
      const controller = new GraphNodeTreePresentationController()
      const tree = createGraphNodeTree(graphFixture(false))
      let presentationQueue = Promise.resolve()
      return Object.freeze({
        surface: controller.surface,
        present(viewport, args) {
          const task = presentationQueue.then(async () => {
            reconcileGraphNodeTree(tree, graphFixture((args as NodeTreeStoryArgs).incremented === true))
            return await controller.present({kind: "tree", tree}, viewport)
          })
          presentationQueue = task.then(() => undefined, () => undefined)
          return task
        },
        snapshot: () => controller.snapshot(),
        dispose() {
          controller.dispose()
          tree.dispose()
        },
      })
    },
  } satisfies GraphNodeTreeStoryModule)
}

function graphFixture(incremented: boolean): Graph {
  const graph = createGraphFixture()
  const root = graph.runtime.roots[0]
  if (root?.kind !== "atom") throw new Error("Graph NodeTree fixture root Atom is absent")
  root.values.count = incremented ? 1 : 0
  return graph
}
