/**
Pure ref-based difference and atomic application for complete public Graph.

The module temporarily indexes a validated nested Graph by public refs. The
index exists only during one function call: Dark does not retain a Graph mirror
or create another Store. JSON Pointer remains readable declaration metadata and
never becomes a delta target.

@packageDocumentation
*/

import {createHash} from "node:crypto"
import {
  GRAPH_DELTA_SCHEMA,
  validateGraph,
  validateGraphDelta,
  type Graph,
  type GraphDelta,
  type GraphDeltaChange,
  type GraphDigest,
  type MetaAddress,
  type MetaTemplate,
  type ReactionRelationRef,
  type RuntimeNode,
  type RuntimeNodeHead,
  type RuntimeNodeRef,
  type RuntimeReactionRelation,
} from "@metafor/types/metafor/graph"

/** Fail-closed error from Graph validation, ref application or digest proof. */
export class GraphDeltaError extends Error {
  override readonly name = "GraphDeltaError"

  constructor(
    readonly code: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
  }
}

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | {[key: string]: JsonValue}

type ChildRefs = RuntimeNodeRef[] | null

type GraphIndex = {
  root: MetaAddress
  templates: Map<MetaAddress, MetaTemplate>
  nodes: Map<RuntimeNodeRef, RuntimeNodeHead>
  children: Map<RuntimeNodeRef | null, ChildRefs>
  relations: Map<ReactionRelationRef, RuntimeReactionRelation>
  reactionOrder: ReactionRelationRef[]
}

const clone = <T>(value: T): T => structuredClone(value)

const utf16Compare = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0

const canonicalString = (value: JsonValue): string => {
  if (value === null) return "null"
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map(canonicalString).join(",")}]`
  return `{${Object.keys(value)
    .toSorted(utf16Compare)
    .map((key) => `${JSON.stringify(key)}:${canonicalString(value[key]!)}`)
    .join(",")}}`
}

const issues = (input: {issues: Array<{path: string; code: string}>}): string =>
  input.issues.map(({path, code}) => `${path || "/"}:${code}`).join(", ")

const validatedGraph = (input: unknown, role: "base" | "result"): Graph => {
  const validation = validateGraph(input)
  if (!validation.ok) {
    throw new GraphDeltaError(
      `invalid_${role}`,
      `GraphDelta ${role} Graph is invalid: ${issues(validation)}`,
    )
  }
  return clone(validation.value)
}

const digestValidatedGraph = (graph: Graph): GraphDigest =>
  `sha256:${createHash("sha256")
    .update(new TextEncoder().encode(canonicalString(graph as unknown as JsonValue)))
    .digest("hex")}`

const sameJson = (left: unknown, right: unknown): boolean =>
  canonicalString(left as JsonValue) === canonicalString(right as JsonValue)

const runtimeNodeHead = (node: RuntimeNode): RuntimeNodeHead => {
  const value = clone(node) as RuntimeNode & {children?: RuntimeNode[]}
  delete value.children
  return value
}

const indexGraph = (graph: Graph): GraphIndex => {
  const nodes = new Map<RuntimeNodeRef, RuntimeNodeHead>()
  const children = new Map<RuntimeNodeRef | null, ChildRefs>()

  const visit = (node: RuntimeNode): void => {
    if (nodes.has(node.ref)) {
      throw new GraphDeltaError("duplicate_ref", `Runtime node ref is duplicated: ${node.ref}`)
    }
    nodes.set(node.ref, runtimeNodeHead(node))
    children.set(
      node.ref,
      node.children === undefined ? null : node.children.map(({ref}) => ref),
    )
    node.children?.forEach(visit)
  }

  children.set(null, graph.runtime.roots.map(({ref}) => ref))
  graph.runtime.roots.forEach(visit)

  const relations = new Map<ReactionRelationRef, RuntimeReactionRelation>()
  const reactionOrder: ReactionRelationRef[] = []
  for (const relation of graph.runtime.reactions) {
    if (relations.has(relation.ref)) {
      throw new GraphDeltaError("duplicate_ref", `Reaction relation ref is duplicated: ${relation.ref}`)
    }
    relations.set(relation.ref, clone(relation))
    reactionOrder.push(relation.ref)
  }

  return {
    root: graph.root,
    templates: new Map(
      Object.entries(graph.template).map(([address, template]) =>
        [address as MetaAddress, clone(template)]
      ),
    ),
    nodes,
    children,
    relations,
    reactionOrder,
  }
}

const sortedKeys = <Key extends string>(...maps: Array<ReadonlyMap<Key, unknown>>): Key[] =>
  [...new Set(maps.flatMap((map) => [...map.keys()]))].toSorted(utf16Compare)

const sortedParents = (
  ...maps: Array<ReadonlyMap<RuntimeNodeRef | null, unknown>>
): Array<RuntimeNodeRef | null> =>
  [...new Set(maps.flatMap((map) => [...map.keys()]))]
    .toSorted((left, right) => {
      if (left === null) return right === null ? 0 : -1
      if (right === null) return 1
      return utf16Compare(left, right)
    })

const requirePresent = (
  present: boolean,
  code: string,
  message: string,
): void => {
  if (!present) throw new GraphDeltaError(code, message)
}

const buildGraph = (index: GraphIndex): Graph => {
  const rootRefs = index.children.get(null)
  if (!Array.isArray(rootRefs)) {
    throw new GraphDeltaError("missing_runtime_roots", "GraphDelta result has no runtime root list")
  }

  for (const parent of index.children.keys()) {
    if (parent !== null && !index.nodes.has(parent)) {
      throw new GraphDeltaError("dangling_parent", `Children target has no runtime node: ${parent}`)
    }
  }

  const visiting = new Set<RuntimeNodeRef>()
  const visited = new Set<RuntimeNodeRef>()
  const visit = (ref: RuntimeNodeRef): RuntimeNode => {
    if (visiting.has(ref)) {
      throw new GraphDeltaError("runtime_cycle", `Runtime containment cycle reaches ${ref}`)
    }
    if (visited.has(ref)) {
      throw new GraphDeltaError("multiple_runtime_parents", `Runtime node is placed more than once: ${ref}`)
    }
    const head = index.nodes.get(ref)
    if (!head) throw new GraphDeltaError("dangling_child", `Runtime child ref is unavailable: ${ref}`)
    const childRefs = index.children.get(ref)
    if (childRefs === undefined) {
      throw new GraphDeltaError("missing_children_state", `Runtime node children state is unavailable: ${ref}`)
    }
    visiting.add(ref)
    const node = clone(head) as RuntimeNode
    if (childRefs !== null) {
      const unique = new Set(childRefs)
      if (unique.size !== childRefs.length) {
        throw new GraphDeltaError("duplicate_child", `Runtime child list contains a duplicate ref: ${ref}`)
      }
      node.children = childRefs.map(visit)
    }
    visiting.delete(ref)
    visited.add(ref)
    return node
  }

  const roots = rootRefs.map(visit)
  if (visited.size !== index.nodes.size) {
    const unreachable = [...index.nodes.keys()].filter((ref) => !visited.has(ref)).toSorted(utf16Compare)
    throw new GraphDeltaError(
      "unreachable_runtime_node",
      `Runtime nodes are unreachable from roots: ${unreachable.join(", ")}`,
    )
  }

  if (new Set(index.reactionOrder).size !== index.reactionOrder.length) {
    throw new GraphDeltaError("duplicate_reaction_order", "Reaction relation order contains duplicate refs")
  }
  const reactions = index.reactionOrder.map((ref) => {
    const relation = index.relations.get(ref)
    if (!relation) {
      throw new GraphDeltaError("dangling_reaction_order", `Reaction order ref is unavailable: ${ref}`)
    }
    return clone(relation)
  })
  if (reactions.length !== index.relations.size) {
    const unordered = [...index.relations.keys()]
      .filter((ref) => !index.reactionOrder.includes(ref))
      .toSorted(utf16Compare)
    throw new GraphDeltaError(
      "unordered_reaction_relation",
      `Reaction relations are absent from order: ${unordered.join(", ")}`,
    )
  }

  const template = {} as Graph["template"]
  for (const [address, value] of index.templates) template[address] = clone(value)
  const candidate: Graph = {
    schema: "metafor/graph",
    root: index.root,
    template,
    runtime: {roots, reactions},
  }
  const validation = validateGraph(candidate)
  if (!validation.ok) {
    throw new GraphDeltaError(
      "invalid_result",
      `GraphDelta result Graph is invalid: ${issues(validation)}`,
    )
  }
  return validation.value
}

const removeChanges = (
  base: GraphIndex,
  result: GraphIndex,
): GraphDeltaChange[] => {
  const changes: GraphDeltaChange[] = []
  for (const ref of sortedKeys(base.templates, result.templates)) {
    if (!result.templates.has(ref)) changes.push({op: "remove", target: {kind: "template", ref}})
  }
  for (const ref of sortedKeys(base.nodes, result.nodes)) {
    if (!result.nodes.has(ref)) changes.push({op: "remove", target: {kind: "runtime-node", ref}})
  }
  for (const ref of sortedKeys(base.relations, result.relations)) {
    if (!result.relations.has(ref)) {
      changes.push({op: "remove", target: {kind: "reaction-relation", ref}})
    }
  }
  return changes
}

const writeChanges = (
  base: GraphIndex,
  result: GraphIndex,
): GraphDeltaChange[] => {
  const changes: GraphDeltaChange[] = []
  for (const ref of sortedKeys(base.templates, result.templates)) {
    const before = base.templates.get(ref)
    const after = result.templates.get(ref)
    if (after === undefined || (before !== undefined && sameJson(before, after))) continue
    changes.push({
      op: before === undefined ? "add" : "replace",
      target: {kind: "template", ref},
      value: clone(after),
    })
  }
  for (const ref of sortedKeys(base.nodes, result.nodes)) {
    const before = base.nodes.get(ref)
    const after = result.nodes.get(ref)
    if (after === undefined || (before !== undefined && sameJson(before, after))) continue
    changes.push({
      op: before === undefined ? "add" : "replace",
      target: {kind: "runtime-node", ref},
      value: clone(after),
    })
  }
  for (const parent of sortedParents(base.children, result.children)) {
    const before = base.children.get(parent)
    const after = result.children.get(parent)
    if (after === undefined) continue
    if (before === undefined && after === null && parent !== null) continue
    if (before !== undefined && sameJson(before, after)) continue
    changes.push({
      op: "replace",
      target: {kind: "children", parent},
      value: clone(after),
    })
  }
  for (const ref of sortedKeys(base.relations, result.relations)) {
    const before = base.relations.get(ref)
    const after = result.relations.get(ref)
    if (after === undefined || (before !== undefined && sameJson(before, after))) continue
    changes.push({
      op: before === undefined ? "add" : "replace",
      target: {kind: "reaction-relation", ref},
      value: clone(after),
    })
  }
  if (!sameJson(base.reactionOrder, result.reactionOrder)) {
    changes.push({
      op: "replace",
      target: {kind: "reaction-order"},
      value: clone(result.reactionOrder),
    })
  }
  return changes
}

/**
Computes canonical SHA-256 identity for one complete validated Graph.

@param input - Closed public Graph. Invalid or non-JSON data fail closed.
@returns Digest over deterministic UTF-8 bytes with sorted object keys.
@throws {@link GraphDeltaError} when `input` is not a valid complete Graph.
*/
export function graphDigest(input: unknown): GraphDigest {
  return digestValidatedGraph(validatedGraph(input, "base"))
}

/**
Computes one deterministic semantic delta without retaining either snapshot.

Templates remain atomic by `MetaAddress`; runtime placement is separated into
ordered ref lists, so an array position is never a target identity.

@param baseInput - Complete Graph expected by the consumer before application.
@param resultInput - Complete Graph that application must reproduce exactly.
@returns Closed structural delta guarded by canonical base and result digests.
@throws {@link GraphDeltaError} for invalid Graphs or a root change.
*/
export function diffGraph(
  baseInput: unknown,
  resultInput: unknown,
): GraphDelta {
  const base = validatedGraph(baseInput, "base")
  const result = validatedGraph(resultInput, "result")
  if (base.root !== result.root) {
    throw new GraphDeltaError(
      "root_mismatch",
      `GraphDelta cannot cross roots: ${base.root} -> ${result.root}`,
    )
  }
  const baseIndex = indexGraph(base)
  const resultIndex = indexGraph(result)
  const delta: GraphDelta = {
    schema: GRAPH_DELTA_SCHEMA,
    root: base.root,
    baseDigest: digestValidatedGraph(base),
    resultDigest: digestValidatedGraph(result),
    changes: [
      ...removeChanges(baseIndex, resultIndex),
      ...writeChanges(baseIndex, resultIndex),
    ],
  }
  const validation = validateGraphDelta(delta)
  if (!validation.ok) {
    throw new GraphDeltaError(
      "invalid_delta",
      `Generated GraphDelta is invalid: ${issues(validation)}`,
    )
  }
  return validation.value
}

const applyTemplateChange = (
  index: GraphIndex,
  change: Extract<GraphDeltaChange, {target: {kind: "template"}}>,
): void => {
  const present = index.templates.has(change.target.ref)
  if (change.op === "add") {
    requirePresent(!present, "add_conflict", `Template already exists: ${change.target.ref}`)
    index.templates.set(change.target.ref, clone(change.value))
  } else if (change.op === "replace") {
    requirePresent(present, "replace_missing", `Template is unavailable: ${change.target.ref}`)
    index.templates.set(change.target.ref, clone(change.value))
  } else {
    requirePresent(present, "remove_missing", `Template is unavailable: ${change.target.ref}`)
    index.templates.delete(change.target.ref)
  }
}

const applyRuntimeNodeChange = (
  index: GraphIndex,
  change: Extract<GraphDeltaChange, {target: {kind: "runtime-node"}}>,
): void => {
  const present = index.nodes.has(change.target.ref)
  if (change.op === "add") {
    requirePresent(!present, "add_conflict", `Runtime node already exists: ${change.target.ref}`)
    index.nodes.set(change.target.ref, clone(change.value))
    index.children.set(change.target.ref, null)
  } else if (change.op === "replace") {
    requirePresent(present, "replace_missing", `Runtime node is unavailable: ${change.target.ref}`)
    index.nodes.set(change.target.ref, clone(change.value))
  } else {
    requirePresent(present, "remove_missing", `Runtime node is unavailable: ${change.target.ref}`)
    index.nodes.delete(change.target.ref)
    index.children.delete(change.target.ref)
  }
}

const applyReactionChange = (
  index: GraphIndex,
  change: Extract<GraphDeltaChange, {target: {kind: "reaction-relation"}}>,
): void => {
  const present = index.relations.has(change.target.ref)
  if (change.op === "add") {
    requirePresent(!present, "add_conflict", `Reaction relation already exists: ${change.target.ref}`)
    index.relations.set(change.target.ref, clone(change.value))
  } else if (change.op === "replace") {
    requirePresent(present, "replace_missing", `Reaction relation is unavailable: ${change.target.ref}`)
    index.relations.set(change.target.ref, clone(change.value))
  } else {
    requirePresent(present, "remove_missing", `Reaction relation is unavailable: ${change.target.ref}`)
    index.relations.delete(change.target.ref)
  }
}

/**
Applies one GraphDelta atomically to a detached ref index.

No partial Graph escapes: target preconditions, containment reachability,
cycles, complete Graph validation and the result digest all pass before return.

@param baseInput - Complete Graph whose canonical digest must equal `baseDigest`.
@param deltaInput - Closed ref-based delta produced for the same root.
@returns New validated nested Graph; `baseInput` is never mutated.
@throws {@link GraphDeltaError} on any structural, semantic or digest mismatch.
*/
export function applyGraphDelta(
  baseInput: unknown,
  deltaInput: unknown,
): Graph {
  const base = validatedGraph(baseInput, "base")
  const deltaValidation = validateGraphDelta(deltaInput)
  if (!deltaValidation.ok) {
    throw new GraphDeltaError(
      "invalid_delta",
      `GraphDelta structure is invalid: ${issues(deltaValidation)}`,
    )
  }
  const delta = clone(deltaValidation.value)
  if (delta.root !== base.root) {
    throw new GraphDeltaError(
      "root_mismatch",
      `GraphDelta root differs: expected ${base.root}, received ${delta.root}`,
    )
  }
  const actualBaseDigest = digestValidatedGraph(base)
  if (delta.baseDigest !== actualBaseDigest) {
    throw new GraphDeltaError(
      "base_digest_mismatch",
      `GraphDelta base digest differs: expected ${delta.baseDigest}, received ${actualBaseDigest}`,
    )
  }

  const index = indexGraph(base)
  for (const change of delta.changes) {
    if (change.target.kind === "template") {
      applyTemplateChange(
        index,
        change as Extract<GraphDeltaChange, {target: {kind: "template"}}>,
      )
    } else if (change.target.kind === "runtime-node") {
      applyRuntimeNodeChange(
        index,
        change as Extract<GraphDeltaChange, {target: {kind: "runtime-node"}}>,
      )
    } else if (change.target.kind === "reaction-relation") {
      applyReactionChange(
        index,
        change as Extract<GraphDeltaChange, {target: {kind: "reaction-relation"}}>,
      )
    }
  }
  for (const change of delta.changes) {
    if (change.target.kind === "children") {
      const children = change as Extract<GraphDeltaChange, {target: {kind: "children"}}>
      index.children.set(children.target.parent, clone(children.value))
    } else if (change.target.kind === "reaction-order") {
      const order = change as Extract<GraphDeltaChange, {target: {kind: "reaction-order"}}>
      index.reactionOrder = clone(order.value)
    }
  }

  const result = buildGraph(index)
  const actualResultDigest = digestValidatedGraph(result)
  if (delta.resultDigest !== actualResultDigest) {
    throw new GraphDeltaError(
      "result_digest_mismatch",
      `GraphDelta result digest differs: expected ${delta.resultDigest}, received ${actualResultDigest}`,
    )
  }
  return result
}
