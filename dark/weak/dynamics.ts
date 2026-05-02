import type {MetaDSL} from "../.."
import type {Wimp} from "@store/wimp/sqlite"
import {fillStates} from "./states.ts"
import {fillProcesses} from "./processes.ts"
import {fillReactions} from "./reactions.ts"

export async function fillWeakDynamics(wimp: Wimp, dsl: MetaDSL): Promise<void> {
  await fillStates(wimp, dsl)
  await fillProcesses(wimp, dsl)
  await fillReactions(wimp, dsl)
}
