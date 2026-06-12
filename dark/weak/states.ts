import type {MetaDSL} from "../.."
import type {Wimp} from "@store/wimp/sqlite"
import {fillTransitions} from "./transitions.ts"
import {createProtocolChannel} from "../../protocol.ts"

const protocol = createProtocolChannel()

export async function fillStates(wimp: Wimp, dsl: MetaDSL): Promise<void> {
  const superposition = (dsl.superposition ?? {}) as Record<string, unknown>

  // 1. States — порядок по Object.keys.
  for (const stateName of Object.keys(superposition)) {
    const state = await wimp.states.add(stateName)
    protocol.postMessage({
      patches: [{part: "graviton", op: "add", path: await state.uuid(), value: "state"}],
    })
  }

  // 2. Transitions/Conditions/Predicates для каждого state.
  for (const [fromName, transitions] of Object.entries(superposition)) {
    const fromState = await wimp.states.get({name: fromName})
    if (!fromState) continue
    await fillTransitions(wimp, fromState, transitions)
  }
}
