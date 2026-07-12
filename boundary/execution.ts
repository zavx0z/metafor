import type {ReservedSQL, SQL} from "bun"
import type {
  ProcessExecutionGrant,
  ProcessResultCommit,
  ProcessResultProposal,
} from "@metafor/types/force/execution"
import {isProcessExecutionId} from "@metafor/types/force/execution"
import type {ForceMessage} from "@metafor/types/force/message"
import type {Particle} from "@metafor/types/force/particle"
import type {BoundaryIncrementalCommit} from "./incremental.ts"
import {commitBoundaryActorFields} from "./world.ts"

type Database = SQL | ReservedSQL
type JsonRecord = Record<string, unknown>

type ActorRow = {
  id: number
  wimp: string
}

type StateRow = {
  id: number
  name: string
}

type ExecutionRow = {
  executionId: string
  actor: number
  process: number
  state: string
  energy: string | null
  status: "pending" | "committed" | "failed" | "superseded"
  resultPart: "w+" | "w-" | null
  resultJson: string | null
}

type CanonicalProcess = {
  id: number
  wimp: string
  state: string
  descriptor: JsonRecord
}

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const positiveId = (value: unknown): number | null =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null

const message = (part: Particle): ForceMessage => ({parts: [part]})

const executionValue = (value: unknown): ProcessExecutionGrant | null => {
  if (!isRecord(value) || !isProcessExecutionId(value.processExecutionId) || !isRecord(value.fields)) return null
  return {
    processExecutionId: value.processExecutionId,
    fields: value.fields,
  }
}

const proposalValue = (value: unknown): ProcessResultProposal | null => {
  if (
    !isRecord(value) ||
    !isProcessExecutionId(value.processExecutionId) ||
    positiveId(value.processId) === null ||
    !isRecord(value.fields) ||
    (value.error !== undefined && typeof value.error !== "string")
  ) return null
  return {
    processExecutionId: value.processExecutionId,
    processId: value.processId as number,
    fields: value.fields,
    ...(typeof value.error === "string" ? {error: value.error} : {}),
  }
}

/**
 * Boundary-owned State and Process execution lifecycle.
 * Matrix computes State, Energy executes Process, but Boundary alone persists
 * the materialized State and turns a proposed W result into durable Fields.
 */
export class BoundaryExecutionStore {
  constructor(readonly sql: SQL) {}

  async init(): Promise<void> {
    await this.sql.unsafe(`
      CREATE TABLE IF NOT EXISTS boundary_process_execution (
        execution_id TEXT PRIMARY KEY,
        actor INTEGER NOT NULL,
        process INTEGER NOT NULL,
        state TEXT NOT NULL,
        energy TEXT,
        status TEXT NOT NULL CHECK (status IN ('pending', 'committed', 'failed', 'superseded')),
        result_part TEXT CHECK (result_part IN ('w+', 'w-')),
        result_json TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        committed_at INTEGER,
        FOREIGN KEY (actor) REFERENCES actor (id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS boundary_execution_actor_status
        ON boundary_process_execution (actor, status);
    `)
  }

  async apply(input: ForceMessage): Promise<BoundaryIncrementalCommit | null | undefined> {
    const part = input.parts[0]
    if (part.part === "photon" && part.op === "replace") return await this.commitState(part)
    if (part.part === "photon" && part.op === "test") return await this.registerExecution(part)
    if (part.part === "z" && part.op === "copy") return await this.selectEnergy(part)
    if ((part.part === "w+" || part.part === "w-") && part.op === "replace") {
      const proposal = proposalValue(part.value)
      return proposal ? await this.commitResult(part, proposal) : undefined
    }
    return undefined
  }

  private async commitState(part: Particle): Promise<null | undefined> {
    const actorId = positiveId(part.path)
    const stateName = typeof part.value === "string" ? part.value : null
    if (actorId === null || stateName === null) return undefined

    await this.sql.begin(async (tx) => {
      const actor = await this.actor(tx, actorId)
      const state = actor ? await this.stateForName(tx, actor.wimp, stateName) : null
      if (!actor || !state) throw new Error(`Cannot commit State for actor=${actorId} state=${stateName}`)

      await tx`
        INSERT INTO actor_state (actor, metaState)
        VALUES (${actorId}, ${state.id})
        ON CONFLICT (actor) DO UPDATE SET metaState = excluded.metaState
      `
      await tx`
        UPDATE boundary_process_execution
           SET status = ${"superseded"}
         WHERE actor = ${actorId}
           AND status = ${"pending"}
      `
    })
    return null
  }

  private async registerExecution(part: Particle): Promise<null | undefined> {
    const actorId = positiveId(part.path)
    const stateName = typeof part.value === "string" ? part.value : null
    const processExecutionId = isProcessExecutionId(part.from) ? part.from : null
    if (actorId === null || stateName === null || processExecutionId === null) return undefined

    await this.sql.begin(async (tx) => {
      const actor = await this.actor(tx, actorId)
      const state = actor ? await this.stateForName(tx, actor.wimp, stateName) : null
      const process = actor ? await this.processForState(tx, actor.wimp, stateName) : null
      if (!actor || !state || !process) {
        throw new Error(`Cannot register process execution for actor=${actorId} state=${stateName}`)
      }

      const existing = await this.execution(tx, processExecutionId)
      if (existing) {
        if (existing.actor !== actorId || existing.process !== process.id || existing.state !== stateName) {
          throw new Error(`Process execution identity collision: ${processExecutionId}`)
        }
        if (existing.status !== "pending") return
      }

      await tx`
        INSERT INTO actor_state (actor, metaState)
        VALUES (${actorId}, ${state.id})
        ON CONFLICT (actor) DO UPDATE SET metaState = excluded.metaState
      `
      await tx`
        UPDATE boundary_process_execution
           SET status = ${"superseded"}
         WHERE actor = ${actorId}
           AND status = ${"pending"}
           AND execution_id <> ${processExecutionId}
      `
      await tx`
        INSERT INTO boundary_process_execution (execution_id, actor, process, state, status)
        VALUES (${processExecutionId}, ${actorId}, ${process.id}, ${stateName}, ${"pending"})
        ON CONFLICT (execution_id) DO NOTHING
      `

      const inserted = await this.execution(tx, processExecutionId)
      if (!inserted || inserted.actor !== actorId || inserted.process !== process.id || inserted.state !== stateName) {
        throw new Error(`Process execution identity collision: ${processExecutionId}`)
      }
    })
    return null
  }

  private async selectEnergy(part: Particle): Promise<null | undefined> {
    const actorId = positiveId(part.path)
    const grant = executionValue(part.value)
    const energy = typeof part.from === "string" ? part.from.trim() : ""
    if (actorId === null || !grant || energy.length === 0) return undefined

    const updated = await this.sql<Array<{executionId: string}>>`
      UPDATE boundary_process_execution
         SET energy = COALESCE(energy, ${energy})
       WHERE execution_id = ${grant.processExecutionId}
         AND actor = ${actorId}
         AND status = ${"pending"}
         AND (energy IS NULL OR energy = ${energy})
      RETURNING execution_id AS executionId
    `
    if (updated.length !== 1) {
      throw new Error(`Energy selection does not match pending execution ${grant.processExecutionId}`)
    }
    return null
  }

  private async commitResult(
    part: Particle,
    proposal: ProcessResultProposal,
  ): Promise<BoundaryIncrementalCommit | null> {
    const actorId = positiveId(part.path)
    const energy = typeof part.from === "string" ? part.from.trim() : ""
    if (actorId === null || energy.length === 0) {
      throw new Error("W result requires actor path, Energy source, processExecutionId, processId and fields")
    }

    const resultJson = JSON.stringify(proposal)
    const committed = await this.sql.begin(async (tx) => {
      const execution = await this.execution(tx, proposal.processExecutionId)
      if (!execution) throw new Error(`Unknown process execution: ${proposal.processExecutionId}`)
      if (execution.status !== "pending") {
        if (
          execution.actor === actorId &&
          execution.process === proposal.processId &&
          execution.energy === energy &&
          execution.resultPart === part.part &&
          execution.resultJson === resultJson
        ) return null
        throw new Error(`Process execution ${proposal.processExecutionId} is already ${execution.status}`)
      }
      if (execution.actor !== actorId || execution.process !== proposal.processId || execution.energy !== energy) {
        throw new Error(`W result does not match selected execution ${proposal.processExecutionId}`)
      }

      const actor = await this.actor(tx, actorId)
      const process = actor ? await this.processById(tx, actor.wimp, proposal.processId) : null
      const currentState = actor ? await this.currentState(tx, actorId) : null
      if (!actor || !process || process.state !== execution.state || currentState?.name !== execution.state) {
        throw new Error(`Process declaration or State changed during execution ${proposal.processExecutionId}`)
      }

      const handlerName = part.part === "w+" ? "success" : "error"
      const handler = isRecord(process.descriptor[handlerName]) ? process.descriptor[handlerName] as JsonRecord : null
      const writeFields = handler?.writeFields
      const allowed = new Set<number>()
      if (Array.isArray(writeFields)) {
        for (const item of writeFields) {
          if (Array.isArray(item) && positiveId(item[0]) !== null) allowed.add(item[0] as number)
        }
      }

      const fieldCommit = await commitBoundaryActorFields(
        tx,
        actorId,
        actor.wimp,
        allowed,
        proposal.fields,
        `Process ${proposal.processId}`,
      )

      const status = part.part === "w+" ? "committed" : "failed"
      const updated = await tx<Array<{executionId: string}>>`
        UPDATE boundary_process_execution
           SET status = ${status},
               result_part = ${part.part},
               result_json = ${resultJson},
               committed_at = unixepoch()
         WHERE execution_id = ${proposal.processExecutionId}
           AND status = ${"pending"}
        RETURNING execution_id AS executionId
      `
      if (updated.length !== 1) throw new Error(`Concurrent W commit for ${proposal.processExecutionId}`)
      return {actor, ...fieldCommit}
    })

    if (!committed) return null
    const consequences: ForceMessage[] = []
    if (Object.keys(committed.scalar).length > 0) {
      consequences.push(message({
        part: "gluon",
        op: "replace",
        path: actorId,
        from: proposal.processExecutionId,
        value: {fields: committed.scalar},
      }))
    }
    if (Object.keys(committed.topology).length > 0) {
      consequences.push(message({
        part: "higgs",
        op: "replace",
        path: actorId,
        from: proposal.processExecutionId,
        value: {fields: committed.topology},
      }))
    }
    const acknowledgement: ProcessResultCommit = {
      processExecutionId: proposal.processExecutionId,
      processId: proposal.processId,
      energy,
    }
    consequences.push(message({
      part: part.part,
      op: "copy",
      path: actorId,
      from: proposal.processExecutionId,
      value: acknowledgement,
    }))
    return {rootSrc: committed.actor.wimp, messages: consequences}
  }

  private async actor(sql: Database, actorId: number): Promise<ActorRow | null> {
    const actor = (await sql<ActorRow[]>`
      SELECT id, wimp FROM actor WHERE id = ${actorId}
    `)[0]
    return actor ? {id: Number(actor.id), wimp: actor.wimp} : null
  }

  private async stateForName(sql: Database, wimp: string, name: string): Promise<StateRow | null> {
    const state = (await sql<StateRow[]>`
      SELECT id, name FROM state WHERE wimp = ${wimp} AND name = ${name}
    `)[0]
    return state ? {id: Number(state.id), name: state.name} : null
  }

  private async currentState(sql: Database, actorId: number): Promise<StateRow | null> {
    const state = (await sql<StateRow[]>`
      SELECT state.id, state.name
        FROM actor_state
        JOIN state ON state.id = actor_state.metaState
       WHERE actor_state.actor = ${actorId}
    `)[0]
    return state ? {id: Number(state.id), name: state.name} : null
  }

  private async execution(sql: Database, processExecutionId: string): Promise<ExecutionRow | null> {
    const row = (await sql<ExecutionRow[]>`
      SELECT execution_id AS executionId,
             actor,
             process,
             state,
             energy,
             status,
             result_part AS resultPart,
             result_json AS resultJson
        FROM boundary_process_execution
       WHERE execution_id = ${processExecutionId}
    `)[0]
    return row ? {
      ...row,
      actor: Number(row.actor),
      process: Number(row.process),
    } : null
  }

  private async processForState(sql: Database, wimp: string, state: string): Promise<CanonicalProcess | null> {
    for (const process of await this.processes(sql, wimp)) if (process.state === state) return process
    return null
  }

  private async processById(sql: Database, wimp: string, processId: number): Promise<CanonicalProcess | null> {
    for (const process of await this.processes(sql, wimp)) if (process.id === processId) return process
    return null
  }

  private async processes(sql: Database, wimp: string): Promise<CanonicalProcess[]> {
    const result: CanonicalProcess[] = []
    for (const row of await sql<Array<{canonicalJson: string}>>`
      SELECT canonical_json AS canonicalJson
        FROM boundary_declaration_entity
       WHERE src = ${wimp} AND section = ${"processes"}
       ORDER BY CAST(local_id AS INTEGER)
    `) {
      const value = JSON.parse(row.canonicalJson) as unknown
      if (!isRecord(value) || positiveId(value.id) === null || typeof value.state !== "string" || !isRecord(value.descriptor)) continue
      result.push({
        id: value.id as number,
        wimp,
        state: value.state,
        descriptor: value.descriptor,
      })
    }
    return result
  }
}
