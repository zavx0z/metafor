import type { Database } from "bun:sqlite"
import type { MetaDSL, ReactionsSchema } from "../.."

export function relationReactions(
  db: Database,
  meta: MetaDSL,
  src: string,
  fieldUuids: Map<string, string>,
  stateUuids: Map<string, string>,
): void {
  if (!meta.reactions) return

  const rs = meta.reactions as ReactionsSchema
  for (const [id, r] of Object.entries(rs.reactions)) {
    const uuid = `reaction:${src}:${id}`
    db.query("INSERT INTO reaction (uuid, meta, key, label, desc, cond_source, update_source) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(uuid, src, id, r.label, r.desc || null, r.cond, r.src)

    if (r.read) {
      r.read.forEach((fieldKey) => {
        const fieldUuid = fieldUuids.get(fieldKey)
        if (fieldUuid) {
          db.query("INSERT INTO reaction_read (reaction, field) VALUES (?, ?)").run(uuid, fieldUuid)
        }
      })
    }
    if (r.write) {
      r.write.forEach((fieldKey) => {
        const fieldUuid = fieldUuids.get(fieldKey)
        if (fieldUuid) {
          db.query("INSERT INTO reaction_write (reaction, field) VALUES (?, ?)").run(uuid, fieldUuid)
        }
      })
    }
  }

  for (const [state, reactionIds] of Object.entries(rs.superposition)) {
    const stateUuid = stateUuids.get(state)
    if (stateUuid) {
      reactionIds.forEach((id) => {
        const reactionUuid = `reaction:${src}:${id}`
        db.query("INSERT INTO reaction_superposition (reaction, superposition) VALUES (?, ?)")
          .run(reactionUuid, stateUuid)
      })
    }
  }
}
