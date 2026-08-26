import type {RuntimeTree} from "@nodes/ui/projection"
import {createGraphNodeTree} from "./graph.ts"

declare const graph: unknown

const tree: RuntimeTree = createGraphNodeTree(graph)

void tree
