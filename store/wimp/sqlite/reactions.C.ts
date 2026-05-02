import type { SQL } from "bun"
import type { MetaDSL, ReactionsSchema } from "../../.."
import type { FieldUuidByKey, StateUuidByName } from "./reactions.t.ts"

export async function createReactions(
  sql: SQL,
  meta: MetaDSL,
  src: string,
  fieldUuids: FieldUuidByKey,
  stateUuids: StateUuidByName,
): Promise<void> {
  if (!meta.reactions) return

  const rs = meta.reactions as ReactionsSchema
  for (const [id, r] of Object.entries(rs.reactions)) {
    const uuid = crypto.randomUUID()
    await sql`
      INSERT INTO reaction (uuid, wimp, key, label, desc, cond_source, update_source)
      VALUES (${uuid}, ${src}, ${id}, ${r.label}, ${r.desc || null}, ${r.cond}, ${r.src})
    `

    if (r.read) {
      for (const fieldKey of r.read) {
        const fieldUuid = fieldUuids.get(fieldKey)
        if (fieldUuid) {
          await sql`INSERT INTO reaction_read (reaction, field) VALUES (${uuid}, ${fieldUuid})`
        }
      }
    }
    if (r.write) {
      for (const fieldKey of r.write) {
        const fieldUuid = fieldUuids.get(fieldKey)
        if (fieldUuid) {
          await sql`INSERT INTO reaction_write (reaction, field) VALUES (${uuid}, ${fieldUuid})`
        }
      }
    }

    // Reaction Superpositions
    for (const [state, reactionIds] of Object.entries(rs.superposition)) {
      if (reactionIds.includes(id)) {
        const stateUuid = stateUuids.get(state)
        if (stateUuid) {
          await sql`INSERT INTO reaction_superposition (reaction, superposition) VALUES (${uuid}, ${stateUuid})`
        }
      }
    }
  }
}
