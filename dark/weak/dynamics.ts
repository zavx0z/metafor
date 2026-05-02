import type { MetaDSL } from "../.."
import type { Wimp } from "@store/wimp/sqlite"

export async function fillWeakDynamics(wimp: Wimp, dsl: MetaDSL): Promise<void> {
  await wimp.superposition.create(dsl)
  await wimp.processes.create(dsl)
  await wimp.reactions.create(dsl)
}
