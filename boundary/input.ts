import type {ReservedSQL, SQL} from "bun"
import {resolveForceFieldId, resolveForceFieldsPayload} from "@metafor/types/force/fields"
import type {ForceMessage} from "@metafor/types/force/message"
import type {BoundaryIncrementalCommit} from "./incremental.ts"
import {commitBoundaryAtomFields} from "./world.ts"

type Database = SQL | ReservedSQL

type AtomRow = {
  id: number
  wimp: string
}

type FieldRow = {
  id: number
  type: string
}

const positiveId = (value: unknown): number | null =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null

/** Commits an external scalar Field mutation before Matrix or Reaction can observe it. */
export class BoundaryInputStore {
  constructor(readonly sql: SQL) {}

  async apply(input: ForceMessage): Promise<BoundaryIncrementalCommit | null | undefined> {
    const part = input.parts[0]
    if (part.part !== "gluon" || part.from !== undefined) return undefined
    if (part.op !== "add" && part.op !== "replace" && part.op !== "remove") return undefined

    const atomId = positiveId(part.path)
    const fields = resolveForceFieldsPayload(part.value)
    if (atomId === null || !fields || Object.keys(fields).length === 0) {
      throw new Error("External Gluon requires an Atom path and at least one Field")
    }

    const committed = await this.sql.begin(async (tx) => {
      const atom = await this.atom(tx, atomId)
      if (!atom) throw new Error(`Cannot commit external Gluon for missing Atom ${atomId}`)

      const rows = await tx<FieldRow[]>`
        SELECT id, type FROM field WHERE wimp = ${atom.wimp}
      `
      const scalarFields = new Set(
        rows
          .filter((field) => field.type !== "enum" && field.type !== "array")
          .map((field) => Number(field.id)),
      )

      if (part.op === "remove") {
        const scalar: Record<string, unknown> = {}
        for (const [address, value] of Object.entries(fields)) {
          const fieldId = resolveForceFieldId(address)
          if (fieldId === null || !scalarFields.has(fieldId)) {
            throw new Error(`External Gluon cannot remove field ${address}`)
          }
          await tx`DELETE FROM boundary_atom_field WHERE atom = ${atomId} AND field = ${fieldId}`
          scalar[String(fieldId)] = value
        }
        return {atom, scalar}
      }

      const result = await commitBoundaryAtomFields(
        tx,
        atomId,
        atom.wimp,
        scalarFields,
        fields,
        "External Gluon",
      )
      if (Object.keys(result.topology).length > 0) {
        throw new Error("External Gluon cannot contain topology Fields")
      }
      return {atom, scalar: result.scalar}
    })

    return {
      rootSrc: committed.atom.wimp,
      messages: [{
        parts: [{
          part: "gluon",
          op: part.op,
          path: atomId,
          value: {fields: committed.scalar},
        }],
      }],
    }
  }

  private async atom(sql: Database, atomId: number): Promise<AtomRow | null> {
    const row = (await sql<AtomRow[]>`
      SELECT id, wimp FROM atom WHERE id = ${atomId}
    `)[0]
    return row ? {id: Number(row.id), wimp: row.wimp} : null
  }
}
