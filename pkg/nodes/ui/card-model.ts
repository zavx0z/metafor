import type {
  NodeSystemDocument,
  NodeSystemEdge,
  NodeSystemNode,
  NodeSystemPort,
  NodeSystemPortSide,
  PositionedNodeSystem,
  PositionedNodeSystemEdge,
  PositionedNodeSystemNode,
  NodeSystemRenderPlan,
} from "nodes/types"
import {validateNodeSystemDocument} from "nodes/validation"

/** Visual state owned by the Card presentation preset. */
export type NodeSystemCardTone = "neutral" | "live" | "paused" | "warn"

export type NodeSystemCardFact = Readonly<{
  id: string
  label: string
  value: string
  tone?: NodeSystemCardTone
}>

/** Serializable action description. Execution remains owned by the consumer. */
export type NodeSystemCardAction = Readonly<{
  id: string
  label: string
  enabled?: boolean
  tone?: NodeSystemCardTone
}>

/** Adapter-owned link from a semantic socket to one visible Card row. */
export type NodeSystemCardPortAnchor = Readonly<{
  portId: string
  rowId: string
}>

export type NodeSystemCardNodePresentation = Readonly<{
  nodeId: string
  title: string
  kind?: string
  summary?: string
  tone?: NodeSystemCardTone
  /** Minimum requested width; measurement may expand it. */
  width?: number
  /** Minimum requested height; measurement may expand it. */
  height?: number
  facts?: readonly NodeSystemCardFact[]
  actions?: readonly NodeSystemCardAction[]
  portAnchors?: readonly NodeSystemCardPortAnchor[]
}>

export type NodeSystemCardEdgePresentation = Readonly<{
  edgeId: string
  label?: string
  tone?: NodeSystemCardTone
}>

/** UI-owned Card content over one independent semantic topology. */
export type NodeSystemCardPresentation = Readonly<{
  nodes: readonly NodeSystemCardNodePresentation[]
  edges?: readonly NodeSystemCardEdgePresentation[]
}>

/** Materialized Card projection used only inside `@nodes/ui`. */
export type NodeSystemCardPort = NodeSystemPort & Readonly<{rowId: string}>
export type NodeSystemCardNode = Omit<NodeSystemNode, "ports"> & Readonly<{
  title: string
  kind?: string
  summary?: string
  tone?: NodeSystemCardTone
  width?: number
  height?: number
  ports?: readonly NodeSystemCardPort[]
  facts?: readonly NodeSystemCardFact[]
  actions?: readonly NodeSystemCardAction[]
}>
export type NodeSystemCardEdge = NodeSystemEdge & Readonly<{
  label?: string
  tone?: NodeSystemCardTone
}>
export type NodeSystemCardPreset = NodeSystemDocument<NodeSystemCardNode, NodeSystemCardEdge>
export type PositionedNodeSystemCard = PositionedNodeSystem<NodeSystemCardNode, NodeSystemPort, NodeSystemCardEdge>
export type PositionedNodeSystemCardNode = PositionedNodeSystemNode<NodeSystemCardNode, NodeSystemPort>
export type PositionedNodeSystemCardEdge = PositionedNodeSystemEdge<NodeSystemCardEdge>
export type NodeSystemCardRenderPlan = NodeSystemRenderPlan<NodeSystemCardNode, NodeSystemPort, NodeSystemCardEdge>

/**
 * Resolves Card content and anchors without changing or duplicating semantic
 * topology. Missing, duplicate and dangling presentation references fail fast.
 */
export function adaptNodeSystemCardPresentation(
  document: NodeSystemDocument,
  presentation: NodeSystemCardPresentation,
): NodeSystemCardPreset {
  const semantic = validateNodeSystemDocument(document)
  const cards = uniqueById(presentation.nodes, ({nodeId}) => nodeId, "Card node")
  const edgePresentations = uniqueById(presentation.edges ?? [], ({edgeId}) => edgeId, "Card edge")

  for (const nodeId of cards.keys()) {
    if (!semantic.nodes.has(nodeId)) throw new Error(`Unknown Card node: ${nodeId}`)
  }
  for (const edgeId of edgePresentations.keys()) {
    if (!document.edges.some(({id}) => id === edgeId)) throw new Error(`Unknown Card edge: ${edgeId}`)
  }

  const nodes = document.nodes.map((node): NodeSystemCardNode => {
    const card = cards.get(node.id)
    if (card === undefined) throw new Error(`Missing Card node: ${node.id}`)
    if (card.title.trim().length === 0) throw new Error(`Card title must be non-empty: ${node.id}`)
    requirePositiveSize(card.width, `Card width must be positive: ${node.id}`)
    requirePositiveSize(card.height, `Card height must be positive: ${node.id}`)

    const facts = uniqueById(card.facts ?? [], ({id}) => id, `Card fact on ${node.id}`)
    uniqueById(card.actions ?? [], ({id}) => id, `Card action on ${node.id}`)
    const anchors = uniqueById(card.portAnchors ?? [], ({portId}) => portId, `Card port anchor on ${node.id}`)
    const occupiedRowSides = new Set<string>()
    const ports = (node.ports ?? []).map((port): NodeSystemCardPort => {
      const anchor = anchors.get(port.id)
      if (anchor === undefined) throw new Error(`Missing Card port anchor: ${node.id}/${port.id}`)
      if (!facts.has(anchor.rowId)) throw new Error(`Unknown Card port row: ${node.id}/${port.id}/${anchor.rowId}`)
      const side = port.side ?? defaultPortSide(port)
      const rowSide = `${anchor.rowId}\u0000${side}`
      if (occupiedRowSides.has(rowSide)) {
        throw new Error(`Duplicate Card port side on row: ${node.id}/${anchor.rowId}/${side}`)
      }
      occupiedRowSides.add(rowSide)
      return {...port, rowId: anchor.rowId}
    })
    if (anchors.size !== ports.length) throw new Error(`Unknown Card port anchor on node: ${node.id}`)

    const {ports: _semanticPorts, ...semanticNode} = node
    return {
      ...semanticNode,
      title: card.title,
      ...(card.kind === undefined ? {} : {kind: card.kind}),
      ...(card.summary === undefined ? {} : {summary: card.summary}),
      ...(card.tone === undefined ? {} : {tone: card.tone}),
      ...(card.width === undefined ? {} : {width: card.width}),
      ...(card.height === undefined ? {} : {height: card.height}),
      ...(card.facts === undefined ? {} : {facts: card.facts}),
      ...(card.actions === undefined ? {} : {actions: card.actions}),
      ...(node.ports === undefined ? {} : {ports}),
    }
  })

  const edges = document.edges.map((edge): NodeSystemCardEdge => {
    const presentationEdge = edgePresentations.get(edge.id)
    return {
      ...edge,
      ...(presentationEdge?.label === undefined ? {} : {label: presentationEdge.label}),
      ...(presentationEdge?.tone === undefined ? {} : {tone: presentationEdge.tone}),
    }
  })
  return {
    ...(document.revision === undefined ? {} : {revision: document.revision}),
    nodes,
    edges,
  }
}

function defaultPortSide(port: NodeSystemPort): NodeSystemPortSide {
  return port.direction === "in" ? "left" : "right"
}

function uniqueById<T>(
  values: readonly T[],
  getId: (value: T) => string,
  label: string,
): ReadonlyMap<string, T> {
  const result = new Map<string, T>()
  for (const value of values) {
    const id = getId(value)
    if (id.trim().length === 0) throw new Error(`${label} id must be non-empty`)
    if (result.has(id)) throw new Error(`Duplicate ${label.toLowerCase()} id: ${id}`)
    result.set(id, value)
  }
  return result
}

function requirePositiveSize(value: number | undefined, message: string): void {
  if (value !== undefined && (!Number.isFinite(value) || value <= 0)) throw new Error(message)
}
