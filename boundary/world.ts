import type {ReservedSQL, SQL} from "bun"
import {resolveForceFieldId} from "@metafor/types/force/fields"

type Database = SQL | ReservedSQL

type FieldRow = {
  id: number
  type: "string" | "number" | "boolean" | "array" | "enum"
}

export type BoundaryFieldCommit = {
  scalar: Record<string, unknown>
  topology: Record<string, unknown>
}

const insertedId = async (rows: Promise<Array<{id: number}>>, label: string): Promise<number> => {
  const row = (await rows)[0]
  if (!row) throw new Error(`${label} did not return id`)
  return Number(row.id)
}

export async function readBoundaryValue(sql: Database, id: number): Promise<unknown> {
  const kind = (await sql<Array<{kind: string}>>`SELECT kind FROM value WHERE id = ${id}`)[0]?.kind
  if (kind === undefined || kind === "null") return null
  if (kind === "boolean") return (await sql<Array<{value: number}>>`SELECT boolean AS value FROM value_boolean WHERE value = ${id}`)[0]?.value === 1
  if (kind === "number") return Number((await sql<Array<{value: number}>>`SELECT number AS value FROM value_number WHERE value = ${id}`)[0]?.value ?? 0)
  if (kind === "string") return (await sql<Array<{value: string}>>`SELECT text AS value FROM value_string WHERE value = ${id}`)[0]?.value ?? ""
  if (kind === "enum") return (await sql<Array<{value: string}>>`
    SELECT variant.item_value AS value FROM value_enum JOIN field_enum_variant AS variant ON variant.id = value_enum.variant
     WHERE value_enum.value = ${id}
  `)[0]?.value ?? null
  return (await sql<Array<{value: string}>>`SELECT item_value AS value FROM value_list_item WHERE value = ${id} ORDER BY position`).map((row) => row.value)
}

export async function writeBoundaryAtomValue(
  sql: Database,
  atomId: number,
  field: FieldRow,
  raw: unknown,
): Promise<void> {
  const previous = (await sql<Array<{value: number}>>`SELECT value FROM atom_value WHERE atom = ${atomId} AND field = ${field.id}`)[0]
  if (previous) await sql`DELETE FROM atom_value WHERE atom = ${atomId} AND field = ${field.id}`
  const kind = raw === null || raw === undefined ? "null"
    : field.type === "boolean" ? "boolean"
      : field.type === "number" ? "number"
        : field.type === "enum" ? "enum"
          : field.type === "array" ? "list"
            : "string"
  const value = await insertedId(sql<Array<{id: number}>>`INSERT INTO value (kind) VALUES (${kind}) RETURNING id`, "Boundary value")
  if (kind === "boolean") await sql`INSERT INTO value_boolean (value, boolean) VALUES (${value}, ${raw ? 1 : 0})`
  else if (kind === "number") await sql`INSERT INTO value_number (value, number) VALUES (${value}, ${Number(raw)})`
  else if (kind === "string") await sql`INSERT INTO value_string (value, text) VALUES (${value}, ${String(raw)})`
  else if (kind === "enum") {
    const variant = (await sql<Array<{id: number}>>`
      SELECT id FROM field_enum_variant WHERE field = ${field.id} AND item_value = ${String(raw)} LIMIT 1
    `)[0]
    if (!variant) throw new Error(`Unknown enum value ${String(raw)} for Field ${field.id}`)
    await sql`INSERT INTO value_enum (value, variant) VALUES (${value}, ${variant.id})`
  } else if (kind === "list") {
    for (let position = 0; position < (Array.isArray(raw) ? raw.length : 0); position++) {
      await sql`INSERT INTO value_list_item (value, position, item_value) VALUES (${value}, ${position}, ${String((raw as unknown[])[position])})`
    }
  }
  await sql`INSERT INTO atom_value (atom, field, value) VALUES (${atomId}, ${field.id}, ${value})`
  if (previous) await sql`DELETE FROM value WHERE id = ${previous.value}`
}

/**
 * The only runtime path that turns computed Fields into materialized world data.
 * Callers provide an already validated Atom/WIMP and declared write set; this
 * function validates every address again and writes within the caller's SQLite
 * transaction.
 */
export async function commitBoundaryAtomFields(
  sql: Database,
  atomId: number,
  wimp: string,
  allowedFields: ReadonlySet<number>,
  proposedFields: Record<string, unknown>,
  owner: string,
): Promise<BoundaryFieldCommit> {
  const fields = new Map<number, unknown>()
  for (const [address, value] of Object.entries(proposedFields)) {
    const fieldId = resolveForceFieldId(address)
    if (fieldId === null || !allowedFields.has(fieldId)) {
      throw new Error(`${owner} cannot write field ${address}`)
    }
    if (JSON.stringify(value) === undefined) throw new Error(`Field ${address} result is not serializable`)
    fields.set(fieldId, value)
  }

  const fieldRows = await sql<FieldRow[]>`
    SELECT id, type FROM field WHERE wimp = ${wimp}
  `
  const fieldById = new Map(fieldRows.map((field) => [Number(field.id), field]))
  const scalar: Record<string, unknown> = {}
  const topology: Record<string, unknown> = {}

  for (const [fieldId, value] of fields) {
    const field = fieldById.get(fieldId)
    if (!field) throw new Error(`Field ${fieldId} does not belong to atom ${atomId}`)
    await writeBoundaryAtomValue(sql, atomId, field, value)
    const target = field.type === "enum" || field.type === "array" ? topology : scalar
    target[String(fieldId)] = value
  }

  return {scalar, topology}
}
