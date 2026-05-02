import type {State, Wimp} from "@store/wimp/sqlite"
import {fillConditions} from "./conditions.ts"

export async function fillTransitions(wimp: Wimp, fromState: State, transitionsDsl: unknown): Promise<void> {
  if (!transitionsDsl || typeof transitionsDsl !== "object") return
  for (const [toName, cond] of Object.entries(transitionsDsl as Record<string, unknown>)) {
    const toState = await wimp.states.get({name: toName})
    if (!toState) continue
    const transition = await fromState.transitions.add(toName)
    await fillConditions(transition, cond)
  }
}
