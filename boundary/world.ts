import type {ReservedSQL, SQL} from "bun"
import {resolveForceFieldId} from "@metafor/types/force/fields"

type Database = SQL | ReservedSQL

type FieldRow = {
  id: number
  type: string
}

export type BoundaryFieldCommit = {
  scalar: Record<string, unknown>
  topology: Record<string, unknown>
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
    await sql`
      INSERT INTO boundary_atom_field (atom, field, value_json)
      VALUES (${atomId}, ${fieldId}, ${JSON.stringify(value)})
      ON CONFLICT (atom, field) DO UPDATE SET value_json = excluded.value_json
    `
    const target = field.type === "enum" || field.type === "array" ? topology : scalar
    target[String(fieldId)] = value
  }

  return {scalar, topology}
}
