import type { SQL } from "bun"
import type { MetaDSL } from "../../.."
import type { FieldUuidByKey } from "./fields.t.ts"

export async function createFields(sql: SQL, meta: MetaDSL, src: string): Promise<FieldUuidByKey> {
  const fieldUuids: FieldUuidByKey = new Map<string, string>()

  for (const [key, def] of Object.entries(meta.fields)) {
    const uuid = crypto.randomUUID()
    fieldUuids.set(key, uuid)

    await sql`
      INSERT INTO field (uuid, wimp, key, type, required, label)
      VALUES (${uuid}, ${src}, ${key}, ${def.type}, ${def.required ? 1 : 0}, ${def.label || null})
    `

    if ("default" in def && def.default !== undefined) {
      await sql`INSERT INTO field_default (field) VALUES (${uuid})`
      if (def.type === "string") {
        await sql`INSERT INTO field_string_default (field, default_value) VALUES (${uuid}, ${def.default as string})`
      } else if (def.type === "number") {
        await sql`INSERT INTO field_number_default (field, default_value) VALUES (${uuid}, ${def.default as number})`
      } else if (def.type === "boolean") {
        await sql`INSERT INTO field_boolean_default (field, default_value) VALUES (${uuid}, ${def.default ? 1 : 0})`
      } else if (def.type === "array" && Array.isArray(def.default)) {
        const defaults = def.default as unknown[]
        for (let i = 0; i < defaults.length; i++) {
          const itemUuid = crypto.randomUUID()
          await sql`
            INSERT INTO field_array_default_item (uuid, field, position, item_value)
            VALUES (${itemUuid}, ${uuid}, ${i}, ${String(defaults[i])})
          `
        }
      }
    }

    if (def.type === "enum" && "values" in def && Array.isArray(def.values)) {
      const variantUuids = new Map<string | number, string>()
      const values = def.values as Array<string | number>
      for (let i = 0; i < values.length; i++) {
        const val = values[i]!
        const variantUuid = crypto.randomUUID()
        variantUuids.set(val, variantUuid)
        await sql`
          INSERT INTO field_enum_variant (uuid, field, position, item_value)
          VALUES (${variantUuid}, ${uuid}, ${i}, ${String(val)})
        `
      }

      if ("default" in def && def.default !== undefined) {
        const variantUuid = variantUuids.get(def.default as string | number)
        if (variantUuid) {
          await sql`INSERT INTO field_enum_default (field, variant) VALUES (${uuid}, ${variantUuid})`
        }
      }
    }
  }

  return fieldUuids
}
