import type { ElkEdgeSection, ElkExtendedEdge, ElkNode } from "elkjs"
import type { AnyStateNode, TransitionDefinition, StateNode } from "xstate"

export type DirectedGraphLabel = {
  text: string
  x: number
  y: number
  width: number
  height: number
}
export type DirectedGraphEdge = {
  id: string
  source: AnyStateNode
  target: AnyStateNode
  label: DirectedGraphLabel
  transition: TransitionDefinition<any, any>
  sections: ElkEdgeSection[]
}
export type DirectedGraphNode = {
  id: string
  stateNode: StateNode
  children: DirectedGraphNode[]
  edges: DirectedGraphEdge[]
}

export type RelativeNodeEdgeMap = [Map<StateNode | undefined, DirectedGraphEdge[]>, Map<string, StateNode | undefined>]

export interface StateElkEdge extends ElkExtendedEdge {
  edge: DirectedGraphEdge
}
export interface StateElkNode extends ElkNode {
  node: DirectedGraphNode
  absolutePosition: Point
  edges: StateElkEdge[]
}
export interface Point {
  x: number
  y: number
}
