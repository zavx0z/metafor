<script lang="ts">
  import type { SimulatorActorType } from "$lib/simulator"
  import type { DirectedGraphEdge, DirectedGraphNode } from "$lib/types"
  import { flatten, getChildren } from "$lib/utils"
  import { onMount } from "svelte"
  import { StateMachine, type AnyStateMachine, type AnyStateNode } from "xstate"

  export let actor: SimulatorActorType
  const machine = actor.getSnapshot().context.machine.root

  export let edges: { [key: string]: DirectedGraphEdge } = {}
  export let nodes: { [key: string]: AnyStateNode } = {}
  export let digraph

  onMount(async () => {
    function toDirectedGraph(stateMachine: AnyStateNode | AnyStateMachine): DirectedGraphNode {
      const stateNode = stateMachine instanceof StateMachine ? stateMachine.root : stateMachine
      const egs: DirectedGraphEdge[] = flatten(
        [...stateNode.transitions.values(), stateNode.always ? stateNode.always : []]
          .flat()
          .map((t, transitionIndex) => {
            const targets = t.target ? t.target : [stateNode]
            return targets.map((target, targetIndex) => {
              const edge: DirectedGraphEdge = {
                id: `${stateNode.id}:${transitionIndex}:${targetIndex}`,
                source: stateNode as AnyStateNode,
                target: target as AnyStateNode,
                transition: t,
                sections: [],
                label: { text: t.eventType, x: 0, y: 0, width: 0, height: 0 },
              }
              edges[edge.id] = edge
              return edge
            })
          })
      )
      const graph: DirectedGraphNode = {
        id: stateNode.id,
        stateNode: stateNode as AnyStateNode,
        children: getChildren(stateNode as AnyStateNode).map(toDirectedGraph),
        edges: egs,
      }
      nodes[graph.id] = graph.stateNode
      return graph
    }
    digraph = toDirectedGraph(machine)
    // console.log(digraph, nodes, edges)
  })
</script>

<slot />
