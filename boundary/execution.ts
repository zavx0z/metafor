import type {ReservedSQL, SQL} from "bun"
import type {
  ProcessExecutionGrant,
  ProcessResultCommit,
  ProcessResultProposal,
} from "shared/protocol/force/execution"
import {isProcessExecutionId} from "shared/protocol/force/execution"
import type {ForceMessage} from "shared/protocol/force/message"
import type {Particle} from "shared/protocol/force/particle"
import type {BoundaryIncrementalCommit} from "./incremental.ts"
import {commitBoundaryAtomFields} from "./world.ts"

type Database = SQL | ReservedSQL
type JsonRecord = Record<string, unknown>

type AtomRow = {
  id: number
  wimp: string
}

type StateRow = {
  id: number
  name: string
}

type ExecutionRow = {
  executionId: string
  atom: number
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
        atom INTEGER NOT NULL,
        process INTEGER NOT NULL,
        state TEXT NOT NULL,
        energy TEXT,
        status TEXT NOT NULL CHECK (status IN ('pending', 'committed', 'failed', 'superseded')),
        result_part TEXT CHECK (result_part IN ('w+', 'w-')),
        result_json TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        committed_at INTEGER,
        FOREIGN KEY (atom) REFERENCES atom (id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS boundary_execution_atom_status
        ON boundary_process_execution (atom, status);
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
    const atomId = positiveId(part.path)
    const stateName = typeof part.value === "string" ? part.value : null
    if (atomId === null || stateName === null) return undefined

    await this.sql.begin(async (tx) => {
      const atom = await this.atom(tx, atomId)
      const state = atom ? await this.stateForName(tx, atom.wimp, stateName) : null
      if (!atom || !state) throw new Error(`Cannot commit State for atom=${atomId} state=${stateName}`)

      await tx`
        INSERT INTO atom_state (atom, metaState)
        VALUES (${atomId}, ${state.id})
        ON CONFLICT (atom) DO UPDATE SET metaState = excluded.metaState
      `
      await tx`
        UPDATE boundary_process_execution
           SET status = ${"superseded"}
         WHERE atom = ${atomId}
           AND status = ${"pending"}
      `
    })
    return null
  }

  private async registerExecution(part: Particle): Promise<null | undefined> {
    const atomId = positiveId(part.path)
    const stateName = typeof part.value === "string" ? part.value : null
    const processExecutionId = isProcessExecutionId(part.from) ? part.from : null
    if (atomId === null || stateName === null || processExecutionId === null) return undefined

    await this.sql.begin(async (tx) => {
      const atom = await this.atom(tx, atomId)
      const state = atom ? await this.stateForName(tx, atom.wimp, stateName) : null
      const process = atom ? await this.processForState(tx, atom.wimp, stateName) : null
      if (!atom || !state || !process) {
        throw new Error(`Cannot register process execution for atom=${atomId} state=${stateName}`)
      }

      const existing = await this.execution(tx, processExecutionId)
      if (existing) {
        if (existing.atom !== atomId || existing.process !== process.id || existing.state !== stateName) {
          throw new Error(`Process execution identity collision: ${processExecutionId}`)
        }
        if (existing.status !== "pending") return
      }

      await tx`
        INSERT INTO atom_state (atom, metaState)
        VALUES (${atomId}, ${state.id})
        ON CONFLICT (atom) DO UPDATE SET metaState = excluded.metaState
      `
      await tx`
        UPDATE boundary_process_execution
           SET status = ${"superseded"}
         WHERE atom = ${atomId}
           AND status = ${"pending"}
           AND execution_id <> ${processExecutionId}
      `
      await tx`
        INSERT INTO boundary_process_execution (execution_id, atom, process, state, status)
        VALUES (${processExecutionId}, ${atomId}, ${process.id}, ${stateName}, ${"pending"})
        ON CONFLICT (execution_id) DO NOTHING
      `

      const inserted = await this.execution(tx, processExecutionId)
      if (!inserted || inserted.atom !== atomId || inserted.process !== process.id || inserted.state !== stateName) {
        throw new Error(`Process execution identity collision: ${processExecutionId}`)
      }
    })
    return null
  }

  private async selectEnergy(part: Particle): Promise<null | undefined> {
    const atomId = positiveId(part.path)
    const grant = executionValue(part.value)
    const energy = typeof part.from === "string" ? part.from.trim() : ""
    if (atomId === null || !grant || energy.length === 0) return undefined

    const updated = await this.sql<Array<{executionId: string}>>`
      UPDATE boundary_process_execution
         SET energy = COALESCE(energy, ${energy})
       WHERE execution_id = ${grant.processExecutionId}
         AND atom = ${atomId}
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
    const atomId = positiveId(part.path)
    const energy = typeof part.from === "string" ? part.from.trim() : ""
    if (atomId === null || energy.length === 0) {
      throw new Error("W result requires atom path, Energy source, processExecutionId, processId and fields")
    }

    const resultJson = JSON.stringify(proposal)
    const committed = await this.sql.begin(async (tx) => {
      const execution = await this.execution(tx, proposal.processExecutionId)
      if (!execution) throw new Error(`Unknown process execution: ${proposal.processExecutionId}`)
      if (execution.status !== "pending") {
        if (
          execution.atom === atomId &&
          execution.process === proposal.processId &&
          execution.energy === energy &&
          execution.resultPart === part.part &&
          execution.resultJson === resultJson
        ) return null
        throw new Error(`Process execution ${proposal.processExecutionId} is already ${execution.status}`)
      }
      if (execution.atom !== atomId || execution.process !== proposal.processId || execution.energy !== energy) {
        throw new Error(`W result does not match selected execution ${proposal.processExecutionId}`)
      }

      const atom = await this.atom(tx, atomId)
      const process = atom ? await this.processById(tx, atom.wimp, proposal.processId) : null
      const currentState = atom ? await this.currentState(tx, atomId) : null
      if (!atom || !process || process.state !== execution.state || currentState?.name !== execution.state) {
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

      const fieldCommit = await commitBoundaryAtomFields(
        tx,
        atomId,
        atom.wimp,
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
      return {atom, ...fieldCommit}
    })

    if (!committed) return null
    const consequences: ForceMessage[] = []
    const ts = Date.now()
    if (Object.keys(committed.scalar).length > 0) {
      consequences.push(message({
        part: "gluon",
        op: "replace",
        path: atomId,
        ts,
        from: proposal.processExecutionId,
        value: {fields: committed.scalar},
      }))
    }
    if (Object.keys(committed.topology).length > 0) {
      consequences.push(message({
        part: "higgs",
        op: "replace",
        path: atomId,
        ts,
        from: proposal.processExecutionId,
        value: {fields: committed.topology},
      }))
    }
    for (const alias of committed.aliases) {
      if (Object.keys(alias.scalar).length > 0) consequences.push(message({
        part: "gluon",
        op: "replace",
        path: alias.atom,
        ts,
        from: proposal.processExecutionId,
        value: {fields: alias.scalar},
      }))
      if (Object.keys(alias.topology).length > 0) consequences.push(message({
        part: "higgs",
        op: "replace",
        path: alias.atom,
        ts,
        from: proposal.processExecutionId,
        value: {fields: alias.topology},
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
      path: atomId,
      ts,
      from: proposal.processExecutionId,
      value: acknowledgement,
    }))
    return {rootSrc: committed.atom.wimp, messages: consequences}
  }

  private async atom(sql: Database, atomId: number): Promise<AtomRow | null> {
    const atom = (await sql<AtomRow[]>`
      SELECT id, wimp FROM atom WHERE id = ${atomId}
    `)[0]
    return atom ? {id: Number(atom.id), wimp: atom.wimp} : null
  }

  private async stateForName(sql: Database, wimp: string, name: string): Promise<StateRow | null> {
    const state = (await sql<StateRow[]>`
      SELECT id, name FROM state WHERE wimp = ${wimp} AND name = ${name}
    `)[0]
    return state ? {id: Number(state.id), name: state.name} : null
  }

  private async currentState(sql: Database, atomId: number): Promise<StateRow | null> {
    const state = (await sql<StateRow[]>`
      SELECT state.id, state.name
        FROM atom_state
        JOIN state ON state.id = atom_state.metaState
       WHERE atom_state.atom = ${atomId}
    `)[0]
    return state ? {id: Number(state.id), name: state.name} : null
  }

  private async execution(sql: Database, processExecutionId: string): Promise<ExecutionRow | null> {
    const row = (await sql<ExecutionRow[]>`
      SELECT execution_id AS executionId,
             atom,
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
      atom: Number(row.atom),
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
    for (const row of await sql<Array<{
      id: number; key: string; type: "action" | "finally"; label: string | null; desc: string | null
    }>>`
      SELECT id, key, type, label, desc FROM process WHERE wimp = ${wimp} ORDER BY local_id, id
    `) {
      const env = (await sql<Array<{env: string}>>`SELECT env FROM process_env WHERE process = ${row.id} ORDER BY env`).map((item) => item.env)
      const fields = async (
        table: "process_action_read" | "process_action_write" | "process_finally_read",
        phase?: string,
      ): Promise<Array<[number, string]>> => {
        const rows = table === "process_finally_read"
          ? await sql<Array<{id: number; key: string}>>`
              SELECT field.id, field.key FROM process_finally_read AS link
              JOIN field ON field.id = link.field WHERE link.process = ${row.id} ORDER BY field.id
            `
          : await sql.unsafe<Array<{id: number; key: string}>>(
              `SELECT field.id, field.key FROM ${table} AS link JOIN field ON field.id = link.field WHERE link.process = ? AND link.phase = ? ORDER BY field.id`,
              [row.id, phase],
            )
        return rows.map((field) => [Number(field.id), field.key])
      }
      let descriptor: JsonRecord
      if (row.type === "finally") {
        const before = (await sql<Array<{src: string}>>`SELECT before AS src FROM process_finally WHERE process = ${row.id}`)[0]
        descriptor = {
          type: "finally", key: row.key, label: row.label, desc: row.desc, env,
          before: {src: before?.src ?? "", readFields: await fields("process_finally_read")},
        }
      } else {
        const action = (await sql<Array<{
          src: string; importSpecifier: string | null; wrapperSrc: string | null; success: string | null; error: string | null
        }>>`
          SELECT action AS src, action_import_specifier AS importSpecifier,
                 action_wrapper_src AS wrapperSrc, success, error
            FROM process_action WHERE process = ${row.id}
        `)[0]
        if (!action) continue
        const handler = async (phase: "success" | "error", src: string | null): Promise<JsonRecord | undefined> => src === null ? undefined : ({
          src,
          readFields: await fields("process_action_read", phase),
          writeFields: await fields("process_action_write", phase),
        })
        const success = await handler("success", action.success)
        const error = await handler("error", action.error)
        descriptor = {
          type: "action", key: row.key, label: row.label, desc: row.desc, env,
          action: {
            src: action.src,
            ...(action.importSpecifier ? {importSpecifier: action.importSpecifier} : {}),
            ...(action.wrapperSrc ? {wrapperSrc: action.wrapperSrc} : {}),
            readFields: await fields("process_action_read", "action"),
          },
          ...(success ? {success} : {}),
          ...(error ? {error} : {}),
        }
      }
      result.push({
        id: Number(row.id),
        wimp,
        state: row.key,
        descriptor,
      })
    }
    return result
  }
}
