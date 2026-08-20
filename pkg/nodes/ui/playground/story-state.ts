import type {PlaygroundStoryArgs} from "@ui/playground/stories"
import {nodeEditorStoryState, type NodeEditorStoryState} from "./stories.ts"

export type NodeEditorStoryStateAdapter = Readonly<{
  select(selection: NodeEditorStoryState["selection"]): boolean
  publish(target: NodeEditorStoryState): void
}>

export function applyNodeEditorStoryState(
  args: PlaygroundStoryArgs,
  adapter: NodeEditorStoryStateAdapter,
): NodeEditorStoryState {
  const state = nodeEditorStoryState(args)
  adapter.publish(state)
  adapter.select(state.selection)
  return state
}
