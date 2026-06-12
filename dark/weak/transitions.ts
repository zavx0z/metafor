import type {State, Wimp} from "@store/wimp/sqlite"
import {fillConditions} from "./conditions.ts"
import {createProtocolChannel} from "../../protocol.ts"

const protocol = createProtocolChannel()

export async function fillTransitions(wimp: Wimp, fromState: State, transitionsDsl: unknown): Promise<void> {
  if (!transitionsDsl || typeof transitionsDsl !== "object") return
  for (const [toName, cond] of Object.entries(transitionsDsl as Record<string, unknown>)) {
    const toState = await wimp.states.get({name: toName})
    if (!toState) continue
    const transition = await fromState.transitions.add(toName)
    protocol.postMessage({
      patches: [{part: "graviton", op: "add", path: await transition.uuid(), value: "transition"}],
    })
    await fillConditions(transition, cond)
  }
}
