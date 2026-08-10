import type {NodeSystemPoint} from "./model.ts"

/** Options for explicit presentation edits; unrelated to automatic layout. */
export type StableNodeSystemLayoutOptions = Readonly<{spacing?: number; padding?: number}>
export type NodeSystemAnchors = ReadonlyMap<string, NodeSystemPoint>
