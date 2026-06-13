import type {MetaDSL} from "../.."
import type {Wimp} from "@store/wimp/sqlite"
import {fillTransitions} from "./transitions.ts"

export async function fillStates(wimp: Wimp, dsl: MetaDSL): Promise<void> {
  const superposition = (dsl.superposition ?? {}) as Record<string, unknown>

  // 1. States — порядок по Object.keys.
  for (const stateName of Object.keys(superposition)) {
    await wimp.states.add(stateName)
  }

  // 2. Transitions/Conditions/Predicates для каждого state.
  for (const [fromName, transitions] of Object.entries(superposition)) {
    const fromState = await wimp.states.get({name: fromName})
    if (!fromState) continue
    await fillTransitions(wimp, fromState, transitions)
  }
}
