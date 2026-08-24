import {
  equalNodeJsonValue,
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

export type Ordered<T> = Readonly<{
  order: readonly string[]
  byId: Readonly<Record<string, T>>
}>

export type NodeTreeFrameDocument<
  TMetadata extends NodeJsonValue = NodeJsonValue,
> = Readonly<{
  parentFrameId?: string
  metadata?: TMetadata
}>

export type NodeTreeParameterDocument<TParameter extends ParameterReference> =
  TParameter extends ParameterReference<infer TValue, infer TPresentation>
    ? Readonly<{
        value: TValue
        presentation: TPresentation
      }>
    : Readonly<{
        value: NodeJsonValue
        presentation: NodeJsonValue
      }>

export type NodeTreeSocketDocument<
  TMetadata extends NodeJsonValue = NodeJsonValue,
> = Readonly<{
  direction: SocketDirection
  parameterId?: string
  side?: SocketSide
  metadata?: TMetadata
}>

export type NodeTreeNodeDocument<
  TParameter extends ParameterReference = ParameterReference,
  TNodeMetadata extends NodeJsonValue = NodeJsonValue,
  TSocketMetadata extends NodeJsonValue = NodeJsonValue,
> = Readonly<{
  frameId?: string
  parameters: Ordered<NodeTreeParameterDocument<TParameter>>
  sockets: Ordered<NodeTreeSocketDocument<TSocketMetadata>>
  metadata?: TNodeMetadata
}>

export type NodeTreeLinkDocument<
  TMetadata extends NodeJsonValue = NodeJsonValue,
> = Readonly<{
  from: SocketEndpoint
  to: SocketEndpoint
  metadata?: TMetadata
}>

export type NodeTreeDocument<
  TParameter extends ParameterReference = ParameterReference,
  TFrameMetadata extends NodeJsonValue = NodeJsonValue,
  TNodeMetadata extends NodeJsonValue = NodeJsonValue,
  TSocketMetadata extends NodeJsonValue = NodeJsonValue,
  TLinkMetadata extends NodeJsonValue = NodeJsonValue,
> = Readonly<{
  formatVersion: 1
  frames: Ordered<NodeTreeFrameDocument<TFrameMetadata>>
  nodes: Ordered<NodeTreeNodeDocument<TParameter, TNodeMetadata, TSocketMetadata>>
  links: Ordered<NodeTreeLinkDocument<TLinkMetadata>>
}>

export type NodeTreeGenerationParameter<TParameter extends ParameterReference> =
  TParameter extends ParameterReference<infer TValue, infer TPresentation>
    ? Readonly<{
        id: string
        revision: number
        value: TValue
        presentation: TPresentation
        store: TParameter
      }>
    : Readonly<{
        id: string
        revision: number
        value: NodeJsonValue
        presentation: NodeJsonValue
        store: TParameter
      }>

export type NodeTreeGenerationNode<
  TParameter extends ParameterReference = ParameterReference,
  TNodeMetadata extends NodeJsonValue = NodeJsonValue,
  TSocketMetadata extends NodeJsonValue = NodeJsonValue,
> = Readonly<{
  id: string
  frameId?: string
  parameters: readonly NodeTreeGenerationParameter<TParameter>[]
  sockets: readonly Socket<TSocketMetadata>[]
  metadata?: TNodeMetadata
}>

export type NodeTreeGenerationView<
  TParameter extends ParameterReference = ParameterReference,
  TFrameMetadata extends NodeJsonValue = NodeJsonValue,
  TNodeMetadata extends NodeJsonValue = NodeJsonValue,
  TSocketMetadata extends NodeJsonValue = NodeJsonValue,
  TLinkMetadata extends NodeJsonValue = NodeJsonValue,
> = Readonly<{
  revision: number
  topologyRevision: number
  frames: readonly Frame<TFrameMetadata>[]
  nodes: readonly NodeTreeGenerationNode<TParameter, TNodeMetadata, TSocketMetadata>[]
  links: readonly Link<TLinkMetadata>[]
  parameter(nodeId: string, parameterId: string): NodeTreeGenerationParameter<TParameter>
}>

export type NodeTreeParameterChange = Readonly<{
  kind: "parameter"
  revision: number
  topologyRevision: number
  nodeId: string
  parameterId: string
  parameterRevision: number
}>

export type NodeTreeTopologyChange = Readonly<{
  kind: "topology"
  revision: number
  topologyRevision: number
}>

export type NodeTreeChange = NodeTreeParameterChange | NodeTreeTopologyChange

export type NodeTreeReconcileRequest<
  TParameter extends ParameterReference = ParameterReference,
  TFrameMetadata extends NodeJsonValue = NodeJsonValue,
  TNodeMetadata extends NodeJsonValue = NodeJsonValue,
  TSocketMetadata extends NodeJsonValue = NodeJsonValue,
  TLinkMetadata extends NodeJsonValue = NodeJsonValue,
> = Readonly<{
  expectedRevision: number
  definition: NodeTreeDefinition<
    TParameter,
    TFrameMetadata,
    TNodeMetadata,
    TSocketMetadata,
    TLinkMetadata
  >
}>

export type NodeTreeReconcileResult = Readonly<{
  changed: boolean
  revision: number
  topologyRevision: number
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

/** A structural authoring request was based on an older live tree revision. */
export class NodeTreeRevisionConflictError extends Error {
  constructor(
    readonly expectedRevision: number,
    readonly currentRevision: number,
  ) {
    super(`NodeTree revision conflict: expected ${expectedRevision}, current ${currentRevision}`)
    this.name = "NodeTreeRevisionConflictError"
  }
}

type ParameterSubscription<TParameter extends ParameterReference> = Readonly<{
  key: string
  parameter: TParameter
  unsubscribe: () => void
}>

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
  #frames: readonly Frame<TFrameMetadata>[]
  #nodes: readonly Node<TParameter, TNodeMetadata, TSocketMetadata>[]
  #links: readonly Link<TLinkMetadata>[]
  #parameters: Map<string, TParameter>
  #parameterSubscriptions: Map<string, ParameterSubscription<TParameter>>
  readonly #orphanedParameterSubscriptions = new Set<ParameterSubscription<TParameter>>()
  readonly #listeners = new Set<(change: NodeTreeChange) => void>()
  readonly #changeQueue: NodeTreeChange[] = []
  #deliveringChanges = false
  #projectionCache = new WeakMap<object, Map<string, ProjectionCacheEntry>>()
  #revision = 0
  #topologyRevision = 0
  #disposed = false

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
    this.#parameters = indexParameters(owned.nodes)
    this.#parameterSubscriptions = this.#prepareParameterSubscriptions(this.#parameters)
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

  /** Current immutable topology with its exact live Parameter stores. */
  definition(): NodeTreeDefinition<
    TParameter,
    TFrameMetadata,
    TNodeMetadata,
    TSocketMetadata,
    TLinkMetadata
  > {
    return Object.freeze({
      frames: this.#frames,
      nodes: this.#nodes,
      links: this.#links,
    })
  }

  /** Stable ID-addressed JSON authoring view without runtime methods or revisions. */
  document(): NodeTreeDocument<
    TParameter,
    TFrameMetadata,
    TNodeMetadata,
    TSocketMetadata,
    TLinkMetadata
  > {
    return documentFromDefinition(this.definition())
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

  reconcile(
    request: NodeTreeReconcileRequest<
      TParameter,
      TFrameMetadata,
      TNodeMetadata,
      TSocketMetadata,
      TLinkMetadata
    >,
  ): NodeTreeReconcileResult {
    if (this.#disposed) throw new Error("NodeTree is disposed")
    requireRevision(request.expectedRevision)
    this.#requireExpectedRevision(request.expectedRevision)

    const owned = ownAndValidateDefinition(request.definition)
    const nextParameters = indexParameters(owned.nodes)
    requirePreservedParameterIdentity(this.#parameters, nextParameters)
    if (sameDefinition(this.definition(), owned)) {
      return Object.freeze({
        changed: false,
        revision: this.#revision,
        topologyRevision: this.#topologyRevision,
      })
    }

    const preparedSubscriptions = new Map<string, ParameterSubscription<TParameter>>()
    try {
      for (const [key, parameter] of nextParameters) {
        const current = this.#parameterSubscriptions.get(key)
        if (current?.parameter === parameter) {
          preparedSubscriptions.set(key, current)
          continue
        }
        preparedSubscriptions.set(key, this.#subscribeParameter(key, parameter))
      }
    } catch (error) {
      throw this.#rollbackPreparedSubscriptions(
        preparedSubscriptions,
        this.#parameterSubscriptions,
        error,
      )
    }

    try {
      this.#requireExpectedRevision(request.expectedRevision)
    } catch (error) {
      throw this.#rollbackPreparedSubscriptions(
        preparedSubscriptions,
        this.#parameterSubscriptions,
        error,
      )
    }

    const removedSubscriptions = [...this.#parameterSubscriptions]
      .filter(([key, subscription]) => preparedSubscriptions.get(key) !== subscription)
      .map(([, subscription]) => subscription)

    this.#frames = owned.frames
    this.#nodes = owned.nodes
    this.#links = owned.links
    this.#parameters = nextParameters
    this.#parameterSubscriptions = preparedSubscriptions
    this.#revision += 1
    this.#topologyRevision += 1

    const result = Object.freeze({
      changed: true,
      revision: this.#revision,
      topologyRevision: this.#topologyRevision,
    })
    const errors: unknown[] = []
    for (const subscription of removedSubscriptions) {
      try {
        subscription.unsubscribe()
      } catch (error) {
        this.#orphanedParameterSubscriptions.add(subscription)
        errors.push(error)
      }
    }
    const change: NodeTreeTopologyChange = Object.freeze({
      kind: "topology",
      revision: result.revision,
      topologyRevision: result.topologyRevision,
    })
    errors.push(...this.#notify(change))
    if (errors.length > 0) {
      throw new AggregateError(errors, "NodeTree listeners failed after topology commit")
    }
    return result
  }

  snapshot(): NodeTreeSnapshot<
    TParameter,
    TFrameMetadata,
    TNodeMetadata,
    TSocketMetadata,
    TLinkMetadata
  > {
    return snapshotFromGeneration(this.#captureGeneration())
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
      NodeTreeGenerationView<
        TParameter,
        TFrameMetadata,
        TNodeMetadata,
        TSocketMetadata,
        TLinkMetadata
      >,
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
    const generation = this.#captureGeneration()
    const snapshot = snapshotFromGeneration(generation)
    const promise = Promise.resolve().then(() => projector.project({
      tree: generation,
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
    this.#disposed = true
    this.#listeners.clear()
    this.clearProjectionCache()
    const errors: unknown[] = []
    for (const [key, subscription] of [...this.#parameterSubscriptions]) {
      try {
        subscription.unsubscribe()
        if (this.#parameterSubscriptions.get(key) === subscription) {
          this.#parameterSubscriptions.delete(key)
        }
      } catch (error) {
        errors.push(error)
      }
    }
    for (const subscription of [...this.#orphanedParameterSubscriptions]) {
      try {
        subscription.unsubscribe()
        this.#orphanedParameterSubscriptions.delete(subscription)
      } catch (error) {
        errors.push(error)
      }
    }
    if (errors.length > 0) {
      throw new AggregateError(errors, "NodeTree Parameter cleanup failed during disposal")
    }
  }

  #captureGeneration(): NodeTreeGenerationView<
    TParameter,
    TFrameMetadata,
    TNodeMetadata,
    TSocketMetadata,
    TLinkMetadata
  > {
    const parameters = new Map<string, NodeTreeGenerationParameter<TParameter>>()
    const nodes = Object.freeze(this.#nodes.map((node): NodeTreeGenerationNode<
      TParameter,
      TNodeMetadata,
      TSocketMetadata
    > => {
      const generationParameters = Object.freeze((node.parameters ?? []).map((parameter) => {
        const captured = captureGenerationParameter(parameter, node.id)
        parameters.set(parameterKey(node.id, parameter.id), captured)
        return captured
      }))
      return Object.freeze({
        id: node.id,
        ...(node.frameId === undefined ? {} : {frameId: node.frameId}),
        parameters: generationParameters,
        sockets: node.sockets ?? Object.freeze([]),
        ...(node.metadata === undefined ? {} : {metadata: node.metadata}),
      })
    }))
    return Object.freeze({
      revision: this.#revision,
      topologyRevision: this.#topologyRevision,
      frames: this.#frames,
      nodes,
      links: this.#links,
      parameter(nodeId: string, parameterId: string): NodeTreeGenerationParameter<TParameter> {
        const parameter = parameters.get(parameterKey(nodeId, parameterId))
        if (parameter === undefined) throw new Error(`Unknown Parameter: ${nodeId}/${parameterId}`)
        return parameter
      },
    })
  }

  #prepareParameterSubscriptions(
    parameters: ReadonlyMap<string, TParameter>,
  ): Map<string, ParameterSubscription<TParameter>> {
    const subscriptions = new Map<string, ParameterSubscription<TParameter>>()
    try {
      for (const [key, parameter] of parameters) {
        subscriptions.set(key, this.#subscribeParameter(key, parameter))
      }
      return subscriptions
    } catch (error) {
      throw this.#rollbackPreparedSubscriptions(subscriptions, new Map(), error)
    }
  }

  #subscribeParameter(
    key: string,
    parameter: TParameter,
  ): ParameterSubscription<TParameter> {
    const [nodeId, parameterId] = parseParameterKey(key)
    let subscription: ParameterSubscription<TParameter> | undefined
    const unsubscribe = parameter.subscribe(() => {
      if (this.#disposed || subscription === undefined ||
        this.#parameterSubscriptions.get(key) !== subscription) return
      this.#revision += 1
      const change: NodeTreeParameterChange = Object.freeze({
        kind: "parameter",
        revision: this.#revision,
        topologyRevision: this.#topologyRevision,
        nodeId,
        parameterId,
        parameterRevision: parameter.revision,
      })
      const errors = this.#notify(change)
      if (errors.length > 0) {
        throw new AggregateError(errors, `NodeTree listeners failed after Parameter commit: ${nodeId}/${parameterId}`)
      }
    })
    subscription = Object.freeze({key, parameter, unsubscribe})
    return subscription
  }

  #notify(change: NodeTreeChange): unknown[] {
    this.#changeQueue.push(change)
    if (this.#deliveringChanges) return []
    this.#deliveringChanges = true
    const errors: unknown[] = []
    try {
      while (this.#changeQueue.length > 0) {
        const queued = this.#changeQueue.shift()!
        for (const listener of [...this.#listeners]) {
          try {
            listener(queued)
          } catch (error) {
            errors.push(error)
          }
        }
      }
    } finally {
      this.#deliveringChanges = false
    }
    return errors
  }

  #rollbackPreparedSubscriptions(
    prepared: ReadonlyMap<string, ParameterSubscription<TParameter>>,
    retained: ReadonlyMap<string, ParameterSubscription<TParameter>>,
    cause: unknown,
  ): unknown {
    const errors: unknown[] = [cause]
    for (const [key, subscription] of prepared) {
      if (retained.get(key) === subscription) continue
      try {
        subscription.unsubscribe()
      } catch (error) {
        this.#orphanedParameterSubscriptions.add(subscription)
        errors.push(error)
      }
    }
    return errors.length === 1
      ? cause
      : new AggregateError(errors, "NodeTree subscription preparation rollback failed")
  }

  #requireExpectedRevision(expectedRevision: number): void {
    if (this.#revision !== expectedRevision) {
      throw new NodeTreeRevisionConflictError(expectedRevision, this.#revision)
    }
  }
}

function captureGenerationParameter<TParameter extends ParameterReference>(
  parameter: TParameter,
  nodeId: string,
): NodeTreeGenerationParameter<TParameter> {
  const snapshot = parameter.snapshot()
  if (snapshot.id !== parameter.id) {
    throw new Error(`Parameter snapshot identity differs: ${nodeId}/${parameter.id}/${snapshot.id}`)
  }
  return Object.freeze({
    id: parameter.id,
    revision: snapshot.revision,
    value: ownNodeJsonValue(snapshot.value, `Parameter generation value: ${nodeId}/${parameter.id}`),
    presentation: ownNodeJsonValue(
      snapshot.presentation,
      `Parameter generation presentation: ${nodeId}/${parameter.id}`,
    ),
    store: parameter,
  }) as NodeTreeGenerationParameter<TParameter>
}

function snapshotFromGeneration<
  TParameter extends ParameterReference,
  TFrameMetadata extends NodeJsonValue,
  TNodeMetadata extends NodeJsonValue,
  TSocketMetadata extends NodeJsonValue,
  TLinkMetadata extends NodeJsonValue,
>(
  generation: NodeTreeGenerationView<
    TParameter,
    TFrameMetadata,
    TNodeMetadata,
    TSocketMetadata,
    TLinkMetadata
  >,
): NodeTreeSnapshot<
  TParameter,
  TFrameMetadata,
  TNodeMetadata,
  TSocketMetadata,
  TLinkMetadata
> {
  return Object.freeze({
    revision: generation.revision,
    topologyRevision: generation.topologyRevision,
    frames: generation.frames,
    nodes: Object.freeze(generation.nodes.map((node) => Object.freeze({
      id: node.id,
      ...(node.frameId === undefined ? {} : {frameId: node.frameId}),
      parameters: Object.freeze(node.parameters.map((parameter) => Object.freeze({
        id: parameter.id,
        revision: parameter.revision,
        value: parameter.value,
        presentation: parameter.presentation,
      }))) as readonly NodeTreeParameterSnapshot<TParameter>[],
      sockets: node.sockets,
      ...(node.metadata === undefined ? {} : {metadata: node.metadata}),
    }))),
    links: generation.links,
  })
}

function documentFromDefinition<
  TParameter extends ParameterReference,
  TFrameMetadata extends NodeJsonValue,
  TNodeMetadata extends NodeJsonValue,
  TSocketMetadata extends NodeJsonValue,
  TLinkMetadata extends NodeJsonValue,
>(
  definition: NodeTreeDefinition<
    TParameter,
    TFrameMetadata,
    TNodeMetadata,
    TSocketMetadata,
    TLinkMetadata
  >,
): NodeTreeDocument<
  TParameter,
  TFrameMetadata,
  TNodeMetadata,
  TSocketMetadata,
  TLinkMetadata
> {
  const frames = ordered((definition.frames ?? []).map((frame) => [
    frame.id,
    Object.freeze({
      ...(frame.parentFrameId === undefined ? {} : {parentFrameId: frame.parentFrameId}),
      ...(frame.metadata === undefined ? {} : {metadata: frame.metadata}),
    }),
  ] as const))
  const nodes = ordered(definition.nodes.map((node) => [
    node.id,
    Object.freeze({
      ...(node.frameId === undefined ? {} : {frameId: node.frameId}),
      parameters: ordered((node.parameters ?? []).map((parameter) => {
        const snapshot = parameter.snapshot()
        return [parameter.id, Object.freeze({
          value: ownNodeJsonValue(snapshot.value, `Parameter document value: ${node.id}/${parameter.id}`),
          presentation: ownNodeJsonValue(
            snapshot.presentation,
            `Parameter document presentation: ${node.id}/${parameter.id}`,
          ),
        })] as const
      })) as Ordered<NodeTreeParameterDocument<TParameter>>,
      sockets: ordered((node.sockets ?? []).map((socket) => [
        socket.id,
        Object.freeze({
          direction: socket.direction,
          ...(socket.parameterId === undefined ? {} : {parameterId: socket.parameterId}),
          ...(socket.side === undefined ? {} : {side: socket.side}),
          ...(socket.metadata === undefined ? {} : {metadata: socket.metadata}),
        }),
      ] as const)),
      ...(node.metadata === undefined ? {} : {metadata: node.metadata}),
    }),
  ] as const))
  const links = ordered((definition.links ?? []).map((link) => [
    link.id,
    Object.freeze({
      from: Object.freeze({...link.from}),
      to: Object.freeze({...link.to}),
      ...(link.metadata === undefined ? {} : {metadata: link.metadata}),
    }),
  ] as const))
  return Object.freeze({formatVersion: 1, frames, nodes, links})
}

function ordered<T>(entries: readonly (readonly [string, T])[]): Ordered<T> {
  return Object.freeze({
    order: Object.freeze(entries.map(([id]) => id)),
    byId: Object.freeze(Object.fromEntries(entries)) as Readonly<Record<string, T>>,
  })
}

function indexParameters<TParameter extends ParameterReference>(
  nodes: readonly Node<TParameter, NodeJsonValue, NodeJsonValue>[],
): Map<string, TParameter> {
  const parameters = new Map<string, TParameter>()
  for (const node of nodes) {
    for (const parameter of node.parameters ?? []) {
      parameters.set(parameterKey(node.id, parameter.id), parameter)
    }
  }
  return parameters
}

function requirePreservedParameterIdentity<TParameter extends ParameterReference>(
  current: ReadonlyMap<string, TParameter>,
  next: ReadonlyMap<string, TParameter>,
): void {
  for (const [key, parameter] of current) {
    const nextParameter = next.get(key)
    if (nextParameter !== undefined && nextParameter !== parameter) {
      const [nodeId, parameterId] = parseParameterKey(key)
      throw new Error(`Parameter identity must be preserved: ${nodeId}/${parameterId}`)
    }
  }
}

function sameDefinition<
  TParameter extends ParameterReference,
  TFrameMetadata extends NodeJsonValue,
  TNodeMetadata extends NodeJsonValue,
  TSocketMetadata extends NodeJsonValue,
  TLinkMetadata extends NodeJsonValue,
>(
  left: NodeTreeDefinition<TParameter, TFrameMetadata, TNodeMetadata, TSocketMetadata, TLinkMetadata>,
  right: NodeTreeDefinition<TParameter, TFrameMetadata, TNodeMetadata, TSocketMetadata, TLinkMetadata>,
): boolean {
  const leftFrames = left.frames ?? []
  const rightFrames = right.frames ?? []
  if (leftFrames.length !== rightFrames.length) return false
  for (let index = 0; index < leftFrames.length; index += 1) {
    const leftFrame = leftFrames[index]!
    const rightFrame = rightFrames[index]!
    if (leftFrame.id !== rightFrame.id || leftFrame.parentFrameId !== rightFrame.parentFrameId ||
      !equalOptionalNodeJsonValue(leftFrame.metadata, rightFrame.metadata)) return false
  }

  if (left.nodes.length !== right.nodes.length) return false
  for (let index = 0; index < left.nodes.length; index += 1) {
    const leftNode = left.nodes[index]!
    const rightNode = right.nodes[index]!
    if (leftNode.id !== rightNode.id || leftNode.frameId !== rightNode.frameId ||
      !equalOptionalNodeJsonValue(leftNode.metadata, rightNode.metadata)) return false
    const leftParameters = leftNode.parameters ?? []
    const rightParameters = rightNode.parameters ?? []
    if (leftParameters.length !== rightParameters.length ||
      leftParameters.some((parameter, parameterIndex) => parameter !== rightParameters[parameterIndex])) return false
    const leftSockets = leftNode.sockets ?? []
    const rightSockets = rightNode.sockets ?? []
    if (leftSockets.length !== rightSockets.length) return false
    for (let socketIndex = 0; socketIndex < leftSockets.length; socketIndex += 1) {
      const leftSocket = leftSockets[socketIndex]!
      const rightSocket = rightSockets[socketIndex]!
      if (leftSocket.id !== rightSocket.id || leftSocket.direction !== rightSocket.direction ||
        leftSocket.parameterId !== rightSocket.parameterId || leftSocket.side !== rightSocket.side ||
        !equalOptionalNodeJsonValue(leftSocket.metadata, rightSocket.metadata)) return false
    }
  }

  const leftLinks = left.links ?? []
  const rightLinks = right.links ?? []
  if (leftLinks.length !== rightLinks.length) return false
  for (let index = 0; index < leftLinks.length; index += 1) {
    const leftLink = leftLinks[index]!
    const rightLink = rightLinks[index]!
    if (leftLink.id !== rightLink.id || leftLink.from.nodeId !== rightLink.from.nodeId ||
      leftLink.from.socketId !== rightLink.from.socketId || leftLink.to.nodeId !== rightLink.to.nodeId ||
      leftLink.to.socketId !== rightLink.to.socketId ||
      !equalOptionalNodeJsonValue(leftLink.metadata, rightLink.metadata)) return false
  }
  return true
}

function equalOptionalNodeJsonValue(
  left: NodeJsonValue | undefined,
  right: NodeJsonValue | undefined,
): boolean {
  if (left === undefined || right === undefined) return left === right
  return equalNodeJsonValue(left, right)
}

function requireRevision(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError("NodeTree expectedRevision must be a non-negative safe integer")
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
  const socketsByNode = new Map<string, ReadonlyMap<string, Socket<TSocketMetadata>>>()
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
    socketsByNode.set(node.id, new Map(sockets.map((socket) => [socket.id, socket])))
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
    const from = validateEndpoint(link.from, "from", link.id, nodeIds, socketsByNode)
    const to = validateEndpoint(link.to, "to", link.id, nodeIds, socketsByNode)
    if (from.direction === "input") {
      throw new Error(`Input Socket cannot be a Link source: ${link.id}/${link.from.nodeId}/${link.from.socketId}`)
    }
    if (to.direction === "output") {
      throw new Error(`Output Socket cannot be a Link target: ${link.id}/${link.to.nodeId}/${link.to.socketId}`)
    }
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

function validateEndpoint<TMetadata extends NodeJsonValue>(
  endpoint: SocketEndpoint,
  role: "from" | "to",
  linkId: string,
  nodeIds: ReadonlySet<string>,
  socketsByNode: ReadonlyMap<string, ReadonlyMap<string, Socket<TMetadata>>>,
): Socket<TMetadata> {
  requireIdentifier(endpoint.nodeId, `${role} Node on Link ${linkId}`)
  requireIdentifier(endpoint.socketId, `${role} Socket on Link ${linkId}`)
  if (!nodeIds.has(endpoint.nodeId)) throw new Error(`Unknown Link Node: ${linkId}/${endpoint.nodeId}`)
  const socket = socketsByNode.get(endpoint.nodeId)?.get(endpoint.socketId)
  if (socket === undefined) {
    throw new Error(`Unknown Link Socket: ${linkId}/${endpoint.nodeId}/${endpoint.socketId}`)
  }
  return socket
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
  return JSON.stringify([nodeId, parameterId])
}

function parseParameterKey(key: string): readonly [string, string] {
  const parsed = JSON.parse(key) as unknown
  if (!Array.isArray(parsed) || parsed.length !== 2 ||
    typeof parsed[0] !== "string" || typeof parsed[1] !== "string") {
    throw new Error("Invalid internal Parameter key")
  }
  return [parsed[0], parsed[1]]
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
