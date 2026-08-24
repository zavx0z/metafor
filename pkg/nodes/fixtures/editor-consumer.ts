import {NodeTree} from "@nodes/core/node-tree"
import {Parameter} from "@nodes/core/parameter"
import {NodeTreeEditor} from "@nodes/editor/node-tree-editor"

export const editor = new NodeTreeEditor(new NodeTree({
  nodes: [{id: "node", parameters: [new Parameter<number>("value", 1)]}],
}))

export function addParameter(): void {
  editor.addParameter({
    expectedRevision: editor.tree.revision,
    nodeId: "node",
    parameter: {id: "extra", value: 0, presentation: null},
  })
}
