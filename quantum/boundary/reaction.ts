/**
Boundary registration and commit lifecycle for Reaction executions.

Matrix sends only a trigger for an exact Boundary-resolved relation and a
previously confirmed State event. Boundary validates both identities, snapshots
the declared target Fields, registers one execution and only then offers it to
Energy. Reaction Mass writes happen inside Energy; Boundary commits only
ordinary target Fields.

@packageDocumentation
*/

import type {ReservedSQL, SQL} from "bun"
import type {ForceMessage} from "shared/protocol/force/message"
import type {Particle} from "shared/protocol/force/particle"
import {
  REACTION_SIGNAL_KIND,
  isReactionExecutionClaim,
  isReactionExecutionSignal,
  isReactionResultProposal,
  isReactionTriggerRequest,
  type ReactionExecutionSignal,
  type ReactionRelation,
  type ReactionResultCommit,
  type ReactionResultProposal,
  type ReactionTriggerRequest,
} from "shared/protocol/force/reaction"
import type {BoundaryIncrementalCommit} from "./incremental.ts"
import {commitBoundaryAtomFields, readBoundaryValue} from "./world.ts"

type Database = SQL | ReservedSQL

type AtomStateRow = {
  atomId: number
  wimp: string
  stateId: number
  stateName: string
}

type ReactionExecutionRow = {
  executionId: string
  relationKey: string
  eventId: string
  targetAtom: number
  targetState: number
  targetStateName: string
  sourceAtom: number
  sourceState: number
  reaction: number
  energy: string | null
  status: "pending" | "committed" | "failed" | "superseded"
  requestJson: string
  signalJson: string | null
  resultPart: "w+" | "w-" | null
  resultJson: string | null
}

type CanonicalReaction = {
  id: number
  key: string
  wimp: string
  updateSource: string
  read: number[]
  write: number[]
  states: number[]
  massRead: string[]
  massWrite: string[]
}

const positiveId = (value: unknown): number | null =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null

const message = (part: Particle): ForceMessage => ({parts: [part]})

const relationKey = (reaction: number, targetAtom: number, sourceAtom: number): string =>
  `reaction:${reaction}:target:${targetAtom}:source:${sourceAtom}`

/** Reads the complete exact Reaction adjacency stored by Boundary at one SQL cut. */
export async function readBoundaryReactionRelations(sql: Database): Promise<ReactionRelation[]> {
  const result: ReactionRelation[] = []
  for (const row of await sql<Array<{
    reactionId: number
    reactionKey: string
    targetAtom: number
    targetWimp: string
    sourceAtom: number
    sourceWimp: string
  }>>`
    SELECT relation.reaction AS reactionId,
           reaction.key AS reactionKey,
           relation.target_atom AS targetAtom,
           target.wimp AS targetWimp,
           relation.source_atom AS sourceAtom,
           source.wimp AS sourceWimp
      FROM reaction_relation AS relation
      JOIN reaction ON reaction.id = relation.reaction
      JOIN atom AS target ON target.id = relation.target_atom
      JOIN atom AS source ON source.id = relation.source_atom
     ORDER BY relation.reaction, relation.target_atom, relation.source_atom
  `) {
    result.push({
      kind: "reaction-relation",
      key: relationKey(Number(row.reactionId), Number(row.targetAtom), Number(row.sourceAtom)),
      reactionId: Number(row.reactionId),
      reactionKey: row.reactionKey,
      target: {
        atomId: Number(row.targetAtom),
        wimp: row.targetWimp,
        stateIds: (await sql<Array<{state: number}>>`
          SELECT state FROM reaction_state WHERE reaction = ${row.reactionId} ORDER BY state
        `).map(({state}) => Number(state)),
      },
      source: {
        atomId: Number(row.sourceAtom),
        wimp: row.sourceWimp,
        states: (await sql<Array<{id: number; name: string}>>`
          SELECT state.id, state.name
            FROM reaction_relation_state AS relation_state
            JOIN state ON state.id = relation_state.state
           WHERE relation_state.reaction = ${row.reactionId}
             AND relation_state.target_atom = ${row.targetAtom}
             AND relation_state.source_atom = ${row.sourceAtom}
           ORDER BY state.id
        `).map(({id, name}) => ({id: Number(id), name})),
      },
    })
  }
  return result
}

/**
Boundary-owned Reaction queue registration and result commit.

The queue order itself belongs to Matrix. The unique pending target index is a
fail-closed Boundary check that Matrix never advances two executions of one
target Atom concurrently.
*/
export class BoundaryReactionStore {
  constructor(readonly sql: SQL) {}

  async init(): Promise<void> {
    const columns = await this.sql.unsafe<Array<{name: string}>>(
      "PRAGMA table_info(boundary_reaction_execution)",
    )
    if (columns.length > 0 && !columns.some(({name}) => name === "relation_key")) {
      const count = Number((await this.sql<Array<{count: number}>>`
        SELECT COUNT(*) AS count FROM boundary_reaction_execution
      `)[0]?.count ?? 0)
      if (count > 0) {
        throw new Error(
          "Legacy Reaction executions cannot be resumed after the State-observation contract cutover",
        )
      }
      await this.sql.unsafe("DROP TABLE boundary_reaction_execution")
    }
    await this.sql.unsafe(`
      CREATE TABLE IF NOT EXISTS boundary_reaction_execution (
        execution_id TEXT PRIMARY KEY,
        relation_key TEXT NOT NULL,
        event_id TEXT NOT NULL,
        target_atom INTEGER NOT NULL,
        target_state INTEGER NOT NULL,
        target_state_name TEXT NOT NULL,
        source_atom INTEGER NOT NULL,
        source_state INTEGER NOT NULL,
        reaction INTEGER NOT NULL,
        energy TEXT,
        status TEXT NOT NULL CHECK (status IN ('pending', 'committed', 'failed', 'superseded')),
        request_json TEXT NOT NULL,
        signal_json TEXT,
        result_part TEXT CHECK (result_part IN ('w+', 'w-')),
        result_json TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        committed_at INTEGER,
        UNIQUE (event_id, relation_key)
      );
      CREATE INDEX IF NOT EXISTS boundary_reaction_target_status
        ON boundary_reaction_execution (target_atom, status);
      CREATE UNIQUE INDEX IF NOT EXISTS boundary_reaction_one_pending_target
        ON boundary_reaction_execution (target_atom) WHERE status = 'pending';
    `)
  }

  async apply(input: ForceMessage): Promise<BoundaryIncrementalCommit | null | undefined> {
    const part = input.parts[0]
    if (part.part === "photon" && part.op === "test" && isReactionTriggerRequest(part.value)) {
      return await this.registerTrigger(part, part.value)
    }
    if (part.part === "z" && part.op === "test" && isReactionExecutionClaim(part.value)) {
      return await this.selectEnergy(part)
    }
    if ((part.part === "w+" || part.part === "w-") && part.op === "replace" &&
        isReactionResultProposal(part.value)) {
      return await this.commitResult(part, part.value)
    }
    return undefined
  }

  private async registerTrigger(
    part: Particle,
    request: ReactionTriggerRequest,
  ): Promise<BoundaryIncrementalCommit> {
    const targetAtomId = positiveId(part.path)
    if (targetAtomId === null || targetAtomId !== request.targetAtomId ||
        part.from !== request.reactionExecutionId) {
      throw new Error("Reaction trigger path or execution identity is inconsistent")
    }
    const expectedRelationKey = relationKey(
      request.reactionId,
      request.targetAtomId,
      request.source.atomId,
    )
    if (request.relationKey !== expectedRelationKey) {
      throw new Error(`Reaction trigger relation identity is inconsistent: ${request.relationKey}`)
    }

    const registered = await this.sql.begin(async (sql) => {
      const previous = await this.execution(sql, request.reactionExecutionId)
      if (previous) {
        if (previous.requestJson !== JSON.stringify(request)) {
          throw new Error(`Reaction execution identity collision: ${request.reactionExecutionId}`)
        }
        return {execution: previous, targetWimp: (await this.atomState(sql, targetAtomId))?.wimp ?? ""}
      }
      const duplicate = (await sql<Array<{executionId: string}>>`
        SELECT execution_id AS executionId
          FROM boundary_reaction_execution
         WHERE event_id = ${request.eventId} AND relation_key = ${request.relationKey}
      `)[0]
      if (duplicate) throw new Error(
        `Reaction event ${request.eventId} relation ${request.relationKey} is already execution ${duplicate.executionId}`,
      )

      const event = (await sql<Array<{atom: number; stateId: number; wimp: string; stateName: string}>>`
        SELECT event.atom, event.state_id AS stateId, event.wimp, event.state_name AS stateName
          FROM boundary_state_event AS event
         WHERE event.event_id = ${request.eventId}
      `)[0]
      if (!event || Number(event.atom) !== request.source.atomId ||
          Number(event.stateId) !== request.source.stateId || event.wimp !== request.source.wimp ||
          event.stateName !== request.source.state) {
        throw new Error(`Reaction trigger references an unconfirmed State event ${request.eventId}`)
      }

      const target = await this.atomState(sql, targetAtomId)
      if (!target) throw new Error(`Reaction target Atom ${targetAtomId} is unavailable`)
      const relation = await this.relation(sql, request)
      const active = relation !== null && relation.target.stateIds.includes(target.stateId)
      if (!active) {
        await sql`
          INSERT INTO boundary_reaction_execution (
            execution_id, relation_key, event_id, target_atom, target_state,
            target_state_name, source_atom, source_state, reaction,
            status, request_json, signal_json, committed_at
          ) VALUES (
            ${request.reactionExecutionId}, ${request.relationKey}, ${request.eventId},
            ${targetAtomId}, ${target.stateId}, ${target.stateName},
            ${request.source.atomId}, ${request.source.stateId}, ${request.reactionId},
            ${"superseded"}, ${JSON.stringify(request)}, NULL, unixepoch()
          )
        `
        return {
          execution: (await this.execution(sql, request.reactionExecutionId))!,
          targetWimp: target.wimp,
        }
      }

      const reaction = await this.reaction(sql, request.reactionId, target.wimp)
      if (!reaction || reaction.key !== relation.reactionKey || !reaction.states.includes(target.stateId)) {
        throw new Error(`Reaction ${request.reactionId} declaration is unavailable for target ${targetAtomId}`)
      }
      const signal: ReactionExecutionSignal = {
        kind: REACTION_SIGNAL_KIND,
        reactionExecutionId: request.reactionExecutionId,
        relationKey: request.relationKey,
        reactionId: reaction.id,
        reactionKey: reaction.key,
        eventId: request.eventId,
        target: {
          atomId: target.atomId,
          wimp: target.wimp,
          stateId: target.stateId,
          state: target.stateName,
        },
        source: structuredClone(request.source),
        timestamp: request.timestamp,
        readFields: await this.readFields(sql, reaction, targetAtomId),
        writeFields: await this.writeFields(sql, reaction),
        massRead: await this.massKeys(sql, reaction, targetAtomId, "reaction_mass_read"),
        massWrite: await this.massKeys(sql, reaction, targetAtomId, "reaction_mass_write"),
        updateSource: reaction.updateSource,
      }
      await sql`
        INSERT INTO boundary_reaction_execution (
          execution_id, relation_key, event_id, target_atom, target_state,
          target_state_name, source_atom, source_state, reaction,
          status, request_json, signal_json
        ) VALUES (
          ${request.reactionExecutionId}, ${request.relationKey}, ${request.eventId},
          ${targetAtomId}, ${target.stateId}, ${target.stateName},
          ${request.source.atomId}, ${request.source.stateId}, ${request.reactionId},
          ${"pending"}, ${JSON.stringify(request)}, ${JSON.stringify(signal)}
        )
      `
      return {
        execution: (await this.execution(sql, request.reactionExecutionId))!,
        targetWimp: target.wimp,
      }
    })

    if (registered.execution.status !== "pending") {
      return {
        rootSrc: registered.targetWimp,
        messages: [this.terminalMessage(registered.execution)],
      }
    }
    const signal = registered.execution.signalJson === null
      ? null
      : JSON.parse(registered.execution.signalJson) as unknown
    if (!isReactionExecutionSignal(signal)) {
      throw new Error(`Invalid registered Reaction signal ${request.reactionExecutionId}`)
    }
    return {
      rootSrc: signal.target.wimp,
      messages: [message({
        part: "photon",
        op: "test",
        path: signal.target.atomId,
        ts: request.timestamp,
        from: signal.reactionExecutionId,
        value: signal,
      })],
    }
  }

  private async selectEnergy(part: Particle): Promise<BoundaryIncrementalCommit | null> {
    const claim = part.value
    if (!isReactionExecutionClaim(claim)) return null
    const energy = claim.energy.trim()
    const selected = await this.sql.begin(async (sql) => {
      const execution = await this.execution(sql, claim.reactionExecutionId)
      if (!execution || execution.status !== "pending") return null
      if (execution.energy !== null && execution.energy !== energy) return null
      await sql`
        UPDATE boundary_reaction_execution
           SET energy = COALESCE(energy, ${energy})
         WHERE execution_id = ${claim.reactionExecutionId}
           AND status = ${"pending"}
           AND (energy IS NULL OR energy = ${energy})
      `
      const signal = execution.signalJson === null
        ? null
        : JSON.parse(execution.signalJson) as unknown
      if (!isReactionExecutionSignal(signal)) {
        throw new Error(`Invalid stored Reaction signal ${claim.reactionExecutionId}`)
      }
      return signal
    })
    if (!selected) return null
    return {
      rootSrc: selected.target.wimp,
      messages: [message({
        part: "z",
        op: "copy",
        path: selected.target.atomId,
        ts: Date.now(),
        from: energy,
        value: selected,
      })],
    }
  }

  private async commitResult(
    part: Particle,
    proposal: ReactionResultProposal,
  ): Promise<BoundaryIncrementalCommit | null> {
    if (part.part !== "w+" && part.part !== "w-") {
      throw new Error("Reaction result must use W+ or W-")
    }
    const resultPart: "w+" | "w-" = part.part
    const targetAtomId = positiveId(part.path)
    const energy = typeof part.from === "string" ? part.from.trim() : ""
    if (targetAtomId === null || energy.length === 0) {
      throw new Error("Reaction result requires target Atom and Energy source")
    }
    const resultJson = JSON.stringify(proposal)
    const committed = await this.sql.begin(async (sql) => {
      const execution = await this.execution(sql, proposal.reactionExecutionId)
      if (!execution) throw new Error(`Unknown Reaction execution ${proposal.reactionExecutionId}`)
      if (execution.targetAtom !== targetAtomId || execution.reaction !== proposal.reactionId ||
          execution.relationKey !== proposal.relationKey) {
        throw new Error(`Reaction result does not match execution ${proposal.reactionExecutionId}`)
      }
      if (execution.status !== "pending") {
        if (execution.status === "superseded" &&
            (execution.energy === null || execution.energy === energy)) return {
          targetWimp: (await this.atomState(sql, targetAtomId))?.wimp ?? "",
          execution,
          consequences: [] as ForceMessage[],
        }
        if (execution.energy === energy && execution.resultPart === resultPart &&
            execution.resultJson === resultJson) return null
        throw new Error(`Reaction execution ${proposal.reactionExecutionId} is already ${execution.status}`)
      }
      if (execution.energy !== energy) {
        throw new Error(`Reaction result does not match selected Energy for ${proposal.reactionExecutionId}`)
      }

      const signalValue = execution.signalJson === null
        ? null
        : JSON.parse(execution.signalJson) as unknown
      if (!isReactionExecutionSignal(signalValue)) {
        throw new Error(`Invalid Reaction signal ${proposal.reactionExecutionId}`)
      }
      const signal = signalValue
      const target = await this.atomState(sql, targetAtomId)
      const reaction = target ? await this.reaction(sql, proposal.reactionId, target.wimp) : null
      const relation = await this.relation(sql, {
        kind: "reaction-trigger",
        reactionExecutionId: signal.reactionExecutionId,
        relationKey: signal.relationKey,
        reactionId: signal.reactionId,
        eventId: signal.eventId,
        targetAtomId: signal.target.atomId,
        source: signal.source,
        timestamp: signal.timestamp,
      })
      const stillValid = target !== null && reaction !== null && relation !== null &&
        relation.target.stateIds.includes(target.stateId) && reaction.states.includes(target.stateId)
      if (!stillValid) {
        await sql`
          UPDATE boundary_reaction_execution
             SET status = ${"superseded"}, committed_at = unixepoch()
           WHERE execution_id = ${proposal.reactionExecutionId} AND status = ${"pending"}
        `
        return {
          targetWimp: target?.wimp ?? signal.target.wimp,
          execution: {...execution, status: "superseded" as const},
          consequences: [] as ForceMessage[],
        }
      }

      if (resultPart === "w+" && proposal.error !== undefined) {
        throw new Error("Successful Reaction result cannot contain an error")
      }
      if (resultPart === "w-" && Object.keys(proposal.fields).length > 0) {
        throw new Error("Failed Reaction cannot commit Fields")
      }
      const allowed = new Set(reaction.write)
      const fieldCommit = resultPart === "w+"
        ? await commitBoundaryAtomFields(
            sql,
            targetAtomId,
            target!.wimp,
            allowed,
            proposal.fields,
            `Reaction ${proposal.reactionId}`,
          )
        : {scalar: {}, topology: {}, aliases: []}
      if (Object.keys(fieldCommit.topology).length > 0 ||
          fieldCommit.aliases.some((alias) => Object.keys(alias.topology).length > 0)) {
        throw new Error(`Reaction ${proposal.reactionId} attempted a topology Field write`)
      }

      const status = resultPart === "w+" ? "committed" : "failed"
      const updated = await sql<Array<{executionId: string}>>`
        UPDATE boundary_reaction_execution
           SET status = ${status}, result_part = ${resultPart}, result_json = ${resultJson},
               committed_at = unixepoch()
         WHERE execution_id = ${proposal.reactionExecutionId} AND status = ${"pending"}
        RETURNING execution_id AS executionId
      `
      if (updated.length !== 1) throw new Error(`Concurrent Reaction commit ${proposal.reactionExecutionId}`)
      const consequences: ForceMessage[] = []
      const ts = Date.now()
      if (Object.keys(fieldCommit.scalar).length > 0) consequences.push(message({
        part: "gluon",
        op: "replace",
        path: targetAtomId,
        ts,
        from: proposal.reactionExecutionId,
        value: {fields: fieldCommit.scalar},
      }))
      for (const alias of fieldCommit.aliases) if (Object.keys(alias.scalar).length > 0) {
        consequences.push(message({
          part: "gluon",
          op: "replace",
          path: alias.atom,
          ts,
          from: proposal.reactionExecutionId,
          value: {fields: alias.scalar},
        }))
      }
      return {
        targetWimp: target!.wimp,
        execution: {...execution, status, resultPart, resultJson},
        consequences,
      }
    })

    if (!committed) return null
    return {
      rootSrc: committed.targetWimp,
      messages: [...committed.consequences, this.terminalMessage(committed.execution)],
    }
  }

  private terminalMessage(execution: ReactionExecutionRow): ForceMessage {
    const status = execution.status === "pending" ? "superseded" : execution.status
    const acknowledgement: ReactionResultCommit = {
      reactionExecutionId: execution.executionId,
      relationKey: execution.relationKey,
      reactionId: execution.reaction,
      energy: execution.energy,
      status,
    }
    return message({
      part: status === "committed" ? "w+" : "w-",
      op: "copy",
      path: execution.targetAtom,
      ts: Date.now(),
      from: execution.executionId,
      value: acknowledgement,
    })
  }

  private async relation(
    sql: Database,
    request: ReactionTriggerRequest,
  ): Promise<ReactionRelation | null> {
    const row = (await sql<Array<{
      reactionKey: string
      targetWimp: string
      sourceWimp: string
    }>>`
      SELECT reaction.key AS reactionKey, target.wimp AS targetWimp, source.wimp AS sourceWimp
        FROM reaction_relation AS relation
        JOIN reaction ON reaction.id = relation.reaction
        JOIN atom AS target ON target.id = relation.target_atom
        JOIN atom AS source ON source.id = relation.source_atom
       WHERE relation.reaction = ${request.reactionId}
         AND relation.target_atom = ${request.targetAtomId}
         AND relation.source_atom = ${request.source.atomId}
         AND EXISTS (
           SELECT 1 FROM reaction_relation_state AS relation_state
            WHERE relation_state.reaction = relation.reaction
              AND relation_state.target_atom = relation.target_atom
              AND relation_state.source_atom = relation.source_atom
              AND relation_state.state = ${request.source.stateId}
         )
    `)[0]
    if (!row || row.sourceWimp !== request.source.wimp) return null
    const stateName = (await sql<Array<{name: string}>>`
      SELECT name FROM state WHERE id = ${request.source.stateId}
    `)[0]?.name
    if (stateName !== request.source.state) return null
    return {
      kind: "reaction-relation",
      key: request.relationKey,
      reactionId: request.reactionId,
      reactionKey: row.reactionKey,
      target: {
        atomId: request.targetAtomId,
        wimp: row.targetWimp,
        stateIds: (await sql<Array<{state: number}>>`
          SELECT state FROM reaction_state WHERE reaction = ${request.reactionId} ORDER BY state
        `).map(({state}) => Number(state)),
      },
      source: {
        atomId: request.source.atomId,
        wimp: row.sourceWimp,
        states: (await sql<Array<{id: number; name: string}>>`
          SELECT state.id, state.name
            FROM reaction_relation_state AS relation_state
            JOIN state ON state.id = relation_state.state
           WHERE relation_state.reaction = ${request.reactionId}
             AND relation_state.target_atom = ${request.targetAtomId}
             AND relation_state.source_atom = ${request.source.atomId}
           ORDER BY state.id
        `).map(({id, name}) => ({id: Number(id), name})),
      },
    }
  }

  private async readFields(
    sql: Database,
    reaction: CanonicalReaction,
    targetAtomId: number,
  ): Promise<Array<[number, string, unknown]>> {
    const fields: Array<[number, string, unknown]> = []
    for (const row of await sql<Array<{id: number; key: string; value: number | null}>>`
      SELECT field.id, field.key, atom_value.value
        FROM reaction_read AS link
        JOIN field ON field.id = link.field
        LEFT JOIN atom_value
          ON atom_value.atom = ${targetAtomId} AND atom_value.field = field.id
       WHERE link.reaction = ${reaction.id}
       ORDER BY field.id
    `) {
      if (row.value === null) {
        throw new Error(`Reaction ${reaction.id} declared Field ${row.key} is unavailable on Atom ${targetAtomId}`)
      }
      fields.push([Number(row.id), row.key, await readBoundaryValue(sql, Number(row.value))])
    }
    if (fields.length !== reaction.read.length) {
      throw new Error(`Reaction ${reaction.id} read Field declaration is inconsistent`)
    }
    return fields
  }

  private async writeFields(
    sql: Database,
    reaction: CanonicalReaction,
  ): Promise<Array<[number, string]>> {
    const fields = await sql<Array<{id: number; key: string; type: string}>>`
      SELECT field.id, field.key, field.type
        FROM reaction_write AS link
        JOIN field ON field.id = link.field
       WHERE link.reaction = ${reaction.id}
       ORDER BY field.id
    `
    if (fields.length !== reaction.write.length) {
      throw new Error(`Reaction ${reaction.id} write Field declaration is inconsistent`)
    }
    return fields.map((field) => {
      if (field.type === "enum" || field.type === "array") {
        throw new Error(`Reaction ${reaction.id} cannot write topology Field ${field.key}`)
      }
      return [Number(field.id), field.key]
    })
  }

  private async massKeys(
    sql: Database,
    reaction: CanonicalReaction,
    targetAtomId: number,
    table: "reaction_mass_read" | "reaction_mass_write",
  ): Promise<string[]> {
    const expected = table === "reaction_mass_read" ? reaction.massRead : reaction.massWrite
    const rows = await sql.unsafe<Array<{key: string; active: number; membership: string | null}>>(
      `SELECT declaration.local_key AS key, declaration.active, membership.key AS membership
         FROM ${table} AS link
         JOIN mass_declaration AS declaration ON declaration.id = link.mass
         LEFT JOIN mass_membership AS membership
           ON membership.atom = ? AND membership.declaration = declaration.id
        WHERE link.reaction = ?
        ORDER BY declaration.local_id, declaration.id`,
      [targetAtomId, reaction.id],
    )
    if (rows.length !== expected.length) {
      throw new Error(`Reaction ${reaction.id} Mass declaration is inconsistent`)
    }
    for (const row of rows) if (Number(row.active) !== 1 || row.membership === null) {
      throw new Error(`Reaction ${reaction.id} declared Mass ${row.key} is unavailable on Atom ${targetAtomId}`)
    }
    return rows.map(({key}) => key)
  }

  private async atomState(sql: Database, atomId: number): Promise<AtomStateRow | null> {
    const row = (await sql<AtomStateRow[]>`
      SELECT atom.id AS atomId, atom.wimp, state.id AS stateId, state.name AS stateName
        FROM atom
        JOIN atom_state ON atom_state.atom = atom.id
        JOIN state ON state.id = atom_state.metaState
       WHERE atom.id = ${atomId}
    `)[0]
    return row ? {
      atomId: Number(row.atomId),
      wimp: row.wimp,
      stateId: Number(row.stateId),
      stateName: row.stateName,
    } : null
  }

  private async execution(sql: Database, executionId: string): Promise<ReactionExecutionRow | null> {
    const row = (await sql<ReactionExecutionRow[]>`
      SELECT execution_id AS executionId,
             relation_key AS relationKey,
             event_id AS eventId,
             target_atom AS targetAtom,
             target_state AS targetState,
             target_state_name AS targetStateName,
             source_atom AS sourceAtom,
             source_state AS sourceState,
             reaction,
             energy,
             status,
             request_json AS requestJson,
             signal_json AS signalJson,
             result_part AS resultPart,
             result_json AS resultJson
        FROM boundary_reaction_execution
       WHERE execution_id = ${executionId}
    `)[0]
    return row ? {
      ...row,
      targetAtom: Number(row.targetAtom),
      targetState: Number(row.targetState),
      sourceAtom: Number(row.sourceAtom),
      sourceState: Number(row.sourceState),
      reaction: Number(row.reaction),
    } : null
  }

  private async reaction(
    sql: Database,
    reactionId: number,
    wimp: string,
  ): Promise<CanonicalReaction | null> {
    const row = (await sql<Array<{id: number; key: string; updateSource: string}>>`
      SELECT id, key, update_source AS updateSource
        FROM reaction WHERE id = ${reactionId} AND wimp = ${wimp}
    `)[0]
    if (!row) return null
    const massKeys = async (table: "reaction_mass_read" | "reaction_mass_write"): Promise<string[]> =>
      (await sql.unsafe<Array<{key: string}>>(
        `SELECT declaration.local_key AS key
           FROM ${table} AS link
           JOIN mass_declaration AS declaration ON declaration.id = link.mass
          WHERE link.reaction = ?
          ORDER BY declaration.local_id, declaration.id`,
        [reactionId],
      )).map(({key}) => key)
    return {
      id: Number(row.id),
      key: row.key,
      wimp,
      updateSource: row.updateSource,
      read: (await sql<Array<{field: number}>>`
        SELECT field FROM reaction_read WHERE reaction = ${reactionId} ORDER BY field
      `).map(({field}) => Number(field)),
      write: (await sql<Array<{field: number}>>`
        SELECT field FROM reaction_write WHERE reaction = ${reactionId} ORDER BY field
      `).map(({field}) => Number(field)),
      states: (await sql<Array<{state: number}>>`
        SELECT state FROM reaction_state WHERE reaction = ${reactionId} ORDER BY state
      `).map(({state}) => Number(state)),
      massRead: await massKeys("reaction_mass_read"),
      massWrite: await massKeys("reaction_mass_write"),
    }
  }
}
