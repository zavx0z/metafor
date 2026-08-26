/**
Проекция публичного MetaFor Graph в универсальный `@nodes/core` NodeTree.

Graph остаётся канонической read-only проекцией мира. Этот модуль хранит только
производный NodeTree, не читает доменные Store и не превращает NodeTree revision
в причинное время MetaFor.

@packageDocumentation
*/

import {
  validateGraph,
  type AtomRef,
  type DocumentPointer,
  type Graph,
  type MetaAddress,
  type MetaMatterParticle,
  type MetaProcess,
  type MetaReaction,
  type MetaTemplate,
  type RuntimeAtom,
  type RuntimeNode,
  type RuntimeReactionRelation,
  type RuntimeTopology,
  type ValidationIssue,
} from "@metafor/types/metafor/graph"
import {
  NodeTree,
  type Frame,
  type Link,
  type Node,
  type NodeTreeDefinition,
  type Socket,
} from "@nodes/core/node-tree"
import {
  equalNodeJsonValue,
  ownNodeJsonValue,
  Parameter,
  type NodeJsonObject,
  type NodeJsonValue,
} from "@nodes/core/parameter"

/** Renderer-neutral presentation, structurally accepted by `@nodes/ui/projection`. */
export type GraphNodeTreeParameterPresentation = NodeJsonObject & Readonly<{
  label: string
  field: NodeJsonObject
}>

/** Frame metadata with the minimum generic UI label. */
export type GraphNodeTreeFrameMetadata = NodeJsonObject & Readonly<{label: string}>

/** Node metadata with the minimum generic UI title. */
export type GraphNodeTreeNodeMetadata = NodeJsonObject & Readonly<{title: string}>

/** Socket metadata using one generic type without MetaFor-specific renderer code. */
export type GraphNodeTreeSocketMetadata = NodeJsonObject & Readonly<{
  label: string
  socketType: "custom"
}>

/** Link metadata accepted by the same generic UI projection. */
export type GraphNodeTreeLinkMetadata = NodeJsonObject & Readonly<{
  label: string
  socketType: "custom"
}>

/** Один локальный Parameter производной NodeTree-проекции. */
export type GraphNodeTreeParameter = Parameter<NodeJsonValue, GraphNodeTreeParameterPresentation>

/**
Универсальный NodeTree, чьи metadata описывают только происхождение из Graph.

Конкретный renderer, layout и view state остаются внешними adapters.
*/
export type GraphNodeTree = NodeTree<
  GraphNodeTreeParameter,
  GraphNodeTreeFrameMetadata,
  GraphNodeTreeNodeMetadata,
  GraphNodeTreeSocketMetadata,
  GraphNodeTreeLinkMetadata
>

/** Наблюдаемый итог одного обновления производной NodeTree. */
export type GraphNodeTreeUpdate = Readonly<{
  changed: boolean
  parameterChanges: number
  topologyChanged: boolean
  revision: number
  topologyRevision: number
}>

/**
Graph не прошёл закрытую public validation, поэтому NodeTree не была создана
или изменена.
*/
export class GraphNodeTreeValidationError extends Error {
  readonly issues: readonly ValidationIssue[]

  constructor(issues: readonly ValidationIssue[]) {
    super(`Graph NodeTree projection rejected ${issues.length} validation issue(s)`)
    this.name = "GraphNodeTreeValidationError"
    this.issues = Object.freeze(issues.map((issue) => Object.freeze({...issue})))
  }
}

type PlannedParameter = Readonly<{
  id: string
  value: NodeJsonValue
  presentation: GraphNodeTreeParameterPresentation
}>

type PlannedNode = Readonly<{
  id: string
  frameId: string
  parameters: readonly PlannedParameter[]
  sockets: readonly Socket<GraphNodeTreeSocketMetadata>[]
  metadata: GraphNodeTreeNodeMetadata
}>

type MutablePlannedNode = {
  id: string
  frameId: string
  parameters: PlannedParameter[]
  sockets: Socket<GraphNodeTreeSocketMetadata>[]
  metadata: GraphNodeTreeNodeMetadata
}

type GraphNodeTreePlan = Readonly<{
  frames: readonly Frame<GraphNodeTreeFrameMetadata>[]
  nodes: readonly PlannedNode[]
  links: readonly Link<GraphNodeTreeLinkMetadata>[]
}>

type ParameterIndex = ReadonlyMap<string, GraphNodeTreeParameter>

const TEMPLATE_ROOT_FRAME = "frame:templates"
const RUNTIME_ROOT_FRAME = "frame:runtime"

/**
Создаёт новый производный NodeTree из полного валидного Graph.

Один WIMP template создаёт ровно один template Node независимо от числа Atom,
рождённых из него. Runtime Atom и Topology используют public refs как Node ID.

@param input - Закрытый public Graph. Произвольные дополнительные поля,
невалидные refs и несогласованные declaration/runtime связи отклоняются.

@returns Новый NodeTree без DOM, renderer, layout и копии Graph.

@throws {@link GraphNodeTreeValidationError} Если Graph не проходит public
validation.

@see [Focused projection tests](./graph.spec.ts)
*/
export function createGraphNodeTree(input: unknown): GraphNodeTree {
  const plan = graphNodeTreePlan(validGraph(input))
  return new NodeTree(materializeDefinition(plan, new Map()))
}

/**
Согласует существующий производный NodeTree с новым полным Graph snapshot.

Сохранившиеся `(nodeId, parameterId)` повторно используют exact Parameter
objects. Изменение только значений вызывает `Parameter.set()` и не вызывает
`NodeTree.reconcile()`. Структурное изменение готовится целиком и затем
применяется одним reconcile.

NodeTree должен принадлежать этому adapter: локальный authoring через
`NodeTreeEditor` не является изменением MetaFor и не поддерживается.

@param tree - Ранее созданный {@link GraphNodeTree}.
@param input - Следующий полный валидный Graph snapshot после причинного commit.

@returns Число изменённых Parameter и итоговые локальные revisions NodeTree.

@throws {@link GraphNodeTreeValidationError} Если следующий Graph невалиден.
Невалидный Graph не меняет `tree`.

@see [Focused reconcile tests](./graph.spec.ts)
*/
export function reconcileGraphNodeTree(
  tree: GraphNodeTree,
  input: unknown,
): GraphNodeTreeUpdate {
  const plan = graphNodeTreePlan(validGraph(input))
  validatePlan(plan)

  const currentParameters = parameterIndex(tree)
  const nextDefinition = materializeDefinition(plan, currentParameters)
  const topologyChanged = topologyKey(tree.definition()) !== topologyKey(nextDefinition)
  const parameterUpdates = plannedParameterUpdates(plan, currentParameters)
  const listenerErrors: unknown[] = []

  for (const [parameter, value] of parameterUpdates) {
    try {
      parameter.set(value)
    } catch (error) {
      listenerErrors.push(error)
    }
  }

  if (topologyChanged) {
    try {
      tree.reconcile({
        expectedRevision: tree.revision,
        definition: nextDefinition,
      })
    } catch (error) {
      listenerErrors.push(error)
    }
  }

  if (listenerErrors.length > 0) {
    throw new AggregateError(listenerErrors, "Graph NodeTree listeners failed after projection commit")
  }

  return Object.freeze({
    changed: parameterUpdates.length > 0 || topologyChanged,
    parameterChanges: parameterUpdates.length,
    topologyChanged,
    revision: tree.revision,
    topologyRevision: tree.topologyRevision,
  })
}

class PlanBuilder {
  readonly frames: Frame<GraphNodeTreeFrameMetadata>[] = []
  readonly nodes: MutablePlannedNode[] = []
  readonly links: Link<GraphNodeTreeLinkMetadata>[] = []
  readonly nodeById = new Map<string, MutablePlannedNode>()

  frame(id: string, parentFrameId: string | undefined, metadata: GraphNodeTreeFrameMetadata): void {
    this.frames.push(Object.freeze({
      id,
      ...(parentFrameId === undefined ? {} : {parentFrameId}),
      metadata,
    }))
  }

  node(id: string, frameId: string, metadata: GraphNodeTreeNodeMetadata): MutablePlannedNode {
    if (this.nodeById.has(id)) throw new Error(`Graph projection produced duplicate Node: ${id}`)
    const node: MutablePlannedNode = {id, frameId, parameters: [], sockets: [], metadata}
    this.nodeById.set(id, node)
    this.nodes.push(node)
    return node
  }

  parameter(
    node: MutablePlannedNode,
    id: string,
    kind: string,
    label: string,
    value: unknown,
  ): void {
    if (node.parameters.some((parameter) => parameter.id === id)) {
      throw new Error(`Graph projection produced duplicate Parameter: ${node.id}/${id}`)
    }
    node.parameters.push(Object.freeze({
      id,
      value: displayValue(value, `Graph Parameter ${node.id}/${id}`),
      presentation: nodeObject({
        kind,
        label,
        field: {
          id,
          label,
          kind: "readonly",
          readOnly: true,
        },
      }, `Graph Parameter presentation ${node.id}/${id}`) as GraphNodeTreeParameterPresentation,
    }))
  }

  socket(
    node: MutablePlannedNode,
    id: string,
    direction: Socket<GraphNodeTreeSocketMetadata>["direction"],
    kind: string,
    label: string,
    parameterId?: string,
  ): void {
    if (node.sockets.some((socket) => socket.id === id)) {
      throw new Error(`Graph projection produced duplicate Socket: ${node.id}/${id}`)
    }
    node.sockets.push(Object.freeze({
      id,
      direction,
      ...(parameterId === undefined ? {} : {parameterId}),
      metadata: nodeObject({
        kind,
        label,
        socketType: "custom",
      }, `Graph Socket metadata ${node.id}/${id}`) as GraphNodeTreeSocketMetadata,
    }))
  }

  link(
    id: string,
    from: Readonly<{nodeId: string; socketId: string}>,
    to: Readonly<{nodeId: string; socketId: string}>,
    metadata: NodeJsonObject,
  ): void {
    if (this.links.some((link) => link.id === id)) {
      throw new Error(`Graph projection produced duplicate Link: ${id}`)
    }
    this.links.push(Object.freeze({
      id,
      from: Object.freeze({...from}),
      to: Object.freeze({...to}),
      metadata: nodeObject({
        ...metadata,
        socketType: "custom",
      }, `Graph Link metadata ${id}`) as GraphNodeTreeLinkMetadata,
    }))
  }

  finish(): GraphNodeTreePlan {
    return Object.freeze({
      frames: Object.freeze([...this.frames]),
      nodes: Object.freeze(this.nodes.map((node) => Object.freeze({
        ...node,
        parameters: Object.freeze([...node.parameters]),
        sockets: Object.freeze([...node.sockets]),
      }))),
      links: Object.freeze([...this.links]),
    })
  }
}

function graphNodeTreePlan(graph: Graph): GraphNodeTreePlan {
  const builder = new PlanBuilder()
  builder.frame(TEMPLATE_ROOT_FRAME, undefined, nodeObject({
    kind: "templates",
    label: "Templates",
  }, "Template root Frame metadata"))
  builder.frame(RUNTIME_ROOT_FRAME, undefined, nodeObject({
    kind: "runtime",
    label: "Runtime",
  }, "Runtime root Frame metadata"))

  const addresses = (Object.keys(graph.template) as MetaAddress[])
    .sort((left, right) => left.localeCompare(right))
  for (const address of addresses) projectTemplate(builder, address, graph.template[address]!)
  for (const [order, root] of graph.runtime.roots.entries()) {
    projectRuntimeNode(builder, graph, root, RUNTIME_ROOT_FRAME, order)
  }
  for (const relation of [...graph.runtime.reactions].sort((left, right) => left.ref.localeCompare(right.ref))) {
    projectRuntimeReaction(builder, relation)
  }
  return builder.finish()
}

function projectTemplate(builder: PlanBuilder, address: MetaAddress, template: MetaTemplate): void {
  const frameId = templateFrameId(address)
  const ownerId = templateNodeId(address)
  builder.frame(frameId, TEMPLATE_ROOT_FRAME, nodeObject({
    kind: "wimp-template",
    label: template.name,
    meta: address,
  }, `Template Frame metadata ${address}`))
  const owner = builder.node(ownerId, frameId, nodeObject({
    kind: "wimp-template",
    scope: "template",
    meta: address,
    title: template.name,
  }, `Template Node metadata ${address}`))
  builder.parameter(owner, "template", "wimp-template", "Template", {
    address,
    name: template.name,
    ...(template.desc === undefined ? {} : {desc: template.desc}),
    ...(template.bulk === undefined ? {} : {bulk: template.bulk}),
    reactionsPresent: template.reactions !== undefined,
    matterPresent: template.matter !== undefined,
  })
  builder.socket(owner, "instances", "output", "template-instances", "Instances")
  builder.socket(owner, "matter", "output", "matter-owner", "Matter")
  builder.socket(owner, "matter-source", "input", "matter-target", "Matter source")
  builder.socket(owner, "lifecycle", "output", "lifecycle", "Lifecycle")

  for (const field of template.fields) {
    const parameterId = fieldParameterId(field.key)
    builder.parameter(owner, parameterId, "field-declaration", field.key, field)
    builder.socket(owner, fieldReadSocketId(field.key), "output", "field-read", field.key, parameterId)
    builder.socket(owner, fieldWriteSocketId(field.key), "input", "field-write", field.key, parameterId)
  }
  for (const mass of template.mass) {
    const parameterId = massParameterId(mass.key)
    builder.parameter(owner, parameterId, "mass-declaration", mass.key, mass)
    builder.socket(owner, massReadSocketId(mass.key), "output", "mass-read", mass.key, parameterId)
    builder.socket(owner, massWriteSocketId(mass.key), "input", "mass-write", mass.key, parameterId)
  }

  for (const [stateOrder, state] of template.superposition.entries()) {
    const stateNode = builder.node(stateNodeId(address, state.name), frameId, nodeObject({
      kind: "state",
      scope: "template",
      meta: address,
      state: state.name,
      order: stateOrder,
      title: state.name,
    }, `State Node metadata ${address}/${state.name}`))
    builder.parameter(stateNode, "state", "state-declaration", state.name, state)
    builder.socket(stateNode, "in", "input", "state-input", state.name)
    builder.socket(stateNode, "out", "output", "state-output", state.name)

    for (const [transitionOrder, [target, wave]] of Object.entries(state.transitions ?? {}).entries()) {
      projectTransition(builder, address, frameId, state.name, target, wave, transitionOrder)
    }
  }

  for (const [order, process] of template.processes.entries()) {
    projectProcess(builder, address, frameId, process, order)
  }
  for (const [order, reaction] of (template.reactions ?? []).entries()) {
    projectReaction(builder, address, frameId, reaction, order)
  }
  if (template.matter !== undefined) projectMatter(builder, address, frameId, template.matter)
}

function projectTransition(
  builder: PlanBuilder,
  address: MetaAddress,
  frameId: string,
  from: string,
  to: string,
  wave: Readonly<Record<string, unknown>>,
  order: number,
): void {
  const nodeId = transitionNodeId(address, from, to)
  const transition = builder.node(nodeId, frameId, nodeObject({
    kind: "transition",
    scope: "template",
    meta: address,
    from,
    to,
    order,
    title: `${from} → ${to}`,
  }, `Transition Node metadata ${address}/${from}/${to}`))
  builder.parameter(transition, "transition", "transition-declaration", "Transition", {from, to, order})
  builder.socket(transition, "from", "input", "transition-from", from)
  builder.socket(transition, "to", "output", "transition-to", to)
  builder.link(
    linkId("transition-from", address, from, to),
    {nodeId: stateNodeId(address, from), socketId: "out"},
    {nodeId, socketId: "from"},
    nodeObject({kind: "transition-flow", label: from}, "Transition source Link metadata"),
  )
  builder.link(
    linkId("transition-to", address, from, to),
    {nodeId, socketId: "to"},
    {nodeId: stateNodeId(address, to), socketId: "in"},
    nodeObject({kind: "transition-flow", label: to}, "Transition target Link metadata"),
  )

  for (const [field, predicate] of Object.entries(wave)) {
    const parameterId = conditionParameterId(field)
    const socketId = conditionSocketId(field)
    builder.parameter(transition, parameterId, "condition", field, predicate)
    builder.socket(transition, socketId, "input", "condition", field, parameterId)
    builder.link(
      linkId("condition", address, from, to, field),
      {nodeId: templateNodeId(address), socketId: fieldReadSocketId(field)},
      {nodeId, socketId},
      nodeObject({kind: "condition", label: field}, "Condition Link metadata"),
    )
  }
}

function projectProcess(
  builder: PlanBuilder,
  address: MetaAddress,
  frameId: string,
  process: MetaProcess,
  order: number,
): void {
  const nodeId = processNodeId(address, process.key)
  const node = builder.node(nodeId, frameId, nodeObject({
    kind: "process",
    scope: "template",
    meta: address,
    process: process.key,
    processType: process.declaration.type,
    order,
    title: process.declaration.label ?? process.key,
  }, `Process Node metadata ${address}/${process.key}`))
  builder.parameter(node, "declaration", "process-declaration", "Process", process)
  builder.socket(node, "trigger", "input", "process-trigger", process.key)
  if (process.declaration.type === "action") {
    builder.link(
      linkId("process-trigger", address, process.key),
      {nodeId: stateNodeId(address, process.key), socketId: "out"},
      {nodeId, socketId: "trigger"},
      nodeObject({kind: "process-trigger", label: process.key}, "Process trigger Link metadata"),
    )
  } else {
    builder.link(
      linkId("process-finally", address, process.key),
      {nodeId: templateNodeId(address), socketId: "lifecycle"},
      {nodeId, socketId: "trigger"},
      nodeObject({kind: "process-finally", label: process.key}, "Finally Process Link metadata"),
    )
  }

  const dependencies = processDependencies(process)
  for (const field of dependencies.read) {
    const socketId = dependencySocketId("read", field)
    builder.socket(node, socketId, "input", "process-read", field)
    builder.link(
      linkId("process-read", address, process.key, field),
      {nodeId: templateNodeId(address), socketId: fieldReadSocketId(field)},
      {nodeId, socketId},
      nodeObject({kind: "process-read", label: field}, "Process read Link metadata"),
    )
  }
  for (const field of dependencies.write) {
    const socketId = dependencySocketId("write", field)
    builder.socket(node, socketId, "output", "process-write", field)
    builder.link(
      linkId("process-write", address, process.key, field),
      {nodeId, socketId},
      {nodeId: templateNodeId(address), socketId: fieldWriteSocketId(field)},
      nodeObject({kind: "process-write", label: field}, "Process write Link metadata"),
    )
  }
}

function processDependencies(process: MetaProcess): Readonly<{read: string[]; write: string[]}> {
  if (process.declaration.type === "finally") {
    return Object.freeze({
      read: [...new Set(process.declaration.before.read ?? [])],
      write: [],
    })
  }
  return Object.freeze({
    read: [...new Set([
      ...(process.declaration.action.read ?? []),
      ...(process.declaration.success?.read ?? []),
      ...(process.declaration.error?.read ?? []),
    ])],
    write: [...new Set([
      ...(process.declaration.success?.write ?? []),
      ...(process.declaration.error?.write ?? []),
    ])],
  })
}

function projectReaction(
  builder: PlanBuilder,
  address: MetaAddress,
  frameId: string,
  reaction: MetaReaction,
  order: number,
): void {
  const nodeId = reactionNodeId(address, reaction.key)
  const node = builder.node(nodeId, frameId, nodeObject({
    kind: "reaction",
    scope: "template",
    meta: address,
    reaction: reaction.key,
    order,
    title: reaction.label,
  }, `Reaction Node metadata ${address}/${reaction.key}`))
  builder.parameter(node, "declaration", "reaction-declaration", "Reaction", reaction)

  for (const state of reaction.states) {
    const socketId = reactionDependencySocketId("active", state)
    builder.socket(node, socketId, "input", "reaction-active", state)
    builder.link(
      linkId("reaction-active", address, reaction.key, state),
      {nodeId: stateNodeId(address, state), socketId: "out"},
      {nodeId, socketId},
      nodeObject({kind: "reaction-active", label: state}, "Reaction State Link metadata"),
    )
  }
  for (const field of reaction.read) {
    const socketId = reactionDependencySocketId("field-read", field)
    builder.socket(node, socketId, "input", "reaction-field-read", field)
    builder.link(
      linkId("reaction-field-read", address, reaction.key, field),
      {nodeId: templateNodeId(address), socketId: fieldReadSocketId(field)},
      {nodeId, socketId},
      nodeObject({kind: "reaction-field-read", label: field}, "Reaction Field read Link metadata"),
    )
  }
  for (const field of reaction.write) {
    const socketId = reactionDependencySocketId("field-write", field)
    builder.socket(node, socketId, "output", "reaction-field-write", field)
    builder.link(
      linkId("reaction-field-write", address, reaction.key, field),
      {nodeId, socketId},
      {nodeId: templateNodeId(address), socketId: fieldWriteSocketId(field)},
      nodeObject({kind: "reaction-field-write", label: field}, "Reaction Field write Link metadata"),
    )
  }
  for (const key of reaction.massRead) {
    const socketId = reactionDependencySocketId("mass-read", key)
    builder.socket(node, socketId, "input", "reaction-mass-read", key)
    builder.link(
      linkId("reaction-mass-read", address, reaction.key, key),
      {nodeId: templateNodeId(address), socketId: massReadSocketId(key)},
      {nodeId, socketId},
      nodeObject({kind: "reaction-mass-read", label: key}, "Reaction Mass read Link metadata"),
    )
  }
  for (const key of reaction.massWrite) {
    const socketId = reactionDependencySocketId("mass-write", key)
    builder.socket(node, socketId, "output", "reaction-mass-write", key)
    builder.link(
      linkId("reaction-mass-write", address, reaction.key, key),
      {nodeId, socketId},
      {nodeId: templateNodeId(address), socketId: massWriteSocketId(key)},
      nodeObject({kind: "reaction-mass-write", label: key}, "Reaction Mass write Link metadata"),
    )
  }
}

function projectMatter(
  builder: PlanBuilder,
  address: MetaAddress,
  frameId: string,
  particles: MetaMatterParticle[],
): void {
  const nodeId = matterNodeId(address)
  const node = builder.node(nodeId, frameId, nodeObject({
    kind: "matter",
    scope: "template",
    meta: address,
    title: "Matter",
  }, `Matter Node metadata ${address}`))
  builder.parameter(node, "particles", "matter-declaration", "Matter", particles)
  builder.socket(node, "owner", "input", "matter-owner", address)
  builder.socket(node, "target", "output", "matter-target", "Targets")
  builder.socket(node, "runtime", "output", "matter-runtime", "Runtime")
  builder.link(
    linkId("matter-owner", address),
    {nodeId: templateNodeId(address), socketId: "matter"},
    {nodeId, socketId: "owner"},
    nodeObject({kind: "matter-owner", label: address}, "Matter owner Link metadata"),
  )

  for (const [target, count] of matterTargets(particles)) {
    builder.link(
      linkId("matter-target", address, target),
      {nodeId, socketId: "target"},
      {nodeId: templateNodeId(target), socketId: "matter-source"},
      nodeObject({
        kind: "matter-target",
        label: target,
        occurrences: count,
      }, `Matter target Link metadata ${address}/${target}`),
    )
  }
}

function matterTargets(particles: readonly MetaMatterParticle[]): ReadonlyMap<MetaAddress, number> {
  const targets = new Map<MetaAddress, number>()
  const visit = (particle: MetaMatterParticle): void => {
    if (particle.kind === "wimp") targets.set(particle.src, (targets.get(particle.src) ?? 0) + 1)
    for (const child of particle.children ?? []) visit(child.particle)
  }
  for (const particle of particles) visit(particle)
  return new Map([...targets].sort(([left], [right]) => left.localeCompare(right)))
}

function projectRuntimeNode(
  builder: PlanBuilder,
  graph: Graph,
  runtime: RuntimeNode,
  parentFrameId: string,
  order: number,
): void {
  const frameId = runtimeFrameId(runtime.ref)
  builder.frame(frameId, parentFrameId, nodeObject({
    kind: runtime.kind === "atom" ? "atom-runtime" : "topology-runtime",
    label: runtime.ref,
    ref: runtime.ref,
    order,
  }, `Runtime Frame metadata ${runtime.ref}`))
  if (runtime.kind === "atom") projectRuntimeAtom(builder, graph, runtime, frameId)
  else projectRuntimeTopology(builder, runtime, frameId)
  for (const [childOrder, child] of (runtime.children ?? []).entries()) {
    projectRuntimeNode(builder, graph, child, frameId, childOrder)
  }
}

function projectRuntimeAtom(
  builder: PlanBuilder,
  graph: Graph,
  atom: RuntimeAtom,
  frameId: string,
): void {
  const node = builder.node(atom.ref, frameId, nodeObject({
    kind: "atom",
    scope: "runtime",
    ref: atom.ref,
    meta: atom.meta,
    declaration: atom.declaration,
    title: atom.ref,
  }, `Runtime Atom metadata ${atom.ref}`))
  builder.parameter(node, "declaration", "runtime-declaration", "Declaration", atom.declaration)
  builder.parameter(node, "state", "runtime-state", "State", atom.state)
  builder.socket(node, "template", "input", "atom-template", atom.meta)
  builder.socket(node, "declaration", "input", "runtime-declaration", "Declaration")
  builder.socket(node, "state", "output", "runtime-state", "State", "state")

  const template = graph.template[atom.meta]!
  for (const field of template.fields) {
    const present = Object.hasOwn(atom.values, field.key)
    builder.parameter(node, fieldParameterId(field.key), "runtime-field", field.key, {
      present,
      ...(present ? {value: atom.values[field.key]!} : {}),
    })
  }
  for (const mass of atom.mass) {
    builder.parameter(node, runtimeMassParameterId(mass.ref), "runtime-mass", mass.key, mass)
  }
  for (const reaction of template.reactions ?? []) {
    builder.socket(
      node,
      runtimeReactionSocketId(reaction.key),
      "input",
      "runtime-reaction",
      reaction.label,
    )
  }
  builder.link(
    linkId("instance", atom.ref),
    {nodeId: templateNodeId(atom.meta), socketId: "instances"},
    {nodeId: atom.ref, socketId: "template"},
    nodeObject({kind: "instance", label: atom.meta}, `Atom instance Link metadata ${atom.ref}`),
  )
  projectRuntimeDeclarationLink(builder, atom.ref, atom.declaration)
}

function projectRuntimeTopology(
  builder: PlanBuilder,
  topology: RuntimeTopology,
  frameId: string,
): void {
  const node = builder.node(topology.ref, frameId, nodeObject({
    kind: "topology",
    scope: "runtime",
    ref: topology.ref,
    topology: topology.topology,
    declaration: topology.declaration,
    title: topology.ref,
  }, `Runtime Topology metadata ${topology.ref}`))
  builder.parameter(node, "declaration", "runtime-declaration", "Declaration", topology.declaration)
  builder.parameter(node, "topology", "runtime-topology", "Topology", topology.topology)
  builder.socket(node, "declaration", "input", "runtime-declaration", "Declaration")
  projectRuntimeDeclarationLink(builder, topology.ref, topology.declaration)
}

function projectRuntimeDeclarationLink(
  builder: PlanBuilder,
  runtimeRef: AtomRef | RuntimeTopology["ref"],
  declaration: DocumentPointer,
): void {
  const owner = matterOwner(declaration)
  if (owner === null) return
  builder.link(
    linkId("runtime-declaration", runtimeRef),
    {nodeId: matterNodeId(owner), socketId: "runtime"},
    {nodeId: runtimeRef, socketId: "declaration"},
    nodeObject({
      kind: "runtime-declaration",
      label: owner,
      declaration,
    }, `Runtime declaration Link metadata ${runtimeRef}`),
  )
}

function projectRuntimeReaction(builder: PlanBuilder, relation: RuntimeReactionRelation): void {
  const target = builder.nodeById.get(relation.target.atom)
  if (target === undefined) {
    throw new Error(`Graph projection cannot find Reaction target Atom: ${relation.ref}`)
  }
  builder.parameter(
    target,
    runtimeReactionParameterId(relation.ref),
    "runtime-reaction-relation",
    relation.ref,
    relation,
  )
  builder.link(
    relation.ref,
    {nodeId: relation.source.atom, socketId: "state"},
    {nodeId: relation.target.atom, socketId: runtimeReactionSocketId(relation.reaction.key)},
    nodeObject({
      kind: "reaction-relation",
      label: relation.ref,
      relation: relation.ref,
    }, `Runtime Reaction Link metadata ${relation.ref}`),
  )
}

function validGraph(input: unknown): Graph {
  const validation = validateGraph(input)
  if (!validation.ok) throw new GraphNodeTreeValidationError(validation.issues)
  return validation.value
}

function validatePlan(plan: GraphNodeTreePlan): void {
  const candidate = new NodeTree(materializeDefinition(plan, new Map()))
  candidate.dispose()
}

function materializeDefinition(
  plan: GraphNodeTreePlan,
  current: ParameterIndex,
): NodeTreeDefinition<
  GraphNodeTreeParameter,
  GraphNodeTreeFrameMetadata,
  GraphNodeTreeNodeMetadata,
  GraphNodeTreeSocketMetadata,
  GraphNodeTreeLinkMetadata
> {
  return Object.freeze({
    frames: plan.frames,
    nodes: Object.freeze(plan.nodes.map((node): Node<
      GraphNodeTreeParameter,
      GraphNodeTreeNodeMetadata,
      GraphNodeTreeSocketMetadata
    > =>
      Object.freeze({
        id: node.id,
        frameId: node.frameId,
        parameters: Object.freeze(node.parameters.map((parameter) => {
          const existing = current.get(parameterKey(node.id, parameter.id))
          if (existing === undefined) {
            return new Parameter(parameter.id, parameter.value, parameter.presentation)
          }
          if (!equalNodeJsonValue(existing.presentation, parameter.presentation)) {
            throw new Error(`Graph projection changed preserved Parameter presentation: ${node.id}/${parameter.id}`)
          }
          return existing
        })),
        sockets: node.sockets,
        metadata: node.metadata,
      }))),
    links: plan.links,
  })
}

function plannedParameterUpdates(
  plan: GraphNodeTreePlan,
  current: ParameterIndex,
): Array<readonly [GraphNodeTreeParameter, NodeJsonValue]> {
  const updates: Array<readonly [GraphNodeTreeParameter, NodeJsonValue]> = []
  for (const node of plan.nodes) {
    for (const parameter of node.parameters) {
      const existing = current.get(parameterKey(node.id, parameter.id))
      if (existing !== undefined && !equalNodeJsonValue(existing.value, parameter.value)) {
        updates.push(Object.freeze([existing, parameter.value] as const))
      }
    }
  }
  return updates
}

function parameterIndex(tree: GraphNodeTree): Map<string, GraphNodeTreeParameter> {
  const result = new Map<string, GraphNodeTreeParameter>()
  for (const node of tree.nodes) {
    for (const parameter of node.parameters ?? []) {
      result.set(parameterKey(node.id, parameter.id), parameter)
    }
  }
  return result
}

function topologyKey(
  definition: NodeTreeDefinition<
    GraphNodeTreeParameter,
    GraphNodeTreeFrameMetadata,
    GraphNodeTreeNodeMetadata,
    GraphNodeTreeSocketMetadata,
    GraphNodeTreeLinkMetadata
  >,
): string {
  return JSON.stringify({
    frames: definition.frames ?? [],
    nodes: definition.nodes.map((node) => ({
      id: node.id,
      ...(node.frameId === undefined ? {} : {frameId: node.frameId}),
      parameters: (node.parameters ?? []).map((parameter) => ({
        id: parameter.id,
        presentation: parameter.presentation,
      })),
      sockets: node.sockets ?? [],
      ...(node.metadata === undefined ? {} : {metadata: node.metadata}),
    })),
    links: definition.links ?? [],
  })
}

function nodeValue(value: unknown, label: string): NodeJsonValue {
  return ownNodeJsonValue(structuredClone(value) as NodeJsonValue, label)
}

function displayValue(value: unknown, label: string): string {
  const source = nodeValue(value, label)
  const display = JSON.stringify(source)
  if (display === undefined) throw new TypeError(`${label} cannot be represented as JSON`)
  return display
}

function nodeObject<const Value extends Record<string, unknown>>(
  value: Value,
  label: string,
): Value & NodeJsonObject {
  return nodeValue(value, label) as Value & NodeJsonObject
}

function parameterKey(nodeId: string, parameterId: string): string {
  return JSON.stringify([nodeId, parameterId])
}

function segment(value: string): string {
  return encodeURIComponent(value)
}

function scopedId(kind: string, ...parts: string[]): string {
  return `${kind}:${parts.map(segment).join("/")}`
}

function linkId(kind: string, ...parts: string[]): string {
  return scopedId(`link-${kind}`, ...parts)
}

function templateFrameId(address: MetaAddress): string {
  return scopedId("frame-template", address)
}

function runtimeFrameId(ref: RuntimeNode["ref"]): string {
  return scopedId("frame-runtime", ref)
}

function templateNodeId(address: MetaAddress): string {
  return scopedId("template", address)
}

function stateNodeId(address: MetaAddress, state: string): string {
  return scopedId("state", address, state)
}

function transitionNodeId(address: MetaAddress, from: string, to: string): string {
  return scopedId("transition", address, from, to)
}

function processNodeId(address: MetaAddress, key: string): string {
  return scopedId("process", address, key)
}

function reactionNodeId(address: MetaAddress, key: string): string {
  return scopedId("reaction-template", address, key)
}

function matterNodeId(address: MetaAddress): string {
  return scopedId("matter", address)
}

function fieldParameterId(key: string): string {
  return scopedId("field", key)
}

function massParameterId(key: string): string {
  return scopedId("mass", key)
}

function runtimeMassParameterId(ref: string): string {
  return scopedId("runtime-mass", ref)
}

function runtimeReactionParameterId(ref: string): string {
  return scopedId("runtime-reaction", ref)
}

function conditionParameterId(field: string): string {
  return scopedId("condition", field)
}

function conditionSocketId(field: string): string {
  return scopedId("condition", field)
}

function fieldReadSocketId(key: string): string {
  return scopedId("field-read", key)
}

function fieldWriteSocketId(key: string): string {
  return scopedId("field-write", key)
}

function massReadSocketId(key: string): string {
  return scopedId("mass-read", key)
}

function massWriteSocketId(key: string): string {
  return scopedId("mass-write", key)
}

function dependencySocketId(mode: "read" | "write", key: string): string {
  return scopedId(`dependency-${mode}`, key)
}

function reactionDependencySocketId(kind: string, key: string): string {
  return scopedId(`reaction-${kind}`, key)
}

function runtimeReactionSocketId(key: string): string {
  return scopedId("reaction", key)
}

function matterOwner(pointer: DocumentPointer): MetaAddress | null {
  const tokens = pointer.slice(1).split("/").slice(1).map(pointerToken)
  if (tokens[0] !== "template" || tokens.length < 3 || tokens[2] !== "matter") return null
  return tokens[1] as MetaAddress
}

function pointerToken(value: string): string {
  return value.replaceAll("~1", "/").replaceAll("~0", "~")
}
