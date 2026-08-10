import type {NodeSystemNode} from "./model.ts"

/** Presentation-model containment index. */
export type NodeSystemContainmentIndex = Readonly<{
  roots: readonly NodeSystemNode[]
  childrenByParent: ReadonlyMap<string, readonly NodeSystemNode[]>
  parentByChild: ReadonlyMap<string, string>
  rootIdByNode: ReadonlyMap<string, string>
  descendantsByRoot: ReadonlyMap<string, readonly NodeSystemNode[]>
}>
