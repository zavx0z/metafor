import type { MetaDSL } from "../.."
import type { Wimp } from "@store/wimp/sqlite"

export async function fillStrongStructure(wimp: Wimp, dsl: MetaDSL): Promise<void> {
  await wimp.name.set(dsl.name ?? null)
  await wimp.desc.set(dsl.desc ?? null)
  await wimp.bulk.set(dsl.bulk ?? null)
  if (dsl.mass !== undefined) await wimp.mass.set(dsl.mass)
  await wimp.fields.create(dsl)
}
