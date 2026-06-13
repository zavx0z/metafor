import type {Condition} from "@store/wimp/sqlite"

const normalizePredicate = (predicate: unknown): Record<string, unknown> | undefined => {
  if (predicate === null) return {null: true}
  if (typeof predicate === "boolean" || typeof predicate === "number" || typeof predicate === "string") {
    return {eq: predicate}
  }
  if (predicate && typeof predicate === "object") return predicate as Record<string, unknown>
  return undefined
}

export async function fillPredicates(condition: Condition, predicateDsl: unknown): Promise<void> {
  const normalized = normalizePredicate(predicateDsl)
  if (!normalized) return
  for (const [op, val] of Object.entries(normalized)) {
    await condition.predicates.add(op, val)
  }
}
