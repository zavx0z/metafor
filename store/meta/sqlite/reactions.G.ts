import type { SQL } from "bun"
import type { ReactionsSchema } from "../../.."
import type { ReactionRow } from "./reactions.t.ts"

export const getReactions = async (
  sql: SQL,
  src: string,
  fieldKeys: Map<string, string>,
): Promise<ReactionsSchema | undefined> => {
  const reactionRows = await sql<ReactionRow[]>`
    SELECT uuid, key, label, desc, cond_source, update_source
    FROM reaction
    WHERE meta = ${src}
    ORDER BY reaction.rowid
  `
  if (reactionRows.length === 0) return

  const reactionReads = await sql<Array<{ reaction: string; field: string }>>`
    SELECT reaction_read.reaction AS reaction, reaction_read.field AS field
    FROM reaction_read
    INNER JOIN reaction ON reaction.uuid = reaction_read.reaction
    WHERE reaction.meta = ${src}
    ORDER BY reaction_read.rowid
  `

  const reactionWrites = await sql<Array<{ reaction: string; field: string }>>`
    SELECT reaction_write.reaction AS reaction, reaction_write.field AS field
    FROM reaction_write
    INNER JOIN reaction ON reaction.uuid = reaction_write.reaction
    WHERE reaction.meta = ${src}
    ORDER BY reaction_write.rowid
  `

  const reactionStates = await sql<Array<{ reaction: string; state_name: string }>>`
    SELECT reaction_superposition.reaction AS reaction, superposition.name AS state_name
    FROM reaction_superposition
    INNER JOIN reaction ON reaction.uuid = reaction_superposition.reaction
    INNER JOIN superposition ON superposition.uuid = reaction_superposition.superposition
    WHERE reaction.meta = ${src}
    ORDER BY reaction_superposition.rowid
  `

  const readsByReaction = new Map<string, string[]>()
  for (const row of reactionReads) {
    const reads = readsByReaction.get(row.reaction) ?? []
    const fieldKey = fieldKeys.get(row.field)
    if (fieldKey) reads.push(fieldKey)
    readsByReaction.set(row.reaction, reads)
  }

  const writesByReaction = new Map<string, string[]>()
  for (const row of reactionWrites) {
    const writes = writesByReaction.get(row.reaction) ?? []
    const fieldKey = fieldKeys.get(row.field)
    if (fieldKey) writes.push(fieldKey)
    writesByReaction.set(row.reaction, writes)
  }

  const statesByReaction = new Map<string, string[]>()
  for (const row of reactionStates) {
    const states = statesByReaction.get(row.reaction) ?? []
    states.push(row.state_name)
    statesByReaction.set(row.reaction, states)
  }

  const reactions: ReactionsSchema = {
    reactions: {},
    superposition: {},
  }

  for (const row of reactionRows) {
    const reaction: ReactionsSchema["reactions"][string] = {
      label: row.label,
      cond: row.cond_source,
      src: row.update_source,
    }

    const reads = readsByReaction.get(row.uuid)
    const writes = writesByReaction.get(row.uuid)
    if (row.desc !== null) reaction.desc = row.desc
    if (reads && reads.length > 0) reaction.read = reads
    if (writes && writes.length > 0) reaction.write = writes

    reactions.reactions[row.key] = reaction

    for (const stateName of statesByReaction.get(row.uuid) ?? []) {
      const reactionKeys = reactions.superposition[stateName] ?? []
      reactionKeys.push(row.key)
      reactions.superposition[stateName] = reactionKeys
    }
  }

  return reactions
}
