import type { Database } from "bun:sqlite"
import type { MetaDSL } from "../../.."
import type { FieldUuidByKey } from "./fields.t.ts"

export function createFields(db: Database, meta: MetaDSL, src: string): FieldUuidByKey {
  const fieldUuids: FieldUuidByKey = new Map<string, string>()

  for (const [key, def] of Object.entries(meta.fields)) {
    const uuid = crypto.randomUUID()
    fieldUuids.set(key, uuid)

    db.query("INSERT INTO field (uuid, meta, key, type, required, label) VALUES (?, ?, ?, ?, ?, ?)")
      .run(uuid, src, key, def.type, def.required ? 1 : 0, def.label || null)

    if ("default" in def && def.default !== undefined) {
      db.query("INSERT INTO field_default (field) VALUES (?)").run(uuid)
      if (def.type === "string") {
        db.query("INSERT INTO field_string_default (field, default_value) VALUES (?, ?)")
          .run(uuid, def.default as string)
      } else if (def.type === "number") {
        db.query("INSERT INTO field_number_default (field, default_value) VALUES (?, ?)")
          .run(uuid, def.default as number)
      } else if (def.type === "boolean") {
        db.query("INSERT INTO field_boolean_default (field, default_value) VALUES (?, ?)")
          .run(uuid, def.default ? 1 : 0)
      } else if (def.type === "array" && Array.isArray(def.default)) {
        ;(def.default as any[]).forEach((val, i) => {
          const itemUuid = crypto.randomUUID()
          db.query("INSERT INTO field_array_default_item (uuid, field, position, item_value) VALUES (?, ?, ?, ?)")
            .run(itemUuid, uuid, i, String(val))
        })
      }
    }

    if (def.type === "enum" && "values" in def && Array.isArray(def.values)) {
      const variantUuids = new Map<string | number, string>()
      def.values.forEach((val: string | number, i: number) => {
        const variantUuid = crypto.randomUUID()
        variantUuids.set(val, variantUuid)
        db.query("INSERT INTO field_enum_variant (uuid, field, position, item_value) VALUES (?, ?, ?, ?)")
          .run(variantUuid, uuid, i, String(val))
      })

      if ("default" in def && def.default !== undefined) {
        const variantUuid = variantUuids.get(def.default as string | number)
        if (variantUuid) {
          db.query("INSERT INTO field_enum_default (field, variant) VALUES (?, ?)").run(uuid, variantUuid)
        }
      }
    }
  }

  return fieldUuids
}
