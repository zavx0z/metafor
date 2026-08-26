/**
Retained presentation boundary between a Graph adapter and `@nodes/ui`.

The controller accepts only an already constructed runtime tree or projection.
It never interprets Graph, invents adapter semantics or owns the supplied tree.

@packageDocumentation
*/

import {
  NodeEditor,
  type NodeCanvasDiagnostics,
} from "@nodes/ui/node-editor"
import {
  createNodeRenderers,
  type FrameView,
  type LinkView,
  type NodePlan,
  type NodeView,
  type SocketView,
} from "@nodes/ui/node"
import {
  type NodeTreeProjection,
  type ProjectionDiagnostics,
  type RuntimeTree,
} from "@nodes/ui/projection"
import {createGraphNodeTreeHierarchicalProjector} from "./hierarchical-node-tree-projector.ts"

export type GraphNodeTreePresentationSource =
  | Readonly<{kind: "tree"; tree: RuntimeTree}>
  | Readonly<{kind: "projection"; projection: NodeTreeProjection}>

export type GraphNodeTreePresentationViewport = Readonly<{
  width: number
  height: number
}>

export type GraphNodeTreePresentationSnapshot = Readonly<{
  source: GraphNodeTreePresentationSource["kind"] | null
  revision: number | null
  topologyRevision: number | null
  frames: number
  nodes: number
  links: number
  frameIds: readonly string[]
  nodeIds: readonly string[]
  linkIds: readonly string[]
  projection: ProjectionDiagnostics | null
  editor: NodeCanvasDiagnostics
  presentations: number
}>

/**
Owns one retained production NodeEditor for a Storybook preview slot.

Tree projection is viewport-specific because `NodeTree.project()` caches by
explicit key. Supplied trees and projections remain caller-owned; disposal only
releases the retained editor and its renderer resources.
*/
export class GraphNodeTreePresentationController {
  readonly surface: NodeEditor<NodeView, SocketView, LinkView, FrameView, NodePlan>
  readonly #projector = createGraphNodeTreeHierarchicalProjector()
  #source: GraphNodeTreePresentationSource | null = null
  #projection: NodeTreeProjection | null = null
  #presentations = 0
  #disposed = false

  constructor() {
    this.surface = new NodeEditor({
      renderers: createNodeRenderers(),
      title: "GRAPH · NODETREE PROJECTION",
      minScale: 0.35,
      maxScale: 2.5,
      messages: {
        empty: "Graph projection не содержит Nodes",
        interactionHint: "Перемещение · масштаб · выбор",
      },
    })
  }

  /**
  Presents one caller-owned source in the exact current preview viewport.

  @param source - Ready runtime tree or ready positioned projection. Graph input
  is intentionally unsupported at this boundary.
  @param viewport - Finite positive preview dimensions in CSS pixels.

  @returns Current retained presentation diagnostics after `setProjection()`.

  @throws If the controller is disposed or viewport dimensions are invalid.
  */
  async present(
    source: GraphNodeTreePresentationSource,
    viewport: GraphNodeTreePresentationViewport,
  ): Promise<GraphNodeTreePresentationSnapshot> {
    this.#assertLive()
    const normalized = normalizeViewport(viewport)
    const projection = source.kind === "projection"
      ? source.projection
      : await source.tree.project(this.#projector, {
          cacheKey: `quantum-graph:${normalized.width}x${normalized.height}`,
          context: {viewport: normalized},
        })
    this.#source = source
    this.#projection = projection
    this.surface.setProjection(projection)
    this.#presentations += 1
    return this.snapshot()
  }

  snapshot(): GraphNodeTreePresentationSnapshot {
    const projection = this.#projection
    return Object.freeze({
      source: this.#source?.kind ?? null,
      revision: projection?.revision ?? null,
      topologyRevision: projection?.topologyRevision ?? null,
      frames: projection?.tree.frames.length ?? 0,
      nodes: projection?.tree.nodes.length ?? 0,
      links: projection?.tree.links.length ?? 0,
      frameIds: Object.freeze(projection?.tree.frames.map(({frame}) => frame.id) ?? []),
      nodeIds: Object.freeze(projection?.tree.nodes.map(({node}) => node.id) ?? []),
      linkIds: Object.freeze(projection?.tree.links.map(({link}) => link.id) ?? []),
      projection: projection?.diagnostics ?? null,
      editor: this.surface.diagnostics,
      presentations: this.#presentations,
    })
  }

  dispose(): void {
    if (this.#disposed) return
    this.#disposed = true
    this.#source = null
    this.#projection = null
    this.surface.dispose()
  }

  #assertLive(): void {
    if (this.#disposed) throw new Error("Graph NodeTree presentation is disposed")
  }
}

function normalizeViewport(
  viewport: GraphNodeTreePresentationViewport,
): GraphNodeTreePresentationViewport {
  if (!Number.isFinite(viewport.width) || viewport.width <= 0 ||
      !Number.isFinite(viewport.height) || viewport.height <= 0) {
    throw new Error("Graph NodeTree presentation viewport must be finite and positive")
  }
  return Object.freeze({
    width: Math.max(1, Math.round(viewport.width)),
    height: Math.max(1, Math.round(viewport.height)),
  })
}
