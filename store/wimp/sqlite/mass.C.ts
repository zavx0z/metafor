import type { SQL } from "bun"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

export const insertMassValue = async (
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
      INSERT INTO wimp_mass_value
        (uuid, wimp, parent_value, value_kind, entry_key, entry_order, text_value, number_value, boolean_value)
      VALUES (${uuid}, ${src}, ${parentValue}, ${"array"}, ${entryKey}, ${entryOrder}, ${null}, ${null}, ${null})
    `

    for (let index = 0; index < value.length; index++) {
      await insertMassValue(sql, src, value[index], uuid, null, index)
    }

    return uuid
  }

  if (isRecord(value)) {
    await sql`
      INSERT INTO wimp_mass_value
        (uuid, wimp, parent_value, value_kind, entry_key, entry_order, text_value, number_value, boolean_value)
      VALUES (${uuid}, ${src}, ${parentValue}, ${"object"}, ${entryKey}, ${entryOrder}, ${null}, ${null}, ${null})
    `

    for (const [childKey, childValue] of Object.entries(value)) {
      await insertMassValue(sql, src, childValue, uuid, childKey, null)
    }

    return uuid
  }

  if (typeof value === "string") {
    await sql`
      INSERT INTO wimp_mass_value
        (uuid, wimp, parent_value, value_kind, entry_key, entry_order, text_value, number_value, boolean_value)
      VALUES (${uuid}, ${src}, ${parentValue}, ${"string"}, ${entryKey}, ${entryOrder}, ${value}, ${null}, ${null})
    `
    return uuid
  }

  if (typeof value === "number") {
    await sql`
      INSERT INTO wimp_mass_value
        (uuid, wimp, parent_value, value_kind, entry_key, entry_order, text_value, number_value, boolean_value)
      VALUES (${uuid}, ${src}, ${parentValue}, ${"number"}, ${entryKey}, ${entryOrder}, ${null}, ${value}, ${null})
    `
    return uuid
  }

  if (typeof value === "boolean") {
    await sql`
      INSERT INTO wimp_mass_value
        (uuid, wimp, parent_value, value_kind, entry_key, entry_order, text_value, number_value, boolean_value)
      VALUES (${uuid}, ${src}, ${parentValue}, ${"boolean"}, ${entryKey}, ${entryOrder}, ${null}, ${null}, ${value ? 1 : 0})
    `
    return uuid
  }

  await sql`
    INSERT INTO wimp_mass_value
      (uuid, wimp, parent_value, value_kind, entry_key, entry_order, text_value, number_value, boolean_value)
    VALUES (${uuid}, ${src}, ${parentValue}, ${"null"}, ${entryKey}, ${entryOrder}, ${null}, ${null}, ${null})
  `
  return uuid
}
