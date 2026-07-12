import type {ReservedSQL, SQL} from "bun"
import type {ForceMessage} from "@metafor/types/force/message"
import type {Particle} from "@metafor/types/force/particle"
import {
  REACTION_SIGNAL_KIND,
  isReactionExecutionClaim,
  isReactionExecutionSignal,
  isReactionResultProposal,
  type ReactionExecutionSignal,
  type ReactionResultCommit,
  type ReactionResultProposal,
} from "@metafor/types/force/reaction"
import type {BoundaryIncrementalCommit} from "./incremental.ts"
import {commitBoundaryActorFields} from "./world.ts"

type Database = SQL | ReservedSQL
type JsonRecord = Record<string, unknown>

type ActorStateRow = {
  actorId: number
  wimp: string
  stateId: number
  stateName: string
}

type ReactionExecutionRow = {
  executionId: string
  targetActor: number
  reaction: number
  targetState: string
  energy: string | null
  status: "pending" | "committed" | "skipped" | "failed" | "superseded"
  signalJson: string
  resultPart: "w+" | "w-" | null
  resultJson: string | null
}

type CanonicalReaction = {
  id: number
  wimp: string
  cond: string
  update: string
  read: number[]
  write: number[]
  states: number[]
}

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const positiveId = (value: unknown): number | null =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null

const message = (part: Particle): ForceMessage => ({parts: [part]})

/**
 * Boundary schedules Reaction candidates from committed world consequences,
 * selects one Energy executor and commits the resulting writes through the same
 * world writer used by Process W results.
 */
export class BoundaryReactionStore {
  constructor(readonly sql: SQL) {}

  async init(): Promise<void> {
    await this.sql.unsafe(`
      CREATE TABLE IF NOT EXISTS boundary_reaction_execution (
        execution_id TEXT PRIMARY KEY,
        target_actor INTEGER NOT NULL,
        reaction INTEGER NOT NULL,
        target_state TEXT NOT NULL,
        energy TEXT,
        status TEXT NOT NULL CHECK (status IN ('pending', 'committed', 'skipped', 'failed', 'superseded')),
        signal_json TEXT NOT NULL,
        result_part TEXT CHECK (result_part IN ('w+', 'w-')),
        result_json TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        committed_at INTEGER,
        FOREIGN KEY (target_actor) REFERENCES actor (id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS boundary_reaction_target_status
        ON boundary_reaction_execution (target_actor, status);
    `)
  }

  async apply(input: ForceMessage): Promise<BoundaryIncrementalCommit | null | undefined> {
    const part = input.parts[0]
    if (part.part === "photon" && (part.op === "replace" || part.op === "test") && typeof part.value === "string") {
      await this.supersedeForStateChange(part)
      return undefined
    }
    if (part.part === "z" && part.op === "test" && isReactionExecutionClaim(part.value)) {
      return await this.selectEnergy(part)
    }
    if ((part.part === "w+" || part.part === "w-") && part.op === "replace" && isReactionResultProposal(part.value)) {
      return await this.commitResult(part, part.value)
    }
    return undefined
  }

  /** Builds candidate signals only from consequences already committed by Boundary. */
  async derive(committedMessages: readonly ForceMessage[]): Promise<ForceMessage[]> {
    const signals: ForceMessage[] = []
    for (const committed of committedMessages) {
      const part = committed.parts[0]
      if ((part.part !== "gluon" && part.part !== "higgs") ||
          (part.op !== "add" && part.op !== "replace" && part.op !== "remove")) continue
      const sourceActorId = positiveId(part.path)
      if (sourceActorId === null) continue
      signals.push(...await this.deriveForFieldConsequence(sourceActorId, part))
    }
    return signals
  }

  private async deriveForFieldConsequence(sourceActorId: number, part: Particle): Promise<ForceMessage[]> {
    const source = await this.actorState(this.sql, sourceActorId)
    if (!source) return []

    const targets = await this.sql<ActorStateRow[]>`
      SELECT actor.id AS actorId,
             actor.wimp AS wimp,
             state.id AS stateId,
             state.name AS stateName
        FROM actor
        JOIN actor_state ON actor_state.actor = actor.id
        JOIN state ON state.id = actor_state.metaState
       WHERE actor.id <> ${sourceActorId}
       ORDER BY actor.id
    `
    const result: ForceMessage[] = []
    const reactionCache = new Map<string, CanonicalReaction[]>()

    for (const rawTarget of targets) {
      const target: ActorStateRow = {
        actorId: Number(rawTarget.actorId),
        wimp: rawTarget.wimp,
        stateId: Number(rawTarget.stateId),
        stateName: rawTarget.stateName,
      }
      let reactions = reactionCache.get(target.wimp)
      if (!reactions) {
        reactions = await this.reactions(this.sql, target.wimp)
        reactionCache.set(target.wimp, reactions)
      }
      if (reactions.length === 0) continue

      const value = await this.actorValues(this.sql, target.actorId, target.wimp)
      const fieldKeys = await this.fieldKeys(this.sql, target.wimp)

      for (const reaction of reactions) {
        if (!reaction.states.includes(target.stateId)) continue
        const reactionExecutionId = crypto.randomUUID()
        const writeFields: Array<[number, string]> = []
        for (const fieldId of reaction.write) {
          const key = fieldKeys.get(fieldId)
          if (key) writeFields.push([fieldId, key])
        }
        if (writeFields.length !== reaction.write.length) {
          throw new Error(`Reaction ${reaction.id} references missing write Fields`)
        }

        const signal: ReactionExecutionSignal = {
          kind: REACTION_SIGNAL_KIND,
          reactionExecutionId,
          reactionId: reaction.id,
          target: {
            actorId: target.actorId,
            wimp: target.wimp,
            state: target.stateName,
          },
          source: {
            actorId: source.actorId,
            wimp: source.wimp,
            timestamp: Date.now(),
            part: {
              op: part.op,
              path: "/context",
              ...(part.from === undefined ? {} : {from: part.from}),
              ...(part.value === undefined ? {} : {value: structuredClone(part.value)}),
            },
          },
          value,
          writeFields,
          cond: reaction.cond,
          update: reaction.update,
        }

        await this.sql`
          INSERT INTO boundary_reaction_execution
            (execution_id, target_actor, reaction, target_state, status, signal_json)
          VALUES (${reactionExecutionId}, ${target.actorId}, ${reaction.id}, ${target.stateName}, ${"pending"}, ${JSON.stringify(signal)})
        `
        result.push(message({
          part: "photon",
          op: "test",
          path: target.actorId,
          from: reactionExecutionId,
          value: signal,
        }))
      }
    }
    return result
  }

  private async selectEnergy(part: Particle): Promise<BoundaryIncrementalCommit | null> {
    const claim = part.value
    if (!isReactionExecutionClaim(claim)) return null
    const energy = claim.energy.trim()

    const selected = await this.sql.begin(async (tx) => {
      const execution = await this.execution(tx, claim.reactionExecutionId)
      if (!execution || execution.status !== "pending") return null
      if (execution.energy !== null && execution.energy !== energy) return null

      await tx`
        UPDATE boundary_reaction_execution
           SET energy = COALESCE(energy, ${energy})
         WHERE execution_id = ${claim.reactionExecutionId}
           AND status = ${"pending"}
           AND (energy IS NULL OR energy = ${energy})
      `
      const signal = JSON.parse(execution.signalJson) as unknown
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
        path: selected.target.actorId,
        from: energy,
        value: selected,
      })],
    }
  }

  private async commitResult(
    part: Particle,
    proposal: ReactionResultProposal,
  ): Promise<BoundaryIncrementalCommit | null> {
    const targetActorId = positiveId(part.path)
    const energy = typeof part.from === "string" ? part.from.trim() : ""
    if (targetActorId === null || energy.length === 0) {
      throw new Error("Reaction W result requires target Actor and Energy source")
    }

    const resultJson = JSON.stringify(proposal)
    const committed = await this.sql.begin(async (tx) => {
      const execution = await this.execution(tx, proposal.reactionExecutionId)
      if (!execution) throw new Error(`Unknown Reaction execution ${proposal.reactionExecutionId}`)
      if (execution.status !== "pending") {
        if (
          execution.targetActor === targetActorId &&
          execution.reaction === proposal.reactionId &&
          execution.energy === energy &&
          execution.resultPart === part.part &&
          execution.resultJson === resultJson
        ) return null
        throw new Error(`Reaction execution ${proposal.reactionExecutionId} is already ${execution.status}`)
      }
      if (execution.targetActor !== targetActorId || execution.reaction !== proposal.reactionId || execution.energy !== energy) {
        throw new Error(`Reaction result does not match selected execution ${proposal.reactionExecutionId}`)
      }

      const signalValue = JSON.parse(execution.signalJson) as unknown
      if (!isReactionExecutionSignal(signalValue)) throw new Error(`Invalid Reaction signal ${proposal.reactionExecutionId}`)
      const signal = signalValue
      const target = await this.actorState(tx, targetActorId)
      const reaction = target ? await this.reactionById(tx, target.wimp, proposal.reactionId) : null
      if (!target || !reaction || target.stateName !== execution.targetState || target.stateName !== signal.target.state ||
          !reaction.states.includes(target.stateId)) {
        throw new Error(`Reaction declaration or State changed during execution ${proposal.reactionExecutionId}`)
      }

      if (part.part === "w+" && (!proposal.matched || proposal.error !== undefined)) {
        throw new Error(`Successful Reaction result must be matched and error-free`)
      }
      if (part.part === "w-" && Object.keys(proposal.fields).length > 0) {
        throw new Error(`Failed or skipped Reaction cannot commit Fields`)
      }

      const allowed = new Set(reaction.write)
      const fieldCommit = part.part === "w+"
        ? await commitBoundaryActorFields(
            tx,
            targetActorId,
            target.wimp,
            allowed,
            proposal.fields,
            `Reaction ${proposal.reactionId}`,
          )
        : {scalar: {}, topology: {}}

      const status: ReactionExecutionRow["status"] = part.part === "w+"
        ? "committed"
        : proposal.matched || proposal.error !== undefined
          ? "failed"
          : "skipped"
      const updated = await tx<Array<{executionId: string}>>`
        UPDATE boundary_reaction_execution
           SET status = ${status},
               result_part = ${part.part},
               result_json = ${resultJson},
               committed_at = unixepoch()
         WHERE execution_id = ${proposal.reactionExecutionId}
           AND status = ${"pending"}
        RETURNING execution_id AS executionId
      `
      if (updated.length !== 1) throw new Error(`Concurrent Reaction commit ${proposal.reactionExecutionId}`)
      return {target, status, ...fieldCommit}
    })

    if (!committed) return null
    const consequences: ForceMessage[] = []
    if (Object.keys(committed.scalar).length > 0) {
      consequences.push(message({
        part: "gluon",
        op: "replace",
        path: targetActorId,
        from: proposal.reactionExecutionId,
        value: {fields: committed.scalar},
      }))
    }
    if (Object.keys(committed.topology).length > 0) {
      consequences.push(message({
        part: "higgs",
        op: "replace",
        path: targetActorId,
        from: proposal.reactionExecutionId,
        value: {fields: committed.topology},
      }))
    }
    const acknowledgement: ReactionResultCommit = {
      reactionExecutionId: proposal.reactionExecutionId,
      reactionId: proposal.reactionId,
      energy,
      status: committed.status === "committed" ? "committed" : committed.status === "skipped" ? "skipped" : "failed",
    }
    consequences.push(message({
      part: part.part,
      op: "copy",
      path: targetActorId,
      from: proposal.reactionExecutionId,
      value: acknowledgement,
    }))
    return {rootSrc: committed.target.wimp, messages: consequences}
  }

  private async supersedeForStateChange(part: Particle): Promise<void> {
    const actorId = positiveId(part.path)
    if (actorId === null) return
    await this.sql`
      UPDATE boundary_reaction_execution
         SET status = ${"superseded"}
       WHERE target_actor = ${actorId}
         AND status = ${"pending"}
    `
  }

  private async actorState(sql: Database, actorId: number): Promise<ActorStateRow | null> {
    const row = (await sql<ActorStateRow[]>`
      SELECT actor.id AS actorId,
             actor.wimp AS wimp,
             state.id AS stateId,
             state.name AS stateName
        FROM actor
        JOIN actor_state ON actor_state.actor = actor.id
        JOIN state ON state.id = actor_state.metaState
       WHERE actor.id = ${actorId}
    `)[0]
    return row ? {
      actorId: Number(row.actorId),
      wimp: row.wimp,
      stateId: Number(row.stateId),
      stateName: row.stateName,
    } : null
  }

  private async actorValues(sql: Database, actorId: number, wimp: string): Promise<Record<string, unknown>> {
    const value: Record<string, unknown> = {}
    for (const row of await sql<Array<{key: string; valueJson: string}>>`
      SELECT field.key AS key,
             boundary_actor_field.value_json AS valueJson
        FROM field
        JOIN boundary_actor_field ON boundary_actor_field.field = field.id
       WHERE boundary_actor_field.actor = ${actorId}
         AND field.wimp = ${wimp}
       ORDER BY field.local_id, field.id
    `) value[row.key] = JSON.parse(row.valueJson) as unknown
    return value
  }

  private async fieldKeys(sql: Database, wimp: string): Promise<Map<number, string>> {
    const rows = await sql<Array<{id: number; key: string}>>`
      SELECT id, key FROM field WHERE wimp = ${wimp}
    `
    return new Map(rows.map((row) => [Number(row.id), row.key]))
  }

  private async execution(sql: Database, executionId: string): Promise<ReactionExecutionRow | null> {
    const row = (await sql<ReactionExecutionRow[]>`
      SELECT execution_id AS executionId,
             target_actor AS targetActor,
             reaction,
             target_state AS targetState,
             energy,
             status,
             signal_json AS signalJson,
             result_part AS resultPart,
             result_json AS resultJson
        FROM boundary_reaction_execution
       WHERE execution_id = ${executionId}
    `)[0]
    return row ? {
      ...row,
      targetActor: Number(row.targetActor),
      reaction: Number(row.reaction),
    } : null
  }

  private async reactionById(sql: Database, wimp: string, reactionId: number): Promise<CanonicalReaction | null> {
    for (const reaction of await this.reactions(sql, wimp)) if (reaction.id === reactionId) return reaction
    return null
  }

  private async reactions(sql: Database, wimp: string): Promise<CanonicalReaction[]> {
    const result: CanonicalReaction[] = []
    for (const row of await sql<Array<{canonicalJson: string}>>`
      SELECT canonical_json AS canonicalJson
        FROM boundary_declaration_entity
       WHERE src = ${wimp} AND section = ${"reactions"}
       ORDER BY CAST(local_id AS INTEGER)
    `) {
      const value = JSON.parse(row.canonicalJson) as unknown
      if (!isRecord(value) || positiveId(value.id) === null || typeof value.cond !== "string" || typeof value.src !== "string") continue
      const numbers = (items: unknown): number[] => Array.isArray(items)
        ? items.filter((item): item is number => positiveId(item) !== null)
        : []
      result.push({
        id: value.id as number,
        wimp,
        cond: value.cond,
        update: value.src,
        read: numbers(value.read),
        write: numbers(value.write),
        states: numbers(value.states),
      })
    }
    return result
  }
}
