import type {UiSurfaceNode} from "@layout/core/runtime"
import type {
  StorybookStoryArgs,
  StorybookStoryModule,
} from "@zavx0z/storybook/stories"
import type {
  GraphNodeTreePresentationSnapshot,
  GraphNodeTreePresentationViewport,
} from "./node-tree-presentation.ts"

export const GRAPH_NODE_TREE_STORY_KIND = "graph-node-tree-preview" as const

/** Lazy adapter-backed preview hosted as a real Workbench Surface. */
export type GraphNodeTreeStoryPreview = Readonly<{
  surface: UiSurfaceNode
  present(
    viewport: GraphNodeTreePresentationViewport,
    args: StorybookStoryArgs,
  ): Promise<GraphNodeTreePresentationSnapshot>
  snapshot(): GraphNodeTreePresentationSnapshot
  dispose(): void
}>

/** Generic Storybook metadata plus the retained NodeEditor preview factory. */
export type GraphNodeTreeStoryModule = StorybookStoryModule & Readonly<{
  kind: typeof GRAPH_NODE_TREE_STORY_KIND
  createPreview(): Promise<GraphNodeTreeStoryPreview>
}>

export function isGraphNodeTreeStoryModule(
  module: StorybookStoryModule,
): module is GraphNodeTreeStoryModule {
  return "kind" in module && module.kind === GRAPH_NODE_TREE_STORY_KIND &&
    "createPreview" in module && typeof module.createPreview === "function"
}
