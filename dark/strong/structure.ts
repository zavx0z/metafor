import type { MetaDSL } from "../.."
import type { Wimp } from "@store/wimp/sqlite"

export async function fillStrongStructure(wimp: Wimp, dsl: MetaDSL): Promise<void> {
  await wimp.name.set(dsl.name ?? null)
  await wimp.desc.set(dsl.desc ?? null)
  await wimp.bulk.set(dsl.bulk ?? null)
  if (dsl.mass !== undefined) await wimp.mass.set(dsl.mass)

  for (const [key, def] of Object.entries(dsl.fields)) {
    const label = def.label ?? null
    const required = def.required ?? false
    switch (def.type) {
      case "string":
        await wimp.fields.string({
          key,
          default: def.default as string | undefined,
          label,
          required,
        })
        break
      case "number":
        await wimp.fields.number({
          key,
          default: def.default as number | undefined,
          label,
          required,
        })
        break
      case "boolean":
        await wimp.fields.boolean({
          key,
          default: def.default as boolean | undefined,
          label,
          required,
        })
        break
      case "array":
        await wimp.fields.array({
          key,
          default: def.default as number[] | undefined,
          label,
          required,
        })
        break
      case "enum":
        await wimp.fields.enum({
          key,
          values: (def.values ?? []) as ReadonlyArray<string | number>,
          default: def.default as string | number | undefined,
          label,
          required,
        })
        break
    }
  }
}
