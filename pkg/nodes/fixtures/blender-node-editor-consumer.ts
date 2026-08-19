import {
  NodeEditor,
  type PositionedNodeTree,
} from "@nodes/ui/node-editor"
import {
  createBlenderNodeRenderers,
  positionBlenderNode,
  type BlenderFrame,
  type BlenderLink,
  type BlenderNode,
  type BlenderNodePlan,
  type BlenderSocket,
} from "@nodes/ui/blender-node"

const source: BlenderNode = {
  id: "source",
  title: "Value",
  sockets: [{
    id: "value",
    direction: "output",
    label: "Value",
    socketType: "float",
  }],
}

const target: BlenderNode = {
  id: "target",
  title: "Math",
  properties: [{
    id: "operation",
    kind: "enum",
    label: "Operation",
    value: "multiply",
    options: [
      {value: "add", label: "Add"},
      {value: "multiply", label: "Multiply"},
    ],
    onChange: () => {},
  }],
  parameters: [{
    id: "value",
    label: "Value",
    field: {
      id: "value",
      kind: "number",
      label: "Value",
      value: 1,
      onChange: () => {},
    },
  }],
  sockets: [{
    id: "value",
    direction: "input",
    label: "Value",
    socketType: "float",
    parameterId: "value",
    side: "left",
  }],
}

const sourceEntry = positionBlenderNode(source, {x: 40, y: 40, w: 190, h: 96})
const targetEntry = positionBlenderNode(target, {x: 330, y: 40, w: 190, h: 150})
const from = sourceEntry.sockets[0]!.center
const to = targetEntry.sockets[0]!.center

export const tree: PositionedNodeTree<BlenderNode, BlenderSocket, BlenderLink, BlenderFrame> = {
  bounds: {x: 0, y: 0, w: 560, h: 230},
  frames: [],
  nodes: [sourceEntry, targetEntry],
  links: [{
    link: {
      id: "value-link",
      from: {nodeId: "source", socketId: "value"},
      to: {nodeId: "target", socketId: "value"},
      socketType: "float",
    },
    points: [from, {x: 280, y: from.y}, {x: 280, y: to.y}, to],
  }],
}

export const editor = new NodeEditor<BlenderNode, BlenderSocket, BlenderLink, BlenderFrame, BlenderNodePlan>({
  renderers: createBlenderNodeRenderers(),
})

editor.setTree(tree)
