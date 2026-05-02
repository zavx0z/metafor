import type {Transition} from "@store/wimp/sqlite"
import {fillPredicates} from "./predicates.ts"

export async function fillConditions(transition: Transition, condDsl: unknown): Promise<void> {
  if (!condDsl || typeof condDsl !== "object") return
  for (const [fieldKey, predicate] of Object.entries(condDsl as Record<string, unknown>)) {
    const condition = await transition.conditions.add(fieldKey)
    if (!condition) continue
    await fillPredicates(condition, predicate)
  }
}
