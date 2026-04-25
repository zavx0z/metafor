import type { Database } from "bun:sqlite"
import type { MetaDSL } from "../../.."

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const insertMassValue = (
  db: Database,
  src: string,
  value: unknown,
  parentValue: string | null,
  entryKey: string | null,
  entryOrder: number | null,
): string => {
  const uuid = crypto.randomUUID()

  if (Array.isArray(value)) {
    db.query(
      `INSERT INTO meta_mass_value
         (uuid, meta, parent_value, value_kind, entry_key, entry_order, text_value, number_value, boolean_value)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(uuid, src, parentValue, "array", entryKey, entryOrder, null, null, null)

    value.forEach((item, index) => {
      insertMassValue(db, src, item, uuid, null, index)
    })

    return uuid
  }

  if (isRecord(value)) {
    db.query(
      `INSERT INTO meta_mass_value
         (uuid, meta, parent_value, value_kind, entry_key, entry_order, text_value, number_value, boolean_value)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(uuid, src, parentValue, "object", entryKey, entryOrder, null, null, null)

    for (const [childKey, childValue] of Object.entries(value)) {
      insertMassValue(db, src, childValue, uuid, childKey, null)
    }

    return uuid
  }

  if (typeof value === "string") {
    db.query(
      `INSERT INTO meta_mass_value
         (uuid, meta, parent_value, value_kind, entry_key, entry_order, text_value, number_value, boolean_value)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(uuid, src, parentValue, "string", entryKey, entryOrder, value, null, null)
    return uuid
  }

  if (typeof value === "number") {
    db.query(
      `INSERT INTO meta_mass_value
         (uuid, meta, parent_value, value_kind, entry_key, entry_order, text_value, number_value, boolean_value)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(uuid, src, parentValue, "number", entryKey, entryOrder, null, value, null)
    return uuid
  }

  if (typeof value === "boolean") {
    db.query(
      `INSERT INTO meta_mass_value
         (uuid, meta, parent_value, value_kind, entry_key, entry_order, text_value, number_value, boolean_value)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(uuid, src, parentValue, "boolean", entryKey, entryOrder, null, null, value ? 1 : 0)
    return uuid
  }

  db.query(
    `INSERT INTO meta_mass_value
       (uuid, meta, parent_value, value_kind, entry_key, entry_order, text_value, number_value, boolean_value)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(uuid, src, parentValue, "null", entryKey, entryOrder, null, null, null)
  return uuid
}

export function relationMetafor(db: Database, meta: MetaDSL, src: string): void {
  if (meta.mass !== undefined && !isRecord(meta.mass)) {
    throw new Error(`Meta mass for "${src}" must be an object to be stored in relational form`)
  }

  db.query(
    `INSERT INTO meta (src, name, desc, view_css, has_processes, has_reactions, has_matter)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    src,
    meta.name,
    meta.desc || null,
    meta.bulk?.view || null,
    meta.processes !== undefined ? 1 : 0,
    meta.reactions !== undefined ? 1 : 0,
    meta.matter !== undefined ? 1 : 0,
  )

  if (meta.mass !== undefined) {
    insertMassValue(db, src, meta.mass, null, null, null)
  }
}
