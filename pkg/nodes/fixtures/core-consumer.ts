import {NodeTree} from "@nodes/core/node-tree"
import {Parameter} from "@nodes/core/parameter"

export function createConsumerTree(): NodeTree {
  return new NodeTree({
    nodes: [{
      id: "node",
      parameters: [new Parameter("value", 1)],
      sockets: [],
    }],
  })
}
