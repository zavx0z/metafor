import type { NodeMeta, NodeType } from "@metafor/dsl"
import type { PreparedEntanglementProjection } from "../../boundary/fields/entangled.t"
import type {
  FlatGravityActor,
  FlatGravityGraph,
  FlatGravityLink,
  FlatGravityScope,
  GravityActorProjection,
  GravityEntanglementPayload,
  GravityProjectionActorNode,
  GravityProjectionNode,
  GravityProjectionScopeNode,
  GravityRuntimeMatch,
  GravityScopeKind,
  RuntimeActorSnapshot,
  StrongEntanglementBlock,
  StrongEntanglementField,
  StrongEntanglementPlan,
} from "./strong.t"

type ProjectionContext = {
  scopeStack: GravityProjectionScopeNode[]
  actorStack: GravityProjectionActorNode[]
  parentKey: string
  siblingCounters: Map<string, number>
}

const toArray = (value: string | string[] | undefined): string[] => {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

const unique = <T>(values: T[]): T[] => Array.from(new Set(values))

const sanitizeSegment = (value: string): string =>
  value.replace(/[^a-zA-Z0-9:_-]+/g, "-").replace(/-+/g, "-")

const toLeafField = (fieldPath: string): string | null => {
  if (!fieldPath || fieldPath === "[index]" || fieldPath.startsWith("/mass/")) return null
  const normalized = fieldPath
    .replace(/^\/fields\//, "")
    .replace(/^\.\.\//g, "")
    .replace(/^\[item\]\//, "")
    .replace(/\.\.\//g, "")
    .replace(/\[item\]\//g, "")
    .replace(/\//g, ".")

  if (!normalized || normalized.startsWith("mass/")) return null
  const parts = normalized.split(".").filter(Boolean)
  return parts.length > 0 ? parts.join(".") : null
}

const extractFieldRefs = (paths: string[]): string[] =>
  unique(
    paths
      .map((path) => toLeafField(path))
      .filter((path): path is string => path !== null),
  )

const extractValueDataPaths = (value: unknown): string[] => {
  if (!value || typeof value !== "object") return []
  if ("data" in value) {
    return toArray((value as { data?: string | string[] }).data)
  }
  return []
}

const extractValueExpr = (value: unknown): string | undefined => {
  if (!value || typeof value !== "object" || !("expr" in value)) return undefined
  const expr = (value as { expr?: string }).expr
  return expr || undefined
}

const stringifyTag = (tag: unknown): string => {
  if (typeof tag === "string") return tag
  if (tag && typeof tag === "object" && "expr" in tag) {
    return String((tag as { expr?: string }).expr ?? "meta")
  }
  return "meta"
}

const nextSegment = (counters: Map<string, number>, prefix: string): string => {
  const current = counters.get(prefix) ?? 0
  counters.set(prefix, current + 1)
  return `${prefix}[${current}]`
}

const payloadSemanticKey = (kind: string, sourcePaths: string[], expr?: string): string =>
  `${kind}:${sourcePaths.join("|")}:${expr ?? ""}`

const createPayload = (
  payloads: GravityEntanglementPayload[],
  ownerId: string,
  ownerKey: string,
  kind: "scope" | "fields",
  sourcePaths: string[],
  scopeLineageKeys: string[],
  actorLineageKeys: string[],
  expr?: string,
): GravityEntanglementPayload | null => {
  const fieldRefs = extractFieldRefs(sourcePaths)
  if (fieldRefs.length === 0) return null

  const payload: GravityEntanglementPayload = {
    id: `payload:${payloads.length}`,
    kind,
    ownerId,
    ownerKey,
    sourcePaths,
    fieldRefs,
    semanticKey: payloadSemanticKey(kind, sourcePaths, expr),
    scopeLineageKeys,
    actorLineageKeys,
    ...(expr ? { expr } : {}),
  }
  payloads.push(payload)
  return payload
}

function collectProjectionNodes(
  nodes: NodeType[],
  payloads: GravityEntanglementPayload[],
  context: ProjectionContext,
): GravityProjectionNode[] {
  const result: GravityProjectionNode[] = []

  for (const node of nodes) {
    switch (node.type) {
      case "map":
      case "cond":
      case "log": {
        const segment = nextSegment(context.siblingCounters, node.type)
        const key = `${context.parentKey}/${segment}`
        const sourcePaths = toArray(node.data)
        const scopeNode: GravityProjectionScopeNode = {
          nodeKind: "scope",
          id: `scope:${payloads.length}:${result.length}`,
          kind: node.type as GravityScopeKind,
          key,
          dataPaths: sourcePaths,
          fieldRefs: extractFieldRefs(sourcePaths),
          payloadIds: [],
          children: [],
          ...("expr" in node && node.expr ? { expr: node.expr } : {}),
        }

        const payload = createPayload(
          payloads,
          scopeNode.id,
          scopeNode.key,
          "scope",
          sourcePaths,
          context.scopeStack.map((item) => item.key),
          context.actorStack.map((item) => item.key),
          "expr" in node ? node.expr : undefined,
        )
        if (payload) {
          scopeNode.payloadIds.push(payload.id)
        }

        scopeNode.children = collectProjectionNodes(node.child, payloads, {
          scopeStack: [...context.scopeStack, scopeNode],
          actorStack: context.actorStack,
          parentKey: key,
          siblingCounters: new Map(),
        })
        result.push(scopeNode)
        break
      }
      case "meta": {
        const tag = stringifyTag(node.tag)
        const segment = nextSegment(context.siblingCounters, `meta:${sanitizeSegment(tag)}`)
        const key = `${context.parentKey}/${segment}`
        const sourcePaths = extractValueDataPaths(node.fields)
        const actorNode: GravityProjectionActorNode = {
          nodeKind: "actor",
          id: `actor:${payloads.length}:${result.length}`,
          manifestIndex: 0,
          key,
          tag,
          dataPaths: sourcePaths,
          fieldRefs: extractFieldRefs(sourcePaths),
          payloadIds: [],
          inheritedPayloadIds: unique(context.scopeStack.flatMap((scope) => scope.payloadIds)),
          children: [],
        }

        const payload = createPayload(
          payloads,
          actorNode.id,
          actorNode.key,
          "fields",
          sourcePaths,
          context.scopeStack.map((item) => item.key),
          context.actorStack.map((item) => item.key),
          extractValueExpr(node.fields),
        )
        if (payload) {
          actorNode.payloadIds.push(payload.id)
        }

        actorNode.children = collectProjectionNodes((node as NodeMeta).child ?? [], payloads, {
          scopeStack: context.scopeStack,
          actorStack: [...context.actorStack, actorNode],
          parentKey: key,
          siblingCounters: new Map(),
        })
        result.push(actorNode)
        break
      }
      case "el":
        result.push(...collectProjectionNodes(node.child ?? [], payloads, context))
        break
      default:
        break
    }
  }

  return result
}

export function projectGravityActors(source: NodeType[]): GravityActorProjection {
  const payloads: GravityEntanglementPayload[] = []
  const roots = collectProjectionNodes(source, payloads, {
    scopeStack: [],
    actorStack: [],
    parentKey: "root",
    siblingCounters: new Map(),
  })

  return { roots, payloads }
}

function flattenProjection(
  nodes: GravityProjectionNode[],
  projection: GravityActorProjection,
  scopes: FlatGravityScope[],
  actors: FlatGravityActor[],
  links: FlatGravityLink[],
  context: {
    scopeStack: FlatGravityScope[]
    actorStack: FlatGravityActor[]
  },
): void {
  const payloadById = new Map(projection.payloads.map((payload) => [payload.id, payload]))

  for (const node of nodes) {
    if (node.nodeKind === "scope") {
      const scope: FlatGravityScope = {
        id: `scope:${scopes.length}`,
        kind: node.kind,
        key: node.key,
        dataPaths: node.dataPaths,
        fieldRefs: node.fieldRefs,
        payloadIds: node.payloadIds,
        actorIds: [],
        scopeIds: context.scopeStack.map((item) => item.id),
        ...(node.expr ? { expr: node.expr } : {}),
        ...(context.scopeStack.at(-1)?.id ? { parentScopeId: context.scopeStack.at(-1)!.id } : {}),
        ...(context.actorStack.at(-1)?.id ? { parentActorId: context.actorStack.at(-1)!.id } : {}),
      }
      scopes.push(scope)

      if (scope.parentScopeId) {
        links.push({
          kind: "scope",
          from: scope.parentScopeId,
          to: scope.id,
          payloadIds: [...scope.payloadIds],
        })
      }
      if (scope.parentActorId) {
        links.push({
          kind: "scope",
          from: scope.parentActorId,
          to: scope.id,
          payloadIds: [...scope.payloadIds],
        })
      }

      flattenProjection(node.children, projection, scopes, actors, links, {
        scopeStack: [...context.scopeStack, scope],
        actorStack: context.actorStack,
      })
      continue
    }

    const manifestIndex = actors.length
    const inheritedPayloadIds = unique(context.scopeStack.flatMap((scope) => scope.payloadIds))
    const actorPayloadIds = [...node.payloadIds]
    const entanglementPayloadIds = unique([...inheritedPayloadIds, ...actorPayloadIds])
    const actor: FlatGravityActor = {
      id: `actor:${manifestIndex}`,
      manifestIndex,
      key: node.key,
      tag: node.tag,
      dataPaths: node.dataPaths,
      fieldRefs: unique(
        entanglementPayloadIds.flatMap((payloadId) => payloadById.get(payloadId)?.fieldRefs ?? []),
      ),
      scopeIds: context.scopeStack.map((scope) => scope.id),
      payloadIds: actorPayloadIds,
      entanglementPayloadIds,
      ...(context.actorStack.at(-1)?.id ? { parentActorId: context.actorStack.at(-1)!.id } : {}),
      ...(context.scopeStack.at(-1)?.id ? { parentScopeId: context.scopeStack.at(-1)!.id } : {}),
    }
    actors.push(actor)
    context.scopeStack.forEach((scope) => {
      scope.actorIds.push(actor.id)
    })

    if (actor.parentActorId) {
      links.push({
        kind: "hierarchy",
        from: actor.parentActorId,
        to: actor.id,
        payloadIds: [...actor.entanglementPayloadIds],
      })
    }
    if (actor.parentScopeId) {
      links.push({
        kind: "scope",
        from: actor.parentScopeId,
        to: actor.id,
        payloadIds: [...actor.entanglementPayloadIds],
      })
    }

    flattenProjection(node.children, projection, scopes, actors, links, {
      scopeStack: context.scopeStack,
      actorStack: [...context.actorStack, actor],
    })
  }
}

export function flattenGravity(source: NodeType[]): FlatGravityGraph {
  const projection = projectGravityActors(source)
  const scopes: FlatGravityScope[] = []
  const actors: FlatGravityActor[] = []
  const links: FlatGravityLink[] = []

  flattenProjection(projection.roots, projection, scopes, actors, links, {
    scopeStack: [],
    actorStack: [],
  })

  return {
    source,
    projection,
    scopes,
    actors,
    links,
    payloads: projection.payloads,
  }
}

const buildActorAdjacency = (graph: FlatGravityGraph): Map<string, Set<string>> => {
  const adjacency = new Map<string, Set<string>>()
  graph.actors.forEach((actor) => adjacency.set(actor.id, new Set()))

  graph.actors.forEach((actor) => {
    if (actor.parentActorId) {
      adjacency.get(actor.id)!.add(actor.parentActorId)
      adjacency.get(actor.parentActorId)!.add(actor.id)
    }
  })

  graph.scopes.forEach((scope) => {
    const members = unique(scope.actorIds)
    if (members.length < 2) return
    const first = members[0]!
    for (let index = 1; index < members.length; index++) {
      const current = members[index]!
      adjacency.get(first)!.add(current)
      adjacency.get(current)!.add(first)
    }
  })

  return adjacency
}

const resolveRuntimeField = (fieldRef: string, runtime: RuntimeActorSnapshot): string | null => {
  const mapped = runtime.binding?.fieldMap?.[fieldRef]
  if (mapped && runtime.fieldNames.includes(mapped)) return mapped
  if (runtime.fieldNames.includes(fieldRef)) return fieldRef

  const leaf = fieldRef.split(".").at(-1)
  if (leaf && runtime.fieldNames.includes(leaf)) return leaf
  return null
}

const buildBindings = (
  graph: FlatGravityGraph,
  runtimeActors: RuntimeActorSnapshot[],
): {
  matches: GravityRuntimeMatch[]
  graphToRuntime: Map<string, RuntimeActorSnapshot>
} => {
  const graphByKey = new Map(graph.actors.map((actor) => [actor.key, actor]))
  const matches: GravityRuntimeMatch[] = []
  const graphToRuntime = new Map<string, RuntimeActorSnapshot>()

  runtimeActors.forEach((runtime) => {
    const actorKey = runtime.binding?.actorKey
    if (!actorKey) return
    const actor = graphByKey.get(actorKey)
    if (!actor) return

    matches.push({
      actorId: runtime.actorId,
      braneIndex: runtime.braneIndex,
      actorKey,
      graphActorId: actor.id,
      runtimeFieldNames: runtime.fieldNames,
    })
    graphToRuntime.set(actor.id, runtime)
  })

  return { matches, graphToRuntime }
}

const connectedComponents = (
  graphActorIds: string[],
  targetActorIds: string[],
  adjacency: Map<string, Set<string>>,
): string[][] => {
  const remainingTargets = new Set(targetActorIds)
  const visited = new Set<string>()
  const result: string[][] = []

  while (remainingTargets.size > 0) {
    const [start] = remainingTargets
    const queue = [start!]
    const component: string[] = []

    while (queue.length > 0) {
      const current = queue.shift()!
      if (visited.has(current)) continue
      visited.add(current)
      if (remainingTargets.has(current)) {
        remainingTargets.delete(current)
        component.push(current)
      }

      const neighbours = adjacency.get(current) ?? new Set<string>()
      neighbours.forEach((neighbour) => {
        if (graphActorIds.includes(neighbour) && !visited.has(neighbour)) {
          queue.push(neighbour)
        }
      })
    }

    result.push(component)
  }

  return result
}

export function buildStrongEntanglement(
  graph: FlatGravityGraph,
  runtimeActors: RuntimeActorSnapshot[],
): StrongEntanglementPlan {
  const { matches, graphToRuntime } = buildBindings(graph, runtimeActors)
  const adjacency = buildActorAdjacency(graph)
  const blocksByMembership = new Map<string, StrongEntanglementBlock>()

  const payloadGroups = new Map<string, GravityEntanglementPayload[]>()
  graph.payloads.forEach((payload) => {
    const group = payloadGroups.get(payload.semanticKey) ?? []
    group.push(payload)
    payloadGroups.set(payload.semanticKey, group)
  })

  payloadGroups.forEach((payloadGroup, semanticKey) => {
    const payloadIds = payloadGroup.map((payload) => payload.id)
    const fieldRefs = unique(payloadGroup.flatMap((payload) => payload.fieldRefs))
    const actorIds = graph.actors
      .filter((actor) =>
        actor.entanglementPayloadIds.some((payloadId) => payloadIds.includes(payloadId)) &&
        graphToRuntime.has(actor.id),
      )
      .map((actor) => actor.id)

    if (actorIds.length < 2) return

    connectedComponents(
      graph.actors.map((actor) => actor.id),
      actorIds,
      adjacency,
    ).forEach((component) => {
      if (component.length < 2) return

      const entries = component
        .map((actorId) => {
          const actor = graph.actors.find((candidate) => candidate.id === actorId)!
          const runtime = graphToRuntime.get(actorId)!
          return { actor, runtime }
        })
        .sort((left, right) => left.runtime.braneIndex - right.runtime.braneIndex)

      const braneIndices = entries.map(({ runtime }) => runtime.braneIndex)
      const actorNodeIds = entries.map(({ actor }) => actor.id)
      const runtimeActorIds = entries.map(({ runtime }) => runtime.actorId)
      const scopeIds = unique(entries.flatMap(({ actor }) => actor.scopeIds)).sort()
      const membershipKey = braneIndices.join(",")

      const resolvedFieldsByActor = entries.map(({ runtime }) =>
        fieldRefs
          .map((fieldRef) => ({
            fieldRef,
            fieldName: resolveRuntimeField(fieldRef, runtime),
          }))
          .filter((item): item is { fieldRef: string; fieldName: string } => item.fieldName !== null),
      )

      const allResolvedFieldNames = unique(
        resolvedFieldsByActor.flatMap((items) => items.map((item) => item.fieldName)),
      )
      const sharedFieldNames = allResolvedFieldNames.filter((fieldName) =>
        resolvedFieldsByActor.every((items) => items.some((item) => item.fieldName === fieldName)),
      )

      const fields: StrongEntanglementField[] = sharedFieldNames.map((fieldName) => {
        const resolvedFieldRefs = unique(
          resolvedFieldsByActor.flatMap((items) =>
            items.filter((item) => item.fieldName === fieldName).map((item) => item.fieldRef),
          ),
        )
        return {
          fieldName,
          fieldRef: resolvedFieldRefs[0]!,
          payloadIds: [...payloadIds].sort(),
          semanticKeys: [semanticKey],
          representativeBraneIndex: braneIndices[0]!,
        }
      })

      const existing = blocksByMembership.get(membershipKey)
      if (existing) {
        existing.payloadIds = unique([...existing.payloadIds, ...payloadIds]).sort()
        existing.membershipSemanticKeys = unique([...existing.membershipSemanticKeys, semanticKey]).sort()
        existing.scopeIds = unique([...existing.scopeIds, ...scopeIds]).sort()

        fields.forEach((field) => {
          const prev = existing.fields.find((candidate) => candidate.fieldName === field.fieldName)
          if (prev) {
            prev.payloadIds = unique([...prev.payloadIds, ...field.payloadIds]).sort()
            prev.semanticKeys = unique([...prev.semanticKeys, ...field.semanticKeys]).sort()
          } else {
            existing.fields.push(field)
          }
        })
        return
      }

      blocksByMembership.set(membershipKey, {
        key: membershipKey,
        actorNodeIds,
        runtimeActorIds,
        braneIndices,
        fields,
        scopeIds,
        payloadIds: [...payloadIds].sort(),
        membershipSemanticKeys: [semanticKey],
      })
    })
  })

  return {
    graph,
    bindings: matches,
    blocks: Array.from(blocksByMembership.values())
      .map((block) => ({
        ...block,
        fields: [...block.fields].sort((left, right) => left.fieldName.localeCompare(right.fieldName)),
        payloadIds: unique(block.payloadIds).sort(),
        membershipSemanticKeys: unique(block.membershipSemanticKeys).sort(),
      }))
      .sort((left, right) => left.key.localeCompare(right.key)),
  }
}

export function projectEntanglementToBoundary(
  plan: StrongEntanglementPlan,
  fieldNameIndex: Map<string, number>,
): PreparedEntanglementProjection {
  return {
    blocks: plan.blocks
      .map((block) => ({
        key: block.key,
        braneIndices: block.braneIndices,
        fields: block.fields
          .map((field) => {
            const fieldIndex = fieldNameIndex.get(field.fieldName)
            if (fieldIndex === undefined) return null
            return {
              fieldIndex,
              fieldName: field.fieldName,
              payloadIds: field.payloadIds,
              semanticKeys: field.semanticKeys,
              representativeBraneIndex: field.representativeBraneIndex,
            }
          })
          .filter((field): field is NonNullable<typeof field> => field !== null),
      }))
      .filter((block) => block.fields.length > 0 && block.braneIndices.length > 1),
  }
}
