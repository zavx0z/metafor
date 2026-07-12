import type {ReservedSQL, SQL} from "bun"
import {resolveForceFieldId, resolveForceFieldsPayload} from "@metafor/types/force/fields"
import type {ForceMessage} from "@metafor/types/force/message"
import type {BoundaryIncrementalCommit} from "./incremental.ts"
import {commitBoundaryActorFields} from "./world.ts"

type Database = SQL | ReservedSQL

type ActorRow = {
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

    const actorId = positiveId(part.path)
    const fields = resolveForceFieldsPayload(part.value)
    if (actorId === null || !fields || Object.keys(fields).length === 0) {
      throw new Error("External Gluon requires an Actor path and at least one Field")
    }

    const committed = await this.sql.begin(async (tx) => {
      const actor = await this.actor(tx, actorId)
      if (!actor) throw new Error(`Cannot commit external Gluon for missing Actor ${actorId}`)

      const rows = await tx<FieldRow[]>`
        SELECT id, type FROM field WHERE wimp = ${actor.wimp}
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
          await tx`DELETE FROM boundary_actor_field WHERE actor = ${actorId} AND field = ${fieldId}`
          scalar[String(fieldId)] = value
        }
        return {actor, scalar}
      }

      const result = await commitBoundaryActorFields(
        tx,
        actorId,
        actor.wimp,
        scalarFields,
        fields,
        "External Gluon",
      )
      if (Object.keys(result.topology).length > 0) {
        throw new Error("External Gluon cannot contain topology Fields")
      }
      return {actor, scalar: result.scalar}
    })

    return {
      rootSrc: committed.actor.wimp,
      messages: [{
        parts: [{
          part: "gluon",
          op: part.op,
          path: actorId,
          value: {fields: committed.scalar},
        }],
      }],
    }
  }

  private async actor(sql: Database, actorId: number): Promise<ActorRow | null> {
    const row = (await sql<ActorRow[]>`
      SELECT id, wimp FROM actor WHERE id = ${actorId}
    `)[0]
    return row ? {id: Number(row.id), wimp: row.wimp} : null
  }
}
