import type { Process } from "./process.ts"
import {emitGravitonAdd} from "../../../protocol.ts"

/**
 * Sub-ORM для таблицы `process_env`.
 * PK (process, env) — INSERT идемпотентен через ON CONFLICT IGNORE.
 */
export class ProcessEnvs {
  constructor(readonly process: Process) {}

  async add(env: string): Promise<void> {
    const sql = this.process.processes.wimp.sql
    const processUuid = await this.process.uuid()
    const existing = await this.has(env)
    await sql`
      INSERT INTO process_env (process, env)
      VALUES (${processUuid}, ${env})
      ON CONFLICT (process, env) DO NOTHING
    `
    if (!existing) emitGravitonAdd(`${processUuid}/env/${env}`, "process_env")
  }

  async remove(env: string): Promise<void> {
    const sql = this.process.processes.wimp.sql
    const processUuid = await this.process.uuid()
    await sql`
      DELETE FROM process_env
      WHERE process = ${processUuid} AND env = ${env}
    `
  }

  async all(): Promise<string[]> {
    const sql = this.process.processes.wimp.sql
    const processUuid = await this.process.uuid()
    const rows = await sql<Array<{ env: string }>>`
      SELECT env FROM process_env
      WHERE process = ${processUuid}
      ORDER BY rowid
    `
    return rows.map((row) => row.env)
  }

  async has(env: string): Promise<boolean> {
    const sql = this.process.processes.wimp.sql
    const processUuid = await this.process.uuid()
    const row = (
      await sql<Array<{ ok: number }>>`
        SELECT 1 AS ok FROM process_env
        WHERE process = ${processUuid} AND env = ${env}
        LIMIT 1
      `
    )[0]
    return row !== undefined
  }

  async count(): Promise<number> {
    const sql = this.process.processes.wimp.sql
    const processUuid = await this.process.uuid()
    const row = (
      await sql<Array<{ count: number }>>`
        SELECT COUNT(*) AS count FROM process_env WHERE process = ${processUuid}
      `
    )[0]
    return row?.count ?? 0
  }

  async exists(): Promise<boolean> {
    const sql = this.process.processes.wimp.sql
    const processUuid = await this.process.uuid()
    const row = (
      await sql<Array<{ ok: number }>>`
        SELECT 1 AS ok FROM process_env WHERE process = ${processUuid} LIMIT 1
      `
    )[0]
    return row !== undefined
  }
}
