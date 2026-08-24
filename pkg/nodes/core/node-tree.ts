import {
  ownNodeJsonValue,
  type NodeJsonValue,
  type ParameterReference,
  type ParameterSnapshot,
} from "./parameter.ts"
import type {
  NodeTreeProjectionRequest,
  NodeTreeProjector,
  PriorNodeTreeProjection,
} from "./projection-types.ts"

export type Frame<TMetadata extends NodeJsonValue = NodeJsonValue> = Readonly<{
  id: string
  parentFrameId?: string
  metadata?: TMetadata
}>

export type SocketDirection = "input" | "output" | "bidirectional"
export type SocketSide = "left" | "right"

export type Socket<TMetadata extends NodeJsonValue = NodeJsonValue> = Readonly<{
  id: string
  direction: SocketDirection
  parameterId?: string
  side?: SocketSide
  metadata?: TMetadata
}>

export type Node<
  TParameter extends ParameterReference = ParameterReference,
  TNodeMetadata extends NodeJsonValue = NodeJsonValue,
  TSocketMetadata extends NodeJsonValue = NodeJsonValue,
> = Readonly<{
  id: string
  frameId?: string
  parameters?: readonly TParameter[]
  sockets?: readonly Socket<TSocketMetadata>[]
  metadata?: TNodeMetadata
}>

export type SocketEndpoint = Readonly<{
  nodeId: string
  socketId: string
}>

export type Link<TMetadata extends NodeJsonValue = NodeJsonValue> = Readonly<{
  id: string
  from: SocketEndpoint
  to: SocketEndpoint
  metadata?: TMetadata
}>

export type NodeTreeDefinition<
  TParameter extends ParameterReference = ParameterReference,
  TFrameMetadata extends NodeJsonValue = NodeJsonValue,
  TNodeMetadata extends NodeJsonValue = NodeJsonValue,
  TSocketMetadata extends NodeJsonValue = NodeJsonValue,
  TLinkMetadata extends NodeJsonValue = NodeJsonValue,
> = Readonly<{
  frames?: readonly Frame<TFrameMetadata>[]
  nodes: readonly Node<TParameter, TNodeMetadata, TSocketMetadata>[]
  links?: readonly Link<TLinkMetadata>[]
}>

export type NodeTreeParameterSnapshot<TParameter extends ParameterReference> =
  TParameter extends ParameterReference<infer TValue, infer TPresentation>
    ? ParameterSnapshot<TValue, TPresentation>
    : ParameterSnapshot

export type NodeTreeNodeSnapshot<
  TParameter extends ParameterReference,
  TNodeMetadata extends NodeJsonValue,
  TSocketMetadata extends NodeJsonValue,
> = Readonly<{
  id: string
  frameId?: string
  parameters: readonly NodeTreeParameterSnapshot<TParameter>[]
  sockets: readonly Socket<TSocketMetadata>[]
  metadata?: TNodeMetadata
}>

export type NodeTreeSnapshot<
  TParameter extends ParameterReference = ParameterReference,
  TFrameMetadata extends NodeJsonValue = NodeJsonValue,
  TNodeMetadata extends NodeJsonValue = NodeJsonValue,
  TSocketMetadata extends NodeJsonValue = NodeJsonValue,
  TLinkMetadata extends NodeJsonValue = NodeJsonValue,
> = Readonly<{
  revision: number
  topologyRevision: number
  frames: readonly Frame<TFrameMetadata>[]
  nodes: readonly NodeTreeNodeSnapshot<TParameter, TNodeMetadata, TSocketMetadata>[]
  links: readonly Link<TLinkMetadata>[]
}>

export type NodeTreeChange = Readonly<{
  kind: "parameter"
  revision: number
  topologyRevision: number
  nodeId: string
  parameterId: string
  parameterRevision: number
}>

type CompletedProjection = Readonly<{
  revision: number
  topologyRevision: number
  projection: unknown
}>

type ProjectionCacheEntry = {
  completed?: CompletedProjection
  pending: Map<string, Promise<unknown>>
}

/** Projection finished after the live tree moved to a newer revision. */
export class StaleNodeTreeProjectionError extends Error {
  constructor(
    readonly sourceRevision: number,
    readonly currentRevision: number,
  ) {
    super(`Stale NodeTree projection: ${sourceRevision} < ${currentRevision}`)
    this.name = "StaleNodeTreeProjectionError"
  }
}

/**
 * Live owner of immutable Node topology and observable Parameter values.
 * Concrete UI measurement and layout remain injected through `project()`.
 */
export class NodeTree<
  TParameter extends ParameterReference = ParameterReference,
  TFrameMetadata extends NodeJsonValue = NodeJsonValue,
  TNodeMetadata extends NodeJsonValue = NodeJsonValue,
  TSocketMetadata extends NodeJsonValue = NodeJsonValue,
  TLinkMetadata extends NodeJsonValue = NodeJsonValue,
> {
  readonly #frames: readonly Frame<TFrameMetadata>[]
  readonly #nodes: readonly Node<TParameter, TNodeMetadata, TSocketMetadata>[]
  readonly #links: readonly Link<TLinkMetadata>[]
  readonly #parameters = new Map<string, TParameter>()
  readonly #listeners = new Set<(change: NodeTreeChange) => void>()
  readonly #parameterUnsubscribers: (() => void)[] = []
  #projectionCache = new WeakMap<object, Map<string, ProjectionCacheEntry>>()
  #revision = 0
  #topologyRevision = 0

  constructor(
    definition: NodeTreeDefinition<
      TParameter,
      TFrameMetadata,
      TNodeMetadata,
      TSocketMetadata,
      TLinkMetadata
    >,
  ) {
    const owned = ownAndValidateDefinition(definition)
    this.#frames = owned.frames
    this.#nodes = owned.nodes
    this.#links = owned.links

    for (const node of this.#nodes) {
      for (const parameter of node.parameters ?? []) {
        const key = parameterKey(node.id, parameter.id)
        this.#parameters.set(key, parameter)
        this.#parameterUnsubscribers.push(parameter.subscribe(() => {
          this.#revision += 1
          const change: NodeTreeChange = Object.freeze({
            kind: "parameter",
            revision: this.#revision,
            topologyRevision: this.#topologyRevision,
            nodeId: node.id,
            parameterId: parameter.id,
            parameterRevision: parameter.revision,
          })
          for (const listener of [...this.#listeners]) listener(change)
        }))
      }
    }
  }

  get revision(): number {
    return this.#revision
  }

  get topologyRevision(): number {
    return this.#topologyRevision
  }

  get frames(): readonly Frame<TFrameMetadata>[] {
    return this.#frames
  }

  get nodes(): readonly Node<TParameter, TNodeMetadata, TSocketMetadata>[] {
    return this.#nodes
  }

  get links(): readonly Link<TLinkMetadata>[] {
    return this.#links
  }

  parameter(nodeId: string, parameterId: string): TParameter {
    const parameter = this.#parameters.get(parameterKey(nodeId, parameterId))
    if (parameter === undefined) throw new Error(`Unknown Parameter: ${nodeId}/${parameterId}`)
    return parameter
  }

  subscribe(listener: (change: NodeTreeChange) => void): () => void {
    this.#listeners.add(listener)
    let subscribed = true
    return () => {
      if (!subscribed) return
      subscribed = false
      this.#listeners.delete(listener)
    }
  }

  snapshot(): NodeTreeSnapshot<
    TParameter,
    TFrameMetadata,
    TNodeMetadata,
    TSocketMetadata,
    TLinkMetadata
  > {
    return Object.freeze({
      revision: this.#revision,
      topologyRevision: this.#topologyRevision,
      frames: this.#frames,
      nodes: Object.freeze(this.#nodes.map((node) => Object.freeze({
        id: node.id,
        ...(node.frameId === undefined ? {} : {frameId: node.frameId}),
        parameters: Object.freeze((node.parameters ?? []).map((parameter) => parameter.snapshot())) as readonly NodeTreeParameterSnapshot<TParameter>[],
        sockets: node.sockets ?? Object.freeze([]),
        ...(node.metadata === undefined ? {} : {metadata: node.metadata}),
      }))),
      links: this.#links,
    })
  }

  toJSON(): NodeTreeSnapshot<
    TParameter,
    TFrameMetadata,
    TNodeMetadata,
    TSocketMetadata,
    TLinkMetadata
  > {
    return this.snapshot()
  }

  project<TContext, TProjection>(
    projector: NodeTreeProjector<
      this,
      NodeTreeSnapshot<TParameter, TFrameMetadata, TNodeMetadata, TSocketMetadata, TLinkMetadata>,
      TContext,
      TProjection
    >,
    request: NodeTreeProjectionRequest<TContext>,
  ): Promise<TProjection> {
    if (typeof projector !== "object" || projector === null || typeof projector.project !== "function") {
      return Promise.reject(new TypeError("NodeTree projector must provide project()"))
    }
    if (request.cacheKey.trim().length === 0) {
      return Promise.reject(new Error("NodeTree projection cacheKey must be non-empty"))
    }

    let contexts = this.#projectionCache.get(projector)
    if (contexts === undefined) {
      contexts = new Map()
      this.#projectionCache.set(projector, contexts)
    }
    let cache = contexts.get(request.cacheKey)
    if (cache === undefined) {
      cache = {pending: new Map()}
      contexts.set(request.cacheKey, cache)
    }
    if (cache.completed?.revision === this.#revision &&
      cache.completed.topologyRevision === this.#topologyRevision) {
      return Promise.resolve(cache.completed.projection as TProjection)
    }

    const sourceRevision = this.#revision
    const sourceTopologyRevision = this.#topologyRevision
    const generationKey = `${sourceTopologyRevision}:${sourceRevision}`
    const pending = cache.pending.get(generationKey)
    if (pending !== undefined) return pending as Promise<TProjection>

    const previous = cache.completed === undefined ? undefined : Object.freeze({
      revision: cache.completed.revision,
      topologyRevision: cache.completed.topologyRevision,
      projection: cache.completed.projection as TProjection,
    }) satisfies PriorNodeTreeProjection<TProjection>
    const snapshot = this.snapshot()
    const promise = Promise.resolve().then(() => projector.project({
      tree: this,
      snapshot,
      context: request.context,
      ...(previous === undefined ? {} : {previous}),
    })).then((projection) => {
      cache!.pending.delete(generationKey)
      if (this.#revision !== sourceRevision || this.#topologyRevision !== sourceTopologyRevision) {
        throw new StaleNodeTreeProjectionError(sourceRevision, this.#revision)
      }
      const completed = cache!.completed
      if (completed === undefined || isLaterProjection(
        sourceRevision,
        sourceTopologyRevision,
        completed.revision,
        completed.topologyRevision,
      )) {
        cache!.completed = Object.freeze({
          revision: sourceRevision,
          topologyRevision: sourceTopologyRevision,
          projection,
        })
      }
      return projection
    }, (error: unknown) => {
      cache!.pending.delete(generationKey)
      throw error
    })
    cache.pending.set(generationKey, promise)
    return promise
  }

  clearProjectionCache(): void {
    this.#projectionCache = new WeakMap()
  }

  dispose(): void {
    for (const unsubscribe of this.#parameterUnsubscribers.splice(0)) unsubscribe()
    this.#listeners.clear()
    this.clearProjectionCache()
  }
}

function ownAndValidateDefinition<
  TParameter extends ParameterReference,
  TFrameMetadata extends NodeJsonValue,
  TNodeMetadata extends NodeJsonValue,
  TSocketMetadata extends NodeJsonValue,
  TLinkMetadata extends NodeJsonValue,
>(
  definition: NodeTreeDefinition<TParameter, TFrameMetadata, TNodeMetadata, TSocketMetadata, TLinkMetadata>,
): Readonly<{
  frames: readonly Frame<TFrameMetadata>[]
  nodes: readonly Node<TParameter, TNodeMetadata, TSocketMetadata>[]
  links: readonly Link<TLinkMetadata>[]
}> {
  const frameIds = new Set<string>()
  const frames = Object.freeze((definition.frames ?? []).map((frame): Frame<TFrameMetadata> => {
    requireIdentifier(frame.id, "Frame")
    if (frameIds.has(frame.id)) throw new Error(`Duplicate Frame id: ${frame.id}`)
    frameIds.add(frame.id)
    return Object.freeze({
      id: frame.id,
      ...(frame.parentFrameId === undefined ? {} : {parentFrameId: frame.parentFrameId}),
      ...(frame.metadata === undefined ? {} : {
        metadata: ownNodeJsonValue(frame.metadata, `Frame metadata: ${frame.id}`),
      }),
    })
  }))
  const frameById = new Map(frames.map((frame) => [frame.id, frame]))
  for (const frame of frames) {
    if (frame.parentFrameId === undefined) continue
    requireIdentifier(frame.parentFrameId, `Parent Frame on ${frame.id}`)
    if (!frameById.has(frame.parentFrameId)) {
      throw new Error(`Unknown parent Frame: ${frame.id}/${frame.parentFrameId}`)
    }
  }
  for (const frame of frames) validateFrameAncestry(frame, frameById)

  const nodeIds = new Set<string>()
  const socketIdsByNode = new Map<string, ReadonlySet<string>>()
  const ownedParameters = new Set<ParameterReference>()
  const nodes = Object.freeze(definition.nodes.map((node): Node<TParameter, TNodeMetadata, TSocketMetadata> => {
    requireIdentifier(node.id, "Node")
    if (nodeIds.has(node.id)) throw new Error(`Duplicate Node id: ${node.id}`)
    if (frameIds.has(node.id)) throw new Error(`Frame and Node ids must be distinct: ${node.id}`)
    nodeIds.add(node.id)
    if (node.frameId !== undefined && !frameIds.has(node.frameId)) {
      throw new Error(`Unknown Node Frame: ${node.id}/${node.frameId}`)
    }

    const parameterIds = new Set<string>()
    const parameters = Object.freeze((node.parameters ?? []).map((parameter) => {
      requireParameterReference(parameter, node.id)
      if (parameterIds.has(parameter.id)) throw new Error(`Duplicate Parameter id: ${node.id}/${parameter.id}`)
      if (ownedParameters.has(parameter)) throw new Error(`Parameter is shared by multiple Nodes: ${parameter.id}`)
      parameterIds.add(parameter.id)
      ownedParameters.add(parameter)
      return parameter
    }))

    const socketIds = new Set<string>()
    const explicitParameterSides = new Set<string>()
    const sockets = Object.freeze((node.sockets ?? []).map((socket): Socket<TSocketMetadata> => {
      requireIdentifier(socket.id, `Socket on ${node.id}`)
      if (socketIds.has(socket.id)) throw new Error(`Duplicate Socket id: ${node.id}/${socket.id}`)
      socketIds.add(socket.id)
      if (socket.direction !== "input" && socket.direction !== "output" && socket.direction !== "bidirectional") {
        throw new Error(`Invalid Socket direction: ${node.id}/${socket.id}`)
      }
      if (socket.side !== undefined && socket.side !== "left" && socket.side !== "right") {
        throw new Error(`Invalid Socket side: ${node.id}/${socket.id}`)
      }
      if (socket.parameterId !== undefined) {
        if (!parameterIds.has(socket.parameterId)) {
          throw new Error(`Unknown Socket Parameter: ${node.id}/${socket.id}/${socket.parameterId}`)
        }
        if (socket.side !== undefined) {
          const sideKey = `${socket.parameterId}:${socket.side}`
          if (explicitParameterSides.has(sideKey)) {
            throw new Error(`Duplicate Parameter Socket side: ${node.id}/${sideKey}`)
          }
          explicitParameterSides.add(sideKey)
        }
      }
      return Object.freeze({
        id: socket.id,
        direction: socket.direction,
        ...(socket.parameterId === undefined ? {} : {parameterId: socket.parameterId}),
        ...(socket.side === undefined ? {} : {side: socket.side}),
        ...(socket.metadata === undefined ? {} : {
          metadata: ownNodeJsonValue(socket.metadata, `Socket metadata: ${node.id}/${socket.id}`),
        }),
      })
    }))
    socketIdsByNode.set(node.id, socketIds)
    return Object.freeze({
      id: node.id,
      ...(node.frameId === undefined ? {} : {frameId: node.frameId}),
      parameters,
      sockets,
      ...(node.metadata === undefined ? {} : {
        metadata: ownNodeJsonValue(node.metadata, `Node metadata: ${node.id}`),
      }),
    })
  }))

  const linkIds = new Set<string>()
  const links = Object.freeze((definition.links ?? []).map((link): Link<TLinkMetadata> => {
    requireIdentifier(link.id, "Link")
    if (linkIds.has(link.id)) throw new Error(`Duplicate Link id: ${link.id}`)
    linkIds.add(link.id)
    validateEndpoint(link.from, "from", link.id, nodeIds, socketIdsByNode)
    validateEndpoint(link.to, "to", link.id, nodeIds, socketIdsByNode)
    return Object.freeze({
      id: link.id,
      from: Object.freeze({...link.from}),
      to: Object.freeze({...link.to}),
      ...(link.metadata === undefined ? {} : {
        metadata: ownNodeJsonValue(link.metadata, `Link metadata: ${link.id}`),
      }),
    })
  }))
  return Object.freeze({frames, nodes, links})
}

function validateFrameAncestry<TMetadata extends NodeJsonValue>(
  frame: Frame<TMetadata>,
  frameById: ReadonlyMap<string, Frame<TMetadata>>,
): void {
  const seen = new Set<string>([frame.id])
  let parentFrameId = frame.parentFrameId
  while (parentFrameId !== undefined) {
    if (seen.has(parentFrameId)) throw new Error(`Cyclic Frame ancestry: ${frame.id}`)
    seen.add(parentFrameId)
    parentFrameId = frameById.get(parentFrameId)?.parentFrameId
  }
}

function validateEndpoint(
  endpoint: SocketEndpoint,
  role: "from" | "to",
  linkId: string,
  nodeIds: ReadonlySet<string>,
  socketIdsByNode: ReadonlyMap<string, ReadonlySet<string>>,
): void {
  requireIdentifier(endpoint.nodeId, `${role} Node on Link ${linkId}`)
  requireIdentifier(endpoint.socketId, `${role} Socket on Link ${linkId}`)
  if (!nodeIds.has(endpoint.nodeId)) throw new Error(`Unknown Link Node: ${linkId}/${endpoint.nodeId}`)
  if (!socketIdsByNode.get(endpoint.nodeId)?.has(endpoint.socketId)) {
    throw new Error(`Unknown Link Socket: ${linkId}/${endpoint.nodeId}/${endpoint.socketId}`)
  }
}

function requireParameterReference(value: ParameterReference, nodeId: string): void {
  if (typeof value !== "object" || value === null || typeof value.subscribe !== "function" ||
    typeof value.snapshot !== "function") {
    throw new TypeError(`Invalid Parameter on Node: ${nodeId}`)
  }
  requireIdentifier(value.id, `Parameter on ${nodeId}`)
}

function requireIdentifier(value: string, label: string): void {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${label} id must be non-empty`)
}

function parameterKey(nodeId: string, parameterId: string): string {
  return `${nodeId}\u0000${parameterId}`
}

function isLaterProjection(
  revision: number,
  topologyRevision: number,
  previousRevision: number,
  previousTopologyRevision: number,
): boolean {
  return topologyRevision > previousTopologyRevision ||
    (topologyRevision === previousTopologyRevision && revision >= previousRevision)
}
