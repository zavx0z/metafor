import type { Database } from "bun:sqlite"
import type { MetaDSL } from "../.."

export function relationMetafor(db: Database, meta: MetaDSL, src: string): void {
  let massSource: string | null = null
  if (meta.mass !== undefined) {
    try {
      massSource = JSON.stringify(meta.mass)
    } catch {
      massSource = null
    }
  }

  db.query(
    `INSERT INTO meta (src, name, desc, view_css, mass_source, has_processes, has_reactions, has_matter)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    src,
    meta.name,
    meta.desc || null,
    meta.bulk?.view || null,
    massSource,
    meta.processes !== undefined ? 1 : 0,
    meta.reactions !== undefined ? 1 : 0,
    meta.matter !== undefined ? 1 : 0,
  )
}
