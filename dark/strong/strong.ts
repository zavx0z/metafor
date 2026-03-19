import type { NodeType } from "@metafor/dsl";


export function* particleGenerator(nodes: Iterable<NodeType>): Generator<NodeType> {
  for (const node of nodes) {
    yield node;

    if ("child" in node && Array.isArray(node.child)) {
      yield* particleGenerator(node.child);
    }
  }
}
