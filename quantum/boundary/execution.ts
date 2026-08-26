import type {ReservedSQL, SQL} from "bun"
import type {
  ProcessExecutionGrant,
  ProcessResultCommit,
  ProcessResultProposal,
} from "shared/protocol/force/execution"
import {isProcessExecutionId} from "shared/protocol/force/execution"
import {
  REACTION_STATE_COMMIT_KIND,
  type ReactionResultCommit,
  type ReactionStateCommit,
} from "shared/protocol/force/reaction"
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

type SupersededReactionRow = {
  executionId: string
  relationKey: string
  reactionId: number
  energy: string | null
}

type StateCommitResult = {
  atom: AtomRow
  state: StateRow
  changed: boolean
  eventId: string
  supersededReactions: SupersededReactionRow[]
}

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const positiveId = (value: unknown): number | null =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null

const message = (part: Particle): ForceMessage => ({parts: [part]})

const eventId = (part: Particle): string => {
  if (typeof part.from !== "string" || part.from.trim().length === 0) {
    throw new Error("State transition requires a stable event identity")
  }
  return part.from
}

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
Boundary-owned State and Process execution lifecycle.

Matrix computes State and Energy executes Process, but Boundary alone persists
the materialized State and turns a proposed W result into durable Fields. Every
actual State change records a stable event and publishes one confirmation used
by Matrix Reaction routing; same-State Process retrigger does neither.
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
      CREATE TABLE IF NOT EXISTS boundary_retired_process_execution (
        execution_id TEXT PRIMARY KEY,
        atom INTEGER NOT NULL,
        process INTEGER NOT NULL,
        state TEXT NOT NULL,
        energy TEXT
      );
      CREATE TABLE IF NOT EXISTS boundary_state_event (
        event_id TEXT PRIMARY KEY,
        atom INTEGER NOT NULL,
        wimp TEXT NOT NULL,
        state_id INTEGER NOT NULL,
        state_name TEXT NOT NULL,
        committed_at INTEGER NOT NULL DEFAULT (unixepoch())
      );
      CREATE INDEX IF NOT EXISTS boundary_state_event_by_atom
        ON boundary_state_event (atom, committed_at, event_id);
    `)
    const stateEventColumns = await this.sql.unsafe<Array<{name: string}>>(
      "PRAGMA table_info(boundary_state_event)",
    )
    if (!stateEventColumns.some(({name}) => name === "state_name")) {
      await this.sql.begin(async (sql) => {
        await sql.unsafe("DROP INDEX IF EXISTS boundary_state_event_by_atom")
        await sql.unsafe("ALTER TABLE boundary_state_event RENAME TO boundary_state_event_legacy")
        await sql.unsafe(`
          CREATE TABLE boundary_state_event (
            event_id TEXT PRIMARY KEY,
            atom INTEGER NOT NULL,
            wimp TEXT NOT NULL,
            state_id INTEGER NOT NULL,
            state_name TEXT NOT NULL,
            committed_at INTEGER NOT NULL DEFAULT (unixepoch())
          )
        `)
        await sql.unsafe(`
          INSERT INTO boundary_state_event (
            event_id, atom, wimp, state_id, state_name, committed_at
          )
          SELECT legacy.event_id, legacy.atom, atom.wimp, legacy.state,
                 state.name, legacy.committed_at
            FROM boundary_state_event_legacy AS legacy
            JOIN atom ON atom.id = legacy.atom
            JOIN state ON state.id = legacy.state
        `)
        await sql.unsafe("DROP TABLE boundary_state_event_legacy")
        await sql.unsafe(`
          CREATE INDEX boundary_state_event_by_atom
            ON boundary_state_event (atom, committed_at, event_id)
        `)
      })
    }
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

  private async commitState(part: Particle): Promise<BoundaryIncrementalCommit | null | undefined> {
    const atomId = positiveId(part.path)
    const stateName = typeof part.value === "string" ? part.value : null
    if (atomId === null || stateName === null) return undefined
    const stableEventId = eventId(part)
    const committed = await this.sql.begin(async (tx) => {
      const atom = await this.atom(tx, atomId)
      if (!atom) return null
      const state = await this.stateForName(tx, atom.wimp, stateName)
      if (!state) throw new Error(`Cannot commit State for atom=${atomId} state=${stateName}`)
      return await this.commitStateIn(tx, atom, state, stableEventId)
    })
    return committed ? this.stateCommit(committed, part.ts) : null
  }

  private async registerExecution(part: Particle): Promise<BoundaryIncrementalCommit | null | undefined> {
    const atomId = positiveId(part.path)
    const stateName = typeof part.value === "string" ? part.value : null
    const processExecutionId = isProcessExecutionId(part.from) ? part.from : null
    if (atomId === null || stateName === null || processExecutionId === null) return undefined

    const committed = await this.sql.begin(async (tx) => {
      const atom = await this.atom(tx, atomId)
      if (!atom) return null
      const state = await this.stateForName(tx, atom.wimp, stateName)
      const process = await this.processForState(tx, atom.wimp, stateName)
      if (!state || !process) {
        throw new Error(`Cannot register process execution for atom=${atomId} state=${stateName}`)
      }

      const existing = await this.execution(tx, processExecutionId)
      const retired = (await tx<Array<{ok: number}>>`
        SELECT 1 AS ok FROM boundary_retired_process_execution
         WHERE execution_id = ${processExecutionId}
      `)[0]
      if (retired) throw new Error(`Process execution identity collision: ${processExecutionId}`)
      if (existing) {
        if (existing.atom !== atomId || existing.process !== process.id || existing.state !== stateName) {
          throw new Error(`Process execution identity collision: ${processExecutionId}`)
        }
        if (existing.status !== "pending") return null
      }

      const stateCommit = await this.commitStateIn(tx, atom, state, processExecutionId)
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
      return stateCommit
    })
    return committed ? this.stateCommit(committed, part.ts) : null
  }

  private async commitStateIn(
    sql: Database,
    atom: AtomRow,
    state: StateRow,
    stableEventId: string,
  ): Promise<StateCommitResult> {
    const previous = await this.currentState(sql, atom.id)
    const changed = previous?.id !== state.id
    const existingEvent = (await sql<Array<{
      atom: number
      wimp: string
      stateId: number
      stateName: string
    }>>`
      SELECT atom, wimp, state_id AS stateId, state_name AS stateName
        FROM boundary_state_event WHERE event_id = ${stableEventId}
    `)[0]
    if (existingEvent && (Number(existingEvent.atom) !== atom.id || existingEvent.wimp !== atom.wimp ||
        Number(existingEvent.stateId) !== state.id || existingEvent.stateName !== state.name)) {
      throw new Error(`State event identity collision: ${stableEventId}`)
    }
    if (existingEvent) return {
      atom,
      state,
      changed: previous?.id === state.id,
      eventId: stableEventId,
      supersededReactions: [],
    }
    await sql`
      INSERT INTO atom_state (atom, metaState)
      VALUES (${atom.id}, ${state.id})
      ON CONFLICT (atom) DO UPDATE SET metaState = excluded.metaState
    `
    if (!changed) return {
      atom,
      state,
      changed: false,
      eventId: stableEventId,
      supersededReactions: [],
    }

    await sql`
      INSERT OR IGNORE INTO boundary_state_event (event_id, atom, wimp, state_id, state_name)
      VALUES (${stableEventId}, ${atom.id}, ${atom.wimp}, ${state.id}, ${state.name})
    `

    await sql`
      UPDATE boundary_process_execution
         SET status = ${"superseded"}
       WHERE atom = ${atom.id}
         AND status = ${"pending"}
    `
    const supersededReactions = await sql<SupersededReactionRow[]>`
      SELECT execution.execution_id AS executionId,
             execution.relation_key AS relationKey,
             execution.reaction AS reactionId,
             execution.energy
        FROM boundary_reaction_execution AS execution
       WHERE execution.target_atom = ${atom.id}
         AND execution.status = ${"pending"}
         AND NOT EXISTS (
           SELECT 1 FROM reaction_state
            WHERE reaction_state.reaction = execution.reaction
              AND reaction_state.state = ${state.id}
         )
       ORDER BY execution.created_at, execution.execution_id
    `
    if (supersededReactions.length > 0) await sql`
      UPDATE boundary_reaction_execution
         SET status = ${"superseded"}, committed_at = unixepoch()
       WHERE target_atom = ${atom.id}
         AND status = ${"pending"}
         AND NOT EXISTS (
           SELECT 1 FROM reaction_state
            WHERE reaction_state.reaction = boundary_reaction_execution.reaction
              AND reaction_state.state = ${state.id}
         )
    `
    return {
      atom,
      state,
      changed: true,
      eventId: stableEventId,
      supersededReactions: supersededReactions.map((execution) => ({
        ...execution,
        reactionId: Number(execution.reactionId),
      })),
    }
  }

  private stateCommit(committed: StateCommitResult, timestamp: number): BoundaryIncrementalCommit | null {
    if (!committed.changed) return null
    const confirmation: ReactionStateCommit = {
      kind: REACTION_STATE_COMMIT_KIND,
      eventId: committed.eventId,
      atomId: committed.atom.id,
      wimp: committed.atom.wimp,
      stateId: committed.state.id,
      state: committed.state.name,
    }
    const messages: ForceMessage[] = [message({
      part: "photon",
      op: "copy",
      path: committed.atom.id,
      ts: timestamp,
      from: committed.eventId,
      value: confirmation,
    })]
    for (const execution of committed.supersededReactions) {
      const acknowledgement: ReactionResultCommit = {
        reactionExecutionId: execution.executionId,
        relationKey: execution.relationKey,
        reactionId: execution.reactionId,
        energy: execution.energy,
        status: "superseded",
      }
      messages.push(message({
        part: "w-",
        op: "copy",
        path: committed.atom.id,
        ts: timestamp,
        from: execution.executionId,
        value: acknowledgement,
      }))
    }
    return {rootSrc: committed.atom.wimp, messages}
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
      const superseded = await this.sql<Array<{executionId: string}>>`
        UPDATE boundary_process_execution
           SET energy = COALESCE(energy, ${energy})
         WHERE execution_id = ${grant.processExecutionId}
           AND atom = ${atomId}
           AND status = ${"superseded"}
           AND (energy IS NULL OR energy = ${energy})
        RETURNING execution_id AS executionId
      `
      if (superseded.length === 1) return null
      const retired = await this.sql<Array<{executionId: string}>>`
        UPDATE boundary_retired_process_execution
           SET energy = COALESCE(energy, ${energy})
         WHERE execution_id = ${grant.processExecutionId}
           AND atom = ${atomId}
           AND (energy IS NULL OR energy = ${energy})
        RETURNING execution_id AS executionId
      `
      if (retired.length === 1) return null
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
      if (!execution) {
        const retired = (await tx<Array<{atom: number; process: number; energy: string | null}>>`
          SELECT atom, process, energy FROM boundary_retired_process_execution
           WHERE execution_id = ${proposal.processExecutionId}
        `)[0]
        if (
          retired && Number(retired.atom) === atomId && Number(retired.process) === proposal.processId &&
          retired.energy === energy
        ) return null
        throw new Error(`Unknown process execution: ${proposal.processExecutionId}`)
      }
      if (execution.status !== "pending") {
        if (
          execution.status === "superseded" &&
          execution.atom === atomId &&
          execution.process === proposal.processId &&
          execution.energy === energy
        ) return null
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
