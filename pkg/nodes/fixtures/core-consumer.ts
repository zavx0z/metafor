import {NodeTree} from "nodes/node-tree"
import {Parameter} from "nodes/parameter"

export function createConsumerTree(): NodeTree {
  return new NodeTree({
    nodes: [{
      id: "node",
      parameters: [new Parameter("value", 1)],
      sockets: [],
    }],
  })
}
