import {
  NodeTree,
  type NodeTreeChange,
  type NodeTreeDocument,
  type NodeTreeSnapshot,
} from "@nodes/core/node-tree"
import {Parameter, type NodeJsonValue} from "@nodes/core/parameter"

export type CorePlaygroundParameter = Parameter<NodeJsonValue, Readonly<{label: string}>>
export type CorePlaygroundTree = NodeTree<CorePlaygroundParameter>

export type CoreRuntimeScenario = Readonly<{
  tree: CorePlaygroundTree
  changes: readonly NodeTreeChange[]
  setGain(value: number): boolean
  addParameter(): boolean
  removeParameter(): boolean
  snapshot(): NodeTreeSnapshot<CorePlaygroundParameter>
  document(): NodeTreeDocument<CorePlaygroundParameter>
}>

export function createCoreRuntimeScenario(): CoreRuntimeScenario {
  const gain = parameter("gain", "Gain", 1)
  const output = parameter("value", "Value", 0.5)
  const tree = new NodeTree<CorePlaygroundParameter>({
    nodes: [{
      id: "source",
      parameters: [gain, output],
      sockets: [{id: "value-out", direction: "output", parameterId: "value"}],
      metadata: {title: "Source"},
    }],
  })
  const changes: NodeTreeChange[] = []
  tree.subscribe((change) => { changes.push(change) })

  return Object.freeze({
    tree,
    changes,
    setGain(value) {
      return gain.set(value)
    },
    addParameter() {
      if (tree.nodes[0]?.parameters?.some(({id}) => id === "extra")) return false
      const definition = tree.definition()
      const extra = parameter("extra", "Extra", 0)
      return tree.reconcile({
        expectedRevision: tree.revision,
        definition: {
          ...definition,
          nodes: definition.nodes.map((node) => node.id === "source"
            ? {...node, parameters: [...(node.parameters ?? []), extra]}
            : node),
        },
      }).changed
    },
    removeParameter() {
      if (!tree.nodes[0]?.parameters?.some(({id}) => id === "extra")) return false
      const definition = tree.definition()
      return tree.reconcile({
        expectedRevision: tree.revision,
        definition: {
          ...definition,
          nodes: definition.nodes.map((node) => node.id === "source"
            ? {...node, parameters: (node.parameters ?? []).filter(({id}) => id !== "extra")}
            : node),
        },
      }).changed
    },
    snapshot: () => tree.snapshot(),
    document: () => tree.document(),
  })
}

function parameter(id: string, label: string, value: number): CorePlaygroundParameter {
  return new Parameter<NodeJsonValue, Readonly<{label: string}>>(id, value, {label})
}
