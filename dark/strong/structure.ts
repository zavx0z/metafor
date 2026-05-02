import type { MetaDSL } from "../.."
import type { Wimp } from "@store/wimp/sqlite"

export async function fillStrongStructure(wimp: Wimp, dsl: MetaDSL): Promise<void> {
  await wimp.setMetadata({
    name: dsl.name ?? null,
    desc: dsl.desc ?? null,
    viewCss: dsl.bulk?.view ?? null,
  })
  if (dsl.mass !== undefined) await wimp.setMass(dsl.mass)
  await wimp.fields.create(dsl)
}
