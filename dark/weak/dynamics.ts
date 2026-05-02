import type { MetaDSL } from "../.."
import type { Wimp, FieldUuidByKey, StateUuidByName } from "@store/wimp/sqlite"

export interface WeakDynamics {
  stateUuids: StateUuidByName
  initialState: string | null
}

export async function fillWeakDynamics(
  wimp: Wimp,
  dsl: MetaDSL,
  fieldUuids: FieldUuidByKey,
): Promise<WeakDynamics> {
  const stateUuids = await wimp.superposition.create(dsl, fieldUuids)
  await wimp.processes.create(dsl, fieldUuids)
  await wimp.reactions.create(dsl, fieldUuids, stateUuids)
  const firstStateUuid = stateUuids.values().next().value ?? null
  return { stateUuids, initialState: firstStateUuid }
}
