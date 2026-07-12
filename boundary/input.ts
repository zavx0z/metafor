import type {ReservedSQL, SQL} from "bun"
import {
  isExternalInputProposal,
  isInputExecutionId,
} from "@metafor/types/force/input"
import type {ForceMessage} from "@metafor/types/force/message"
import type {Particle} from "@metafor/types/force/particle"
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

type InputRow = {
  actor: number
  part: "gluon" | "higgs"
  payloadJson: string
}

const positiveId = (value: unknown): number | null =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null

const canonicalJsonValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalJsonValue)
  if (typeof value !== "object" || value === null) return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalJsonValue(child)]),
  )
}

const message = (part: Particle): ForceMessage => ({parts: [part]})

/**
 * Canonical entry point for observations/actions coming from outside MetaFor.
 *
 * An external producer broadcasts `gluon/test` or `higgs/test` with a stable
 * `input:*` identity. Matrix ignores the proposal. Boundary validates and
 * atomically persists it, then emits the materialized `replace` consequence.
 */
export class BoundaryInputStore {
  constructor(readonly sql: SQL) {}

  async init(): Promise<void> {
    await this.sql.unsafe(`
      CREATE TABLE IF NOT EXISTS boundary_input_execution (
        input_id TEXT PRIMARY KEY,
        actor INTEGER NOT NULL,
        part TEXT NOT NULL CHECK (part IN ('gluon', 'higgs')),
        payload_json TEXT NOT NULL,
        committed_at INTEGER NOT NULL DEFAULT (unixepoch()),
        FOREIGN KEY (actor) REFERENCES actor (id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS boundary_input_actor
        ON boundary_input_execution (actor, committed_at);
    `)
  }

  async apply(input: ForceMessage): Promise<BoundaryIncrementalCommit | null | undefined> {
    const part = input.parts[0]
    if ((part.part !== "gluon" && part.part !== "higgs") || part.op !== "test") return undefined

    const actorId = positiveId(part.path)
    const inputId = isInputExecutionId(part.from) ? part.from : null
    const proposal = isExternalInputProposal(part.value) ? part.value : null
    if (actorId === null || inputId === null || proposal === null) {
      throw new Error("External Input requires actor path, input:* identity and non-empty fields")
    }

    const payloadJson = JSON.stringify(canonicalJsonValue({
      actor: actorId,
      part: part.part,
      fields: proposal.fields,
    }))

    const committed = await this.sql.begin(async (tx) => {
      const previous = await this.input(tx, inputId)
      if (previous) {
        if (previous.actor === actorId && previous.part === part.part && previous.payloadJson === payloadJson) return null
        throw new Error(`Input identity ${inputId} was already used for another payload`)
      }

      const actor = await this.actor(tx, actorId)
      if (!actor) throw new Error(`Cannot commit Input for missing actor ${actorId}`)

      const fieldRows = await tx<FieldRow[]>`SELECT id, type FROM field WHERE wimp = ${actor.wimp}`
      const allowed = new Set<number>()
      for (const field of fieldRows) {
        const topology = field.type === "enum" || field.type === "array"
        if ((part.part === "higgs") === topology) allowed.add(Number(field.id))
      }

      const fields = await commitBoundaryActorFields(
        tx,
        actorId,
        actor.wimp,
        allowed,
        proposal.fields,
        `Input ${inputId}`,
      )

      await tx`
        INSERT INTO boundary_input_execution (input_id, actor, part, payload_json)
        VALUES (${inputId}, ${actorId}, ${part.part}, ${payloadJson})
      `
      return {actor, fields}
    })

    if (!committed) return null
    const fields = part.part === "gluon" ? committed.fields.scalar : committed.fields.topology
    return {
      rootSrc: committed.actor.wimp,
      messages: [message({
        part: part.part,
        op: "replace",
        path: actorId,
        from: inputId,
        value: {fields},
      })],
    }
  }

  private async actor(sql: Database, actorId: number): Promise<ActorRow | null> {
    const row = (await sql<ActorRow[]>`SELECT id, wimp FROM actor WHERE id = ${actorId}`)[0]
    return row ? {id: Number(row.id), wimp: row.wimp} : null
  }

  private async input(sql: Database, inputId: string): Promise<InputRow | null> {
    const row = (await sql<InputRow[]>`
      SELECT actor, part, payload_json AS payloadJson
        FROM boundary_input_execution
       WHERE input_id = ${inputId}
    `)[0]
    return row ? {actor: Number(row.actor), part: row.part, payloadJson: row.payloadJson} : null
  }
}
