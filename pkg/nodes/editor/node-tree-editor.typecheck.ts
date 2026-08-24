import {NodeTree} from "@nodes/core/node-tree"
import {Parameter} from "@nodes/core/parameter"
import {NodeTreeEditor} from "./node-tree-editor.ts"

type Presentation = Readonly<{label: string; geometrySensitive: boolean}>
type FrameMetadata = Readonly<{label: string}>
type NodeMetadata = Readonly<{title: string}>
type SocketMetadata = Readonly<{socketType: "float" | "integer"}>
type LinkMetadata = Readonly<{weight: number}>

const tree = new NodeTree<
  Parameter<number, Presentation>,
  FrameMetadata,
  NodeMetadata,
  SocketMetadata,
  LinkMetadata
>({
  frames: [{id: "frame", metadata: {label: "Frame"}}],
  nodes: [{
    id: "node",
    frameId: "frame",
    parameters: [new Parameter("value", 1, {label: "Value", geometrySensitive: false})],
    sockets: [{id: "out", direction: "output", metadata: {socketType: "float"}}],
    metadata: {title: "Node"},
  }],
})

const editor = new NodeTreeEditor(tree, {
  parameterAffectsLayout(context) {
    const value: number = context.value
    const geometrySensitive: boolean = context.presentation.geometrySensitive
    return value > 0 && geometrySensitive
  },
})

if (false) {
  editor.addParameter({
    expectedRevision: 0,
    nodeId: "node",
    parameter: {
      id: "valid",
      value: 2,
      presentation: {label: "Valid", geometrySensitive: true},
    },
  })
  editor.addNode({
    expectedRevision: 0,
    node: {
      id: "valid-node",
      metadata: {title: "Valid"},
      sockets: [{id: "input", direction: "input", metadata: {socketType: "integer"}}],
    },
  })
  editor.connect({
    expectedRevision: 0,
    link: {
      id: "valid-link",
      from: {nodeId: "node", socketId: "out"},
      to: {nodeId: "valid-node", socketId: "input"},
      metadata: {weight: 1},
    },
  })

  // @ts-expect-error specialized Parameter values remain numeric
  editor.setParameterValue({expectedRevision: 0, nodeId: "node", parameterId: "value", value: "wrong"})
  editor.addParameter({
    expectedRevision: 0,
    nodeId: "node",
    // @ts-expect-error specialized Parameter presentation is required and exact
    parameter: {id: "wrong-presentation", value: 1, presentation: {label: "Wrong"}},
  })
  editor.addNode({
    expectedRevision: 0,
    node: {
      id: "wrong-node",
      // @ts-expect-error Node metadata belongs to the specialized tree
      metadata: {label: "Wrong"},
    },
  })
  editor.addNode({
    expectedRevision: 0,
    node: {
      id: "wrong-socket",
      // @ts-expect-error Socket metadata belongs to the specialized tree
      sockets: [{id: "socket", direction: "input", metadata: {socketType: "string"}}],
    },
  })
  editor.connect({
    expectedRevision: 0,
    link: {
      id: "wrong-link",
      from: {nodeId: "node", socketId: "out"},
      to: {nodeId: "node", socketId: "out"},
      // @ts-expect-error Link metadata belongs to the specialized tree
      metadata: {weight: "heavy"},
    },
  })
}

void editor
