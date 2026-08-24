import {
  NodeTreeRevisionConflictError,
  type NodeTree,
  type NodeTreeDefinition,
  type NodeTreeDocument,
  type NodeTreeLinkDocument,
  type NodeTreeNodeDocument,
  type NodeTreeParameterChange,
  type NodeTreeParameterDocument,
  type NodeTreeReconcileResult,
  type NodeTreeSocketDocument,
} from "@nodes/core/node-tree"
import {
  Parameter,
  equalNodeJsonValue,
  ownNodeJsonValue,
  type NodeJsonObject,
  type NodeJsonValue,
} from "@nodes/core/parameter"
import {
  applyJsonPatch,
  encodeJsonPointerToken,
  type JsonPatchOperation,
} from "@nodes/core/json-patch"

type EditorTree<
  TValue extends NodeJsonValue,
  TPresentation extends NodeJsonValue,
  TFrameMetadata extends NodeJsonValue,
  TNodeMetadata extends NodeJsonValue,
  TSocketMetadata extends NodeJsonValue,
  TLinkMetadata extends NodeJsonValue,
> = NodeTree<
  Parameter<TValue, TPresentation>,
  TFrameMetadata,
  TNodeMetadata,
  TSocketMetadata,
  TLinkMetadata
>

type EditorDocument<
  TValue extends NodeJsonValue,
  TPresentation extends NodeJsonValue,
  TFrameMetadata extends NodeJsonValue,
  TNodeMetadata extends NodeJsonValue,
  TSocketMetadata extends NodeJsonValue,
  TLinkMetadata extends NodeJsonValue,
> = NodeTreeDocument<
  Parameter<TValue, TPresentation>,
  TFrameMetadata,
  TNodeMetadata,
  TSocketMetadata,
  TLinkMetadata
>

export type NodeTreeEditorCommit = NodeTreeReconcileResult

export type NodeTreeEditorResult = Readonly<{
  forward: readonly JsonPatchOperation[]
  /** Restores the JSON authoring document, not a deleted Store object identity. */
  inverse: readonly JsonPatchOperation[]
  result: NodeTreeEditorCommit
}>

export type NodeTreeEditorErrorCode =
  | "duplicate-link"
  | "duplicate-node"
  | "duplicate-parameter"
  | "duplicate-socket"
  | "invalid-identifier"
  | "invalid-patched-document"
  | "node-linked"
  | "parameter-content-change"
  | "parameter-referenced"
  | "unknown-link"
  | "unknown-node"
  | "unknown-parameter"

/** A command error detected before the final core topology validation. */
export class NodeTreeEditorError extends Error {
  constructor(
    readonly code: NodeTreeEditorErrorCode,
    message: string,
  ) {
    super(message)
    this.name = "NodeTreeEditorError"
  }
}

/** Listener failure reported after the exact editor transaction already committed. */
export class NodeTreeEditorCommittedError extends Error {
  constructor(
    readonly transaction: NodeTreeEditorResult,
    cause: unknown,
  ) {
    super("NodeTree editor transaction committed, but a listener failed", {cause})
    this.name = "NodeTreeEditorCommittedError"
  }
}

type ParameterPresentationDraft<TPresentation extends NodeJsonValue> =
  [null] extends [TPresentation]
    ? Readonly<{presentation?: TPresentation}>
    : Readonly<{presentation: TPresentation}>

export type ParameterDraft<
  TValue extends NodeJsonValue = NodeJsonValue,
  TPresentation extends NodeJsonValue = NodeJsonValue,
> = Readonly<{
  id: string
  value: TValue
}> & ParameterPresentationDraft<TPresentation>

export type SocketDraft<
  TMetadata extends NodeJsonValue = NodeJsonValue,
> = Readonly<{
  id: string
  direction: "input" | "output" | "bidirectional"
  parameterId?: string
  side?: "left" | "right"
  metadata?: TMetadata
}>

export type NodeDraft<
  TValue extends NodeJsonValue = NodeJsonValue,
  TPresentation extends NodeJsonValue = NodeJsonValue,
  TNodeMetadata extends NodeJsonValue = NodeJsonValue,
  TSocketMetadata extends NodeJsonValue = NodeJsonValue,
> = Readonly<{
  id: string
  frameId?: string
  parameters?: readonly ParameterDraft<TValue, TPresentation>[]
  sockets?: readonly SocketDraft<TSocketMetadata>[]
  metadata?: TNodeMetadata
}>

export type LinkDraft<
  TMetadata extends NodeJsonValue = NodeJsonValue,
> = Readonly<{
  id: string
  from: Readonly<{nodeId: string; socketId: string}>
  to: Readonly<{nodeId: string; socketId: string}>
  metadata?: TMetadata
}>

type ExpectedRevision = Readonly<{expectedRevision: number}>

export type AddParameterCommand<
  TValue extends NodeJsonValue = NodeJsonValue,
  TPresentation extends NodeJsonValue = NodeJsonValue,
> = ExpectedRevision & Readonly<{
  nodeId: string
  parameter: ParameterDraft<TValue, TPresentation>
}>

export type RemoveParameterCommand = ExpectedRevision & Readonly<{
  nodeId: string
  parameterId: string
}>

export type AddNodeCommand<
  TValue extends NodeJsonValue = NodeJsonValue,
  TPresentation extends NodeJsonValue = NodeJsonValue,
  TNodeMetadata extends NodeJsonValue = NodeJsonValue,
  TSocketMetadata extends NodeJsonValue = NodeJsonValue,
> = ExpectedRevision & Readonly<{
  node: NodeDraft<TValue, TPresentation, TNodeMetadata, TSocketMetadata>
}>

export type RemoveNodeCommand = ExpectedRevision & Readonly<{
  nodeId: string
  disconnectLinks?: boolean
}>

export type ConnectCommand<
  TLinkMetadata extends NodeJsonValue = NodeJsonValue,
> = ExpectedRevision & Readonly<{
  link: LinkDraft<TLinkMetadata>
}>

export type DisconnectCommand = ExpectedRevision & Readonly<{
  linkId: string
}>

export type SetParameterValueCommand<
  TValue extends NodeJsonValue = NodeJsonValue,
> = ExpectedRevision & Readonly<{
  nodeId: string
  parameterId: string
  value: TValue
}>

export type NodeTreeEditorProjectionRevision = Readonly<{
  revision: number
  topologyRevision: number
}>

export type NodeTreeEditorParameterLayoutContext<
  TValue extends NodeJsonValue = NodeJsonValue,
  TPresentation extends NodeJsonValue = NodeJsonValue,
> = Readonly<{
  change: NodeTreeParameterChange
  nodeId: string
  parameterId: string
  parameter: Parameter<TValue, TPresentation>
  value: TValue
  presentation: TPresentation
}>

export type NodeTreeEditorOptions<
  TValue extends NodeJsonValue = NodeJsonValue,
  TPresentation extends NodeJsonValue = NodeJsonValue,
> = Readonly<{
  parameterAffectsLayout?(context: NodeTreeEditorParameterLayoutContext<TValue, TPresentation>): boolean
}>

/**
 * Headless authoring facade over one live NodeTree.
 *
 * Structural commands materialize one final definition and call one core
 * reconcile. The editor owns neither a second graph nor a Parameter value map.
 */
export class NodeTreeEditor<
  TValue extends NodeJsonValue = NodeJsonValue,
  TPresentation extends NodeJsonValue = NodeJsonValue,
  TFrameMetadata extends NodeJsonValue = NodeJsonValue,
  TNodeMetadata extends NodeJsonValue = NodeJsonValue,
  TSocketMetadata extends NodeJsonValue = NodeJsonValue,
  TLinkMetadata extends NodeJsonValue = NodeJsonValue,
> {
  readonly #parameterAffectsLayout: NonNullable<
    NodeTreeEditorOptions<TValue, TPresentation>["parameterAffectsLayout"]
  >
  #layoutProjection: NodeTreeEditorProjectionRevision | null = null
  #layoutSensitiveRevision = -1
  #unsubscribeTree: (() => void) | null

  constructor(
    readonly tree: EditorTree<
      TValue,
      TPresentation,
      TFrameMetadata,
      TNodeMetadata,
      TSocketMetadata,
      TLinkMetadata
    >,
    options: NodeTreeEditorOptions<TValue, TPresentation> = {},
  ) {
    this.#parameterAffectsLayout = options.parameterAffectsLayout ?? (() => false)
    this.#unsubscribeTree = tree.subscribe((change) => {
      if (change.kind !== "parameter") return
      const parameter = tree.parameter(change.nodeId, change.parameterId)
      const context = Object.freeze({
        change,
        nodeId: change.nodeId,
        parameterId: change.parameterId,
        parameter,
        value: parameter.value,
        presentation: parameter.presentation,
      })
      if (this.#parameterAffectsLayout(context)) {
        this.#layoutSensitiveRevision = Math.max(this.#layoutSensitiveRevision, change.revision)
      }
    })
  }

  get layoutProjection(): NodeTreeEditorProjectionRevision | null {
    return this.#layoutProjection
  }

  get layoutTopologyRevision(): number | null {
    return this.#layoutProjection?.topologyRevision ?? null
  }

  get layoutDirty(): boolean {
    const projection = this.#layoutProjection
    if (projection === null || projection.topologyRevision !== this.tree.topologyRevision) return true
    return projection.revision < this.#layoutSensitiveRevision
  }

  markLayoutApplied(projection: NodeTreeEditorProjectionRevision): boolean {
    if (projection.revision !== this.tree.revision ||
      projection.topologyRevision !== this.tree.topologyRevision) return false
    this.#layoutProjection = Object.freeze({
      revision: projection.revision,
      topologyRevision: projection.topologyRevision,
    })
    return true
  }

  dispose(): void {
    this.#unsubscribeTree?.()
    this.#unsubscribeTree = null
  }

  addParameter(command: AddParameterCommand<TValue, TPresentation>): NodeTreeEditorResult {
    this.#assertRevision(command.expectedRevision)
    requireIdentifier(command.nodeId)
    requireIdentifier(command.parameter.id)
    const document = this.tree.document()
    const node = requiredEntry(document.nodes.byId, command.nodeId, "unknown-node", `Unknown Node: ${command.nodeId}`)
    if (Object.hasOwn(node.parameters.byId, command.parameter.id)) {
      throw new NodeTreeEditorError(
        "duplicate-parameter",
        `Duplicate Parameter: ${command.nodeId}/${command.parameter.id}`,
      )
    }
    const parameterPath = pointer("nodes", "byId", command.nodeId, "parameters")
    const index = node.parameters.order.length
    return this.#reconcile(
      command.expectedRevision,
      document,
      [
        add(
          `${parameterPath}/byId/${encodeJsonPointerToken(command.parameter.id)}`,
          asNodeJsonValue(parameterDocument(command.parameter)),
        ),
        add(`${parameterPath}/order/-`, command.parameter.id),
      ],
      [
        remove(`${parameterPath}/order/${index}`),
        remove(`${parameterPath}/byId/${encodeJsonPointerToken(command.parameter.id)}`),
      ],
    )
  }

  removeParameter(command: RemoveParameterCommand): NodeTreeEditorResult {
    this.#assertRevision(command.expectedRevision)
    requireIdentifier(command.nodeId)
    requireIdentifier(command.parameterId)
    const document = this.tree.document()
    const node = requiredEntry(document.nodes.byId, command.nodeId, "unknown-node", `Unknown Node: ${command.nodeId}`)
    const parameter = requiredEntry(
      node.parameters.byId,
      command.parameterId,
      "unknown-parameter",
      `Unknown Parameter: ${command.nodeId}/${command.parameterId}`,
    )
    const referringSocketId = node.sockets.order.find((socketId) =>
      requiredDocumentEntry(node.sockets.byId, socketId, `Socket on ${command.nodeId}`).parameterId === command.parameterId)
    if (referringSocketId !== undefined) {
      throw new NodeTreeEditorError(
        "parameter-referenced",
        `Parameter is referenced by Socket: ${command.nodeId}/${command.parameterId}/${referringSocketId}`,
      )
    }
    const index = requiredIndex(node.parameters.order, command.parameterId, "Parameter")
    const parameterPath = pointer("nodes", "byId", command.nodeId, "parameters")
    return this.#reconcile(
      command.expectedRevision,
      document,
      [
        remove(`${parameterPath}/order/${index}`),
        remove(`${parameterPath}/byId/${encodeJsonPointerToken(command.parameterId)}`),
      ],
      [
        add(`${parameterPath}/byId/${encodeJsonPointerToken(command.parameterId)}`, asNodeJsonValue(parameter)),
        add(`${parameterPath}/order/${index}`, command.parameterId),
      ],
    )
  }

  addNode(
    command: AddNodeCommand<TValue, TPresentation, TNodeMetadata, TSocketMetadata>,
  ): NodeTreeEditorResult {
    this.#assertRevision(command.expectedRevision)
    requireIdentifier(command.node.id)
    const document = this.tree.document()
    if (Object.hasOwn(document.nodes.byId, command.node.id)) {
      throw new NodeTreeEditorError("duplicate-node", `Duplicate Node: ${command.node.id}`)
    }
    const index = document.nodes.order.length
    const nodePath = pointer("nodes")
    return this.#reconcile(
      command.expectedRevision,
      document,
      [
        add(`${nodePath}/byId/${encodeJsonPointerToken(command.node.id)}`, asNodeJsonValue(nodeDocument(command.node))),
        add(`${nodePath}/order/-`, command.node.id),
      ],
      [
        remove(`${nodePath}/order/${index}`),
        remove(`${nodePath}/byId/${encodeJsonPointerToken(command.node.id)}`),
      ],
    )
  }

  removeNode(command: RemoveNodeCommand): NodeTreeEditorResult {
    this.#assertRevision(command.expectedRevision)
    requireIdentifier(command.nodeId)
    const document = this.tree.document()
    const node = requiredEntry(document.nodes.byId, command.nodeId, "unknown-node", `Unknown Node: ${command.nodeId}`)
    const nodeIndex = requiredIndex(document.nodes.order, command.nodeId, "Node")
    const linked = document.links.order.flatMap((linkId, index) => {
      const link = requiredDocumentEntry(document.links.byId, linkId, "Link")
      if (link.from.nodeId !== command.nodeId && link.to.nodeId !== command.nodeId) return []
      return [{id: linkId, index, link}]
    })
    if (linked.length > 0 && command.disconnectLinks !== true) {
      throw new NodeTreeEditorError(
        "node-linked",
        `Node has Links; pass disconnectLinks: true: ${command.nodeId}`,
      )
    }

    const forward: JsonPatchOperation[] = []
    for (const entry of [...linked].sort((left, right) => right.index - left.index)) {
      forward.push(remove(pointer("links", "order", String(entry.index))))
      forward.push(remove(pointer("links", "byId", entry.id)))
    }
    forward.push(remove(pointer("nodes", "order", String(nodeIndex))))
    forward.push(remove(pointer("nodes", "byId", command.nodeId)))

    const inverse: JsonPatchOperation[] = [
      add(pointer("nodes", "byId", command.nodeId), asNodeJsonValue(node)),
      add(pointer("nodes", "order", String(nodeIndex)), command.nodeId),
    ]
    for (const entry of [...linked].sort((left, right) => left.index - right.index)) {
      inverse.push(add(pointer("links", "byId", entry.id), asNodeJsonValue(entry.link)))
      inverse.push(add(pointer("links", "order", String(entry.index)), entry.id))
    }
    return this.#reconcile(command.expectedRevision, document, forward, inverse)
  }

  connect(command: ConnectCommand<TLinkMetadata>): NodeTreeEditorResult {
    this.#assertRevision(command.expectedRevision)
    requireIdentifier(command.link.id)
    const document = this.tree.document()
    if (Object.hasOwn(document.links.byId, command.link.id)) {
      throw new NodeTreeEditorError("duplicate-link", `Duplicate Link: ${command.link.id}`)
    }
    const index = document.links.order.length
    return this.#reconcile(
      command.expectedRevision,
      document,
      [
        add(pointer("links", "byId", command.link.id), asNodeJsonValue(linkDocument(command.link))),
        add(pointer("links", "order", "-"), command.link.id),
      ],
      [
        remove(pointer("links", "order", String(index))),
        remove(pointer("links", "byId", command.link.id)),
      ],
    )
  }

  disconnect(command: DisconnectCommand): NodeTreeEditorResult {
    this.#assertRevision(command.expectedRevision)
    requireIdentifier(command.linkId)
    const document = this.tree.document()
    const link = requiredEntry(document.links.byId, command.linkId, "unknown-link", `Unknown Link: ${command.linkId}`)
    const index = requiredIndex(document.links.order, command.linkId, "Link")
    return this.#reconcile(
      command.expectedRevision,
      document,
      [
        remove(pointer("links", "order", String(index))),
        remove(pointer("links", "byId", command.linkId)),
      ],
      [
        add(pointer("links", "byId", command.linkId), asNodeJsonValue(link)),
        add(pointer("links", "order", String(index)), command.linkId),
      ],
    )
  }

  setParameterValue(command: SetParameterValueCommand<TValue>): NodeTreeEditorResult {
    this.#assertRevision(command.expectedRevision)
    requireIdentifier(command.nodeId)
    requireIdentifier(command.parameterId)
    const parameter = this.tree.parameter(command.nodeId, command.parameterId)
    if (equalNodeJsonValue(parameter.value, command.value)) return commandResult([], [], {
      changed: false,
      revision: this.tree.revision,
      topologyRevision: this.tree.topologyRevision,
    })
    const previous = parameter.value
    const parameterRevision = parameter.revision
    const treeRevision = this.tree.revision
    const topologyRevision = this.tree.topologyRevision
    const path = pointer(
      "nodes",
      "byId",
      command.nodeId,
      "parameters",
      "byId",
      command.parameterId,
      "value",
    )
    const forward = ownOperations([replace(path, command.value)])
    const inverse = ownOperations([replace(path, previous)])
    try {
      parameter.set(command.value)
    } catch (error) {
      if (parameter.revision > parameterRevision && this.tree.revision > treeRevision) {
        throw new NodeTreeEditorCommittedError(
          commandResult(forward, inverse, {
            changed: true,
            revision: treeRevision + 1,
            topologyRevision,
          }),
          error,
        )
      }
      throw error
    }
    return commandResult(forward, inverse, currentCommit(this.tree, true))
  }

  #assertRevision(expectedRevision: number): void {
    if (expectedRevision !== this.tree.revision) {
      throw new NodeTreeRevisionConflictError(expectedRevision, this.tree.revision)
    }
  }

  #reconcile(
    expectedRevision: number,
    source: EditorDocument<
      TValue,
      TPresentation,
      TFrameMetadata,
      TNodeMetadata,
      TSocketMetadata,
      TLinkMetadata
    >,
    forward: readonly JsonPatchOperation[],
    inverse: readonly JsonPatchOperation[],
  ): NodeTreeEditorResult {
    const ownedForward = ownOperations(forward)
    const ownedInverse = ownOperations(inverse)
    const topologyRevision = this.tree.topologyRevision
    const patched = applyJsonPatch(asNodeJsonValue(source), ownedForward)
    const document = narrowPatchedDocument<
      TValue,
      TPresentation,
      TFrameMetadata,
      TNodeMetadata,
      TSocketMetadata,
      TLinkMetadata
    >(patched)
    const definition = materializeDefinition(this.tree, document)
    try {
      const result = this.tree.reconcile({expectedRevision, definition})
      return commandResult(ownedForward, ownedInverse, result)
    } catch (error) {
      if (this.tree.topologyRevision > topologyRevision) {
        throw new NodeTreeEditorCommittedError(
          commandResult(ownedForward, ownedInverse, {
            changed: true,
            revision: expectedRevision + 1,
            topologyRevision: topologyRevision + 1,
          }),
          error,
        )
      }
      throw error
    }
  }
}

function materializeDefinition<
  TValue extends NodeJsonValue,
  TPresentation extends NodeJsonValue,
  TFrameMetadata extends NodeJsonValue,
  TNodeMetadata extends NodeJsonValue,
  TSocketMetadata extends NodeJsonValue,
  TLinkMetadata extends NodeJsonValue,
>(
  tree: EditorTree<TValue, TPresentation, TFrameMetadata, TNodeMetadata, TSocketMetadata, TLinkMetadata>,
  document: EditorDocument<TValue, TPresentation, TFrameMetadata, TNodeMetadata, TSocketMetadata, TLinkMetadata>,
): NodeTreeDefinition<
  Parameter<TValue, TPresentation>,
  TFrameMetadata,
  TNodeMetadata,
  TSocketMetadata,
  TLinkMetadata
> {
  const existing = new Map<string, Map<string, Parameter<TValue, TPresentation>>>()
  for (const node of tree.definition().nodes) {
    const parameters = new Map<string, Parameter<TValue, TPresentation>>()
    for (const parameter of node.parameters ?? []) parameters.set(parameter.id, parameter)
    existing.set(node.id, parameters)
  }
  const frames = document.frames.order.map((id) => {
    const frame = requiredDocumentEntry(document.frames.byId, id, "Frame")
    return {
      id,
      ...(frame.parentFrameId === undefined ? {} : {parentFrameId: frame.parentFrameId}),
      ...(frame.metadata === undefined ? {} : {metadata: frame.metadata}),
    }
  })
  const nodes = document.nodes.order.map((id) => {
    const node = requiredDocumentEntry(document.nodes.byId, id, "Node")
    const parameters = node.parameters.order.map((parameterId): Parameter<TValue, TPresentation> => {
      const parameter = requiredDocumentEntry(node.parameters.byId, parameterId, `Parameter on ${id}`)
      const retained = existing.get(id)?.get(parameterId)
      if (retained !== undefined) {
        if (!equalNodeJsonValue(retained.value, parameter.value) ||
          !equalNodeJsonValue(retained.presentation, parameter.presentation)) {
          throw new NodeTreeEditorError(
            "parameter-content-change",
            `Structural transaction changed retained Parameter content: ${id}/${parameterId}`,
          )
        }
        return retained
      }
      return createCanonicalParameter(parameterId, parameter)
    })
    const sockets = node.sockets.order.map((socketId) => {
      const socket = requiredDocumentEntry(node.sockets.byId, socketId, `Socket on ${id}`)
      return {
        id: socketId,
        direction: socket.direction,
        ...(socket.parameterId === undefined ? {} : {parameterId: socket.parameterId}),
        ...(socket.side === undefined ? {} : {side: socket.side}),
        ...(socket.metadata === undefined ? {} : {metadata: socket.metadata}),
      }
    })
    return {
      id,
      ...(node.frameId === undefined ? {} : {frameId: node.frameId}),
      parameters,
      sockets,
      ...(node.metadata === undefined ? {} : {metadata: node.metadata}),
    }
  })
  const links = document.links.order.map((id) => {
    const link = requiredDocumentEntry(document.links.byId, id, "Link")
    return {
      id,
      from: link.from,
      to: link.to,
      ...(link.metadata === undefined ? {} : {metadata: link.metadata}),
    }
  })
  return {frames, nodes, links}
}

function createCanonicalParameter<
  TValue extends NodeJsonValue,
  TPresentation extends NodeJsonValue,
>(
  id: string,
  document: NodeTreeParameterDocument<Parameter<TValue, TPresentation>>,
): Parameter<TValue, TPresentation> {
  return new Parameter<TValue, TPresentation>(id, document.value, document.presentation)
}

function parameterDocument<
  TValue extends NodeJsonValue,
  TPresentation extends NodeJsonValue,
>(
  parameter: ParameterDraft<TValue, TPresentation>,
): NodeTreeParameterDocument<Parameter<TValue, TPresentation>> {
  return {
    value: parameter.value,
    presentation: parameterPresentation(parameter),
  }
}

function parameterPresentation<TPresentation extends NodeJsonValue>(
  parameter: ParameterPresentationDraft<TPresentation>,
): TPresentation {
  if (Object.hasOwn(parameter, "presentation")) return parameter.presentation as TPresentation
  return null as TPresentation
}

function nodeDocument<
  TValue extends NodeJsonValue,
  TPresentation extends NodeJsonValue,
  TNodeMetadata extends NodeJsonValue,
  TSocketMetadata extends NodeJsonValue,
>(
  node: NodeDraft<TValue, TPresentation, TNodeMetadata, TSocketMetadata>,
): NodeTreeNodeDocument<Parameter<TValue, TPresentation>, TNodeMetadata, TSocketMetadata> {
  const parameterOrder: string[] = []
  const parameterById = Object.create(null) as Record<
    string,
    NodeTreeParameterDocument<Parameter<TValue, TPresentation>>
  >
  for (const parameter of node.parameters ?? []) {
    requireIdentifier(parameter.id)
    if (Object.hasOwn(parameterById, parameter.id)) {
      throw new NodeTreeEditorError("duplicate-parameter", `Duplicate Parameter: ${node.id}/${parameter.id}`)
    }
    parameterOrder.push(parameter.id)
    parameterById[parameter.id] = parameterDocument(parameter)
  }
  const socketOrder: string[] = []
  const socketById = Object.create(null) as Record<string, NodeTreeSocketDocument<TSocketMetadata>>
  for (const socket of node.sockets ?? []) {
    requireIdentifier(socket.id)
    if (Object.hasOwn(socketById, socket.id)) {
      throw new NodeTreeEditorError("duplicate-socket", `Duplicate Socket: ${node.id}/${socket.id}`)
    }
    socketOrder.push(socket.id)
    socketById[socket.id] = {
      direction: socket.direction,
      ...(socket.parameterId === undefined ? {} : {parameterId: socket.parameterId}),
      ...(socket.side === undefined ? {} : {side: socket.side}),
      ...(socket.metadata === undefined ? {} : {metadata: socket.metadata}),
    }
  }
  return {
    ...(node.frameId === undefined ? {} : {frameId: node.frameId}),
    parameters: {order: parameterOrder, byId: parameterById},
    sockets: {order: socketOrder, byId: socketById},
    ...(node.metadata === undefined ? {} : {metadata: node.metadata}),
  }
}

function linkDocument<TMetadata extends NodeJsonValue>(
  link: LinkDraft<TMetadata>,
): NodeTreeLinkDocument<TMetadata> {
  return {
    from: link.from,
    to: link.to,
    ...(link.metadata === undefined ? {} : {metadata: link.metadata}),
  }
}

function commandResult(
  forward: readonly JsonPatchOperation[],
  inverse: readonly JsonPatchOperation[],
  result: NodeTreeEditorCommit,
): NodeTreeEditorResult {
  return Object.freeze({
    forward: ownOperations(forward),
    inverse: ownOperations(inverse),
    result: Object.freeze({...result}),
  })
}

function currentCommit(
  tree: Readonly<{revision: number; topologyRevision: number}>,
  changed: boolean,
): NodeTreeEditorCommit {
  return Object.freeze({
    changed,
    revision: tree.revision,
    topologyRevision: tree.topologyRevision,
  })
}

function ownOperations(operations: readonly JsonPatchOperation[]): readonly JsonPatchOperation[] {
  return Object.freeze(operations.map((operation): JsonPatchOperation => {
    if (operation.op === "remove") return Object.freeze({...operation})
    return Object.freeze({...operation, value: ownNodeJsonValue(operation.value)})
  }))
}

function add(path: string, value: NodeJsonValue): JsonPatchOperation {
  return Object.freeze({op: "add", path, value: ownNodeJsonValue(value)})
}

function remove(path: string): JsonPatchOperation {
  return Object.freeze({op: "remove", path})
}

function replace(path: string, value: NodeJsonValue): JsonPatchOperation {
  return Object.freeze({op: "replace", path, value: ownNodeJsonValue(value)})
}

function pointer(...tokens: readonly string[]): string {
  return `/${tokens.map(encodeJsonPointerToken).join("/")}`
}

function requireIdentifier(value: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new NodeTreeEditorError("invalid-identifier", "Node editor identifiers must be non-empty")
  }
}

function requiredEntry<T>(
  byId: Readonly<Record<string, T>>,
  id: string,
  code: NodeTreeEditorErrorCode,
  message: string,
): T {
  if (!Object.hasOwn(byId, id)) throw new NodeTreeEditorError(code, message)
  return byId[id] as T
}

function requiredDocumentEntry<T>(byId: Readonly<Record<string, T>>, id: string, label: string): T {
  if (!Object.hasOwn(byId, id)) throw new Error(`${label} order references missing byId entry: ${id}`)
  return byId[id] as T
}

function requiredIndex(order: readonly string[], id: string, label: string): number {
  const index = order.indexOf(id)
  if (index < 0) throw new Error(`${label} byId entry is missing from order: ${id}`)
  return index
}

function asNodeJsonValue(value: unknown): NodeJsonValue {
  return value as NodeJsonValue
}

function narrowPatchedDocument<
  TValue extends NodeJsonValue,
  TPresentation extends NodeJsonValue,
  TFrameMetadata extends NodeJsonValue,
  TNodeMetadata extends NodeJsonValue,
  TSocketMetadata extends NodeJsonValue,
  TLinkMetadata extends NodeJsonValue,
>(value: NodeJsonValue): EditorDocument<
  TValue,
  TPresentation,
  TFrameMetadata,
  TNodeMetadata,
  TSocketMetadata,
  TLinkMetadata
> {
  if (!isNodeJsonObject(value) || value["formatVersion"] !== 1 ||
    !isOrderedDocument(value["frames"]) ||
    !isOrderedDocument(value["nodes"]) ||
    !isOrderedDocument(value["links"])) {
    throw new NodeTreeEditorError(
      "invalid-patched-document",
      "Editor-owned JSON Patch did not produce a NodeTreeDocument",
    )
  }
  return value as unknown as EditorDocument<
    TValue,
    TPresentation,
    TFrameMetadata,
    TNodeMetadata,
    TSocketMetadata,
    TLinkMetadata
  >
}

function isOrderedDocument(value: NodeJsonValue | undefined): boolean {
  if (!isNodeJsonObject(value)) return false
  const order = value["order"]
  return Array.isArray(order) && order.every((id) => typeof id === "string") &&
    isNodeJsonObject(value["byId"])
}

function isNodeJsonObject(value: NodeJsonValue | undefined): value is NodeJsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
