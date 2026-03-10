import type { NodeType } from "@metafor/dsl"
import type { PreparedEntanglementProjection } from "../../boundary/fields/entangled.t"
import type {
  FlatGravityActor,
  FlatGravityGraph,
  FlatGravityLink,
  FlatGravityScope,
  RuntimeActorSnapshot,
  StrongEntanglementBlock,
  StrongEntanglementPlan,
} from "./strong.t"

const toArray = (value: string | string[] | undefined): string[] => {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

const unique = <T>(values: T[]): T[] => Array.from(new Set(values))

const toLeafField = (fieldPath: string): string | null => {
  if (!fieldPath || fieldPath === "[index]") return null
  if (fieldPath.startsWith("/mass/")) return null
  const normalized = fieldPath
    .replace(/^\/fields\//, "")
    .replace(/^\.\.\//g, "")
    .replace(/^\[item\]\//, "")
    .replace(/\.\.\//g, "")
    .replace(/\[item\]\//g, "")
    .replace(/\//g, ".")
  if (!normalized || normalized.startsWith("mass/")) {
    return null
  }
  const parts = normalized.split(".").filter(Boolean)
  if (parts.length === 0) return null
  return parts.join(".")
}

const extractFieldRefs = (paths: string[]): string[] =>
  unique(
    paths
      .map((path) => toLeafField(path))
      .filter((path): path is string => path !== null),
  )

const extractValueDataPaths = (value: unknown): string[] => {
  if (!value || typeof value !== "object") {
    return []
  }
  if ("data" in value) {
    const data = (value as { data?: string | string[] }).data
    return toArray(data)
  }
  return []
}

const stringifyTag = (tag: unknown): string => {
  if (typeof tag === "string") return tag
  if (tag && typeof tag === "object" && "expr" in tag) {
    return String((tag as { expr?: string }).expr ?? "meta")
  }
  return "meta"
}

type TraverseContext = {
  scopeStack: FlatGravityScope[]
  actorStack: FlatGravityActor[]
}

export function flattenGravity(source: NodeType[]): FlatGravityGraph {
  const scopes: FlatGravityScope[] = []
  const actors: FlatGravityActor[] = []
  const links: FlatGravityLink[] = []

  const visit = (nodes: NodeType[], context: TraverseContext): void => {
    for (const node of nodes) {
      switch (node.type) {
        case "map":
        case "cond":
        case "log": {
          const dataPaths = toArray(node.data)
          const scope: FlatGravityScope = {
            id: `scope:${scopes.length}`,
            kind: node.type,
            dataPaths,
            fieldRefs: extractFieldRefs(dataPaths),
            actorIds: [],
            ...("expr" in node && node.expr ? { expr: node.expr } : {}),
            ...(context.scopeStack.at(-1)?.id ? { parentScopeId: context.scopeStack.at(-1)!.id } : {}),
            ...(context.actorStack.at(-1)?.id ? { parentActorId: context.actorStack.at(-1)!.id } : {}),
          }
          scopes.push(scope)
          if (scope.parentScopeId) {
            links.push({
              kind: "scope",
              from: scope.parentScopeId,
              to: scope.id,
              fieldRefs: scope.fieldRefs,
            })
          }
          if (scope.parentActorId) {
            links.push({
              kind: "scope",
              from: scope.parentActorId,
              to: scope.id,
              fieldRefs: scope.fieldRefs,
            })
          }
          visit(node.child, {
            scopeStack: [...context.scopeStack, scope],
            actorStack: context.actorStack,
          })
          break
        }
        case "meta": {
          const ownDataPaths = extractValueDataPaths(node.fields)
          const inheritedFieldRefs = context.scopeStack.flatMap((scope) => scope.fieldRefs)
          const ownFieldRefs = extractFieldRefs(ownDataPaths)
          const actor: FlatGravityActor = {
            id: `actor:${actors.length}`,
            manifestIndex: actors.length,
            tag: stringifyTag(node.tag),
            dataPaths: ownDataPaths,
            fieldRefs: unique([...inheritedFieldRefs, ...ownFieldRefs]),
            scopeIds: context.scopeStack.map((scope) => scope.id),
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
              fieldRefs: actor.fieldRefs,
            })
          }
          if (actor.parentScopeId) {
            links.push({
              kind: "scope",
              from: actor.parentScopeId,
              to: actor.id,
              fieldRefs: actor.fieldRefs,
            })
          }
          visit(node.child ?? [], {
            scopeStack: context.scopeStack,
            actorStack: [...context.actorStack, actor],
          })
          break
        }
        case "el":
          visit(node.child ?? [], context)
          break
        default:
          break
      }
    }
  }

  visit(source, { scopeStack: [], actorStack: [] })

  return { source, scopes, actors, links }
}

const fieldMatches = (fieldName: string, graphFieldRef: string): boolean => {
  if (fieldName === graphFieldRef) return true
  const leaf = graphFieldRef.split(".").at(-1)
  return fieldName === leaf
}

const buildActorAdjacency = (graph: FlatGravityGraph): Map<string, Set<string>> => {
  const adjacency = new Map<string, Set<string>>()

  graph.actors.forEach((actor) => {
    adjacency.set(actor.id, new Set())
  })

  graph.actors.forEach((actor) => {
    if (actor.parentActorId) {
      adjacency.get(actor.id)!.add(actor.parentActorId)
      adjacency.get(actor.parentActorId)!.add(actor.id)
    }
  })

  graph.scopes.forEach((scope) => {
    const members = unique(scope.actorIds)
    if (members.length < 2) return
    const root = members[0]!
    for (let index = 1; index < members.length; index++) {
      const member = members[index]!
      adjacency.get(root)!.add(member)
      adjacency.get(member)!.add(root)
    }
  })

  return adjacency
}

export function buildStrongEntanglement(
  graph: FlatGravityGraph,
  runtimeActors: RuntimeActorSnapshot[],
): StrongEntanglementPlan {
  if (graph.actors.length !== runtimeActors.length) {
    throw new Error(
      `Gravity actor count ${graph.actors.length} does not match runtime actor count ${runtimeActors.length}`,
    )
  }

  const adjacency = buildActorAdjacency(graph)
  const blocksByMembership = new Map<string, StrongEntanglementBlock>()

  const graphActorsById = new Map(graph.actors.map((actor, index) => [actor.id, { actor, runtime: runtimeActors[index]! }]))

  const candidateFields = unique(graph.actors.flatMap((actor) => actor.fieldRefs))

  candidateFields.forEach((fieldRef) => {
    const participants = graph.actors
      .filter((actor, index) =>
        actor.fieldRefs.includes(fieldRef) &&
        runtimeActors[index]!.fieldNames.some((fieldName) => fieldMatches(fieldName, fieldRef)),
      )
      .map((actor) => actor.id)

    if (participants.length < 2) return

    const remaining = new Set(participants)
    while (remaining.size > 0) {
      const [start] = remaining
      const queue = [start!]
      const component = new Set<string>()

      while (queue.length > 0) {
        const current = queue.shift()!
        if (component.has(current)) continue
        component.add(current)
        remaining.delete(current)

        const neighbours = adjacency.get(current) ?? new Set<string>()
        neighbours.forEach((neighbour) => {
          if (remaining.has(neighbour)) {
            queue.push(neighbour)
          }
        })
      }

      if (component.size < 2) continue

      const memberEntries = Array.from(component)
        .map((actorId) => graphActorsById.get(actorId)!)
        .filter(({ runtime }) => runtime.fieldNames.some((fieldName) => fieldMatches(fieldName, fieldRef)))
        .sort((left, right) => left.runtime.braneIndex - right.runtime.braneIndex)

      if (memberEntries.length < 2) continue

      const braneIndices = memberEntries.map(({ runtime }) => runtime.braneIndex)
      const actorNodeIds = memberEntries.map(({ actor }) => actor.id)
      const scopeIds = unique(memberEntries.flatMap(({ actor }) => actor.scopeIds))
      const membershipKey = braneIndices.join(",")
      const matchedFieldNames = unique(
        memberEntries.flatMap(({ runtime }) =>
          runtime.fieldNames.filter((fieldName) => fieldMatches(fieldName, fieldRef)),
        ),
      )

      if (matchedFieldNames.length === 0) continue

      const existing = blocksByMembership.get(membershipKey)
      if (existing) {
        existing.fieldNames = unique([...existing.fieldNames, ...matchedFieldNames]).sort()
        existing.scopeIds = unique([...existing.scopeIds, ...scopeIds]).sort()
        return
      }

      blocksByMembership.set(membershipKey, {
        key: membershipKey,
        actorNodeIds,
        braneIndices,
        fieldNames: matchedFieldNames.sort(),
        scopeIds: scopeIds.sort(),
      })
    }
  })

  return {
    graph,
    blocks: Array.from(blocksByMembership.values()).sort((left, right) => left.key.localeCompare(right.key)),
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
        fieldIndices: unique(
          block.fieldNames
            .map((fieldName) => fieldNameIndex.get(fieldName))
            .filter((fieldIndex): fieldIndex is number => fieldIndex !== undefined),
        ).sort((left, right) => left - right),
      }))
      .filter((block) => block.fieldIndices.length > 0 && block.braneIndices.length > 1),
  }
}
