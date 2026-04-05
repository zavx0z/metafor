import type { Database } from "bun:sqlite"
import type { MetaDSL, ParsedProcess } from "../.."

export function relationProcess(db: Database, meta: MetaDSL, src: string): void {
  if (!meta.processes) return

  Object.entries(meta.processes).forEach(([state, p]) => {
    const uuid = `process:${src}:${state}`
    const pp = p as ParsedProcess
    db.query("INSERT INTO process (uuid, meta, key, type, label, desc) VALUES (?, ?, ?, ?, ?, ?)")
      .run(uuid, src, state, pp.type || "action", pp.label || null, pp.desc || null)

    if (pp.env) {
      pp.env.forEach((env) => {
        db.query("INSERT INTO process_env (process, env) VALUES (?, ?)").run(uuid, env)
      })
    }
  })
}
