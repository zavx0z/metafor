import type { SQL } from "bun"
import type { MetaDSL } from "../../.."
import type { MetaSource } from "./meta.t.ts"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const insertMassValue = async (
  sql: SQL,
  src: string,
  value: unknown,
  parentValue: string | null,
  entryKey: string | null,
  entryOrder: number | null,
): Promise<string> => {
  const uuid = crypto.randomUUID()

  if (Array.isArray(value)) {
    await sql`
      INSERT INTO meta_mass_value
        (uuid, meta, parent_value, value_kind, entry_key, entry_order, text_value, number_value, boolean_value)
      VALUES (${uuid}, ${src}, ${parentValue}, ${"array"}, ${entryKey}, ${entryOrder}, ${null}, ${null}, ${null})
    `

    for (let index = 0; index < value.length; index++) {
      await insertMassValue(sql, src, value[index], uuid, null, index)
    }

    return uuid
  }

  if (isRecord(value)) {
    await sql`
      INSERT INTO meta_mass_value
        (uuid, meta, parent_value, value_kind, entry_key, entry_order, text_value, number_value, boolean_value)
      VALUES (${uuid}, ${src}, ${parentValue}, ${"object"}, ${entryKey}, ${entryOrder}, ${null}, ${null}, ${null})
    `

    for (const [childKey, childValue] of Object.entries(value)) {
      await insertMassValue(sql, src, childValue, uuid, childKey, null)
    }

    return uuid
  }

  if (typeof value === "string") {
    await sql`
      INSERT INTO meta_mass_value
        (uuid, meta, parent_value, value_kind, entry_key, entry_order, text_value, number_value, boolean_value)
      VALUES (${uuid}, ${src}, ${parentValue}, ${"string"}, ${entryKey}, ${entryOrder}, ${value}, ${null}, ${null})
    `
    return uuid
  }

  if (typeof value === "number") {
    await sql`
      INSERT INTO meta_mass_value
        (uuid, meta, parent_value, value_kind, entry_key, entry_order, text_value, number_value, boolean_value)
      VALUES (${uuid}, ${src}, ${parentValue}, ${"number"}, ${entryKey}, ${entryOrder}, ${null}, ${value}, ${null})
    `
    return uuid
  }

  if (typeof value === "boolean") {
    await sql`
      INSERT INTO meta_mass_value
        (uuid, meta, parent_value, value_kind, entry_key, entry_order, text_value, number_value, boolean_value)
      VALUES (${uuid}, ${src}, ${parentValue}, ${"boolean"}, ${entryKey}, ${entryOrder}, ${null}, ${null}, ${value ? 1 : 0})
    `
    return uuid
  }

  await sql`
    INSERT INTO meta_mass_value
      (uuid, meta, parent_value, value_kind, entry_key, entry_order, text_value, number_value, boolean_value)
    VALUES (${uuid}, ${src}, ${parentValue}, ${"null"}, ${entryKey}, ${entryOrder}, ${null}, ${null}, ${null})
  `
  return uuid
}

export async function createMeta(sql: SQL, meta: MetaDSL, src: MetaSource): Promise<void> {
  if (meta.mass !== undefined && !isRecord(meta.mass)) {
    throw new Error(`Meta mass for "${src}" must be an object to be stored in relational form`)
  }

  await sql`
    INSERT INTO meta (src, name, desc, view_css)
    VALUES (${src}, ${meta.name}, ${meta.desc || null}, ${meta.bulk?.view || null})
  `

  if (meta.mass !== undefined) {
    await insertMassValue(sql, src, meta.mass, null, null, null)
  }
}
