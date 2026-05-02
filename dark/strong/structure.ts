import type { MetaDSL } from "../.."
import type { Wimp, FieldUuidByKey, VariantUuidByValue } from "@store/wimp/sqlite"

export interface StrongStructure {
  fieldUuids: FieldUuidByKey
  variantUuids: VariantUuidByValue
}

export async function fillStrongStructure(wimp: Wimp, dsl: MetaDSL): Promise<StrongStructure> {
  await wimp.setMetadata({
    name: dsl.name ?? null,
    desc: dsl.desc ?? null,
    viewCss: dsl.bulk?.view ?? null,
  })
  if (dsl.mass !== undefined) await wimp.setMass(dsl.mass)
  const { fieldUuids, variantUuids } = await wimp.fields.create(dsl)
  return { fieldUuids, variantUuids }
}
