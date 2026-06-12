import type {Transition} from "@store/wimp/sqlite"
import {fillPredicates} from "./predicates.ts"
import {createProtocolChannel} from "../../protocol.ts"

const protocol = createProtocolChannel()

export async function fillConditions(transition: Transition, condDsl: unknown): Promise<void> {
  if (!condDsl || typeof condDsl !== "object") return
  for (const [fieldKey, predicate] of Object.entries(condDsl as Record<string, unknown>)) {
    const condition = await transition.conditions.add(fieldKey)
    if (!condition) continue
    protocol.postMessage({
      patches: [{part: "graviton", op: "add", path: await condition.uuid(), value: "condition"}],
    })
    await fillPredicates(condition, predicate)
  }
}
