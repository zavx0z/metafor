import type { Database } from "bun:sqlite"
import type { MetaDSL } from "../.."

export function relationMetafor(db: Database, meta: MetaDSL, src: string): void {
  db.query("INSERT INTO meta (src, name, desc, view_css) VALUES (?, ?, ?, ?)")
    .run(src, meta.name, meta.desc || null, meta.bulk?.view || null)
}
