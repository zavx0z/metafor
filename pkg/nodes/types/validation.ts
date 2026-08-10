import type {NodeSystemNode, NodeSystemPort} from "./model.ts"

/** Validated presentation-document lookup index. */
export type NodeSystemIndex = Readonly<{
  nodes: ReadonlyMap<string, NodeSystemNode>
  ports: ReadonlyMap<string, ReadonlyMap<string, NodeSystemPort>>
}>
