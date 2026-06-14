import type { Process } from "./process.ts"
import {emitGravitonAdd} from "../../../force.ts"

/**
 * Sub-ORM для таблицы `process_finally_read` (PK (process, field)).
 * Резолв `field.uuid` через WHERE field.wimp=src AND field.key=fieldKey.
 */
export class FinallyRead {
  constructor(readonly finallyPhase: ProcessFinally) {}

  async add(fieldKey: string): Promise<void> {
    const sql = this.finallyPhase.process.processes.wimp.sql
    const src = this.finallyPhase.process.processes.wimp.src
    const processUuid = await this.finallyPhase.process.uuid()
    const existing = await this.has(fieldKey)
    await sql`
      INSERT OR IGNORE INTO process_finally_read (process, field)
      SELECT ${processUuid}, field.uuid
      FROM field WHERE field.wimp = ${src} AND field.key = ${fieldKey}
    `
    if (!existing && await this.has(fieldKey)) {
      emitGravitonAdd("process_finally_read", `${processUuid}/finally/read/${fieldKey}`)
    }
  }

  async remove(fieldKey: string): Promise<void> {
    const sql = this.finallyPhase.process.processes.wimp.sql
    const src = this.finallyPhase.process.processes.wimp.src
    const processUuid = await this.finallyPhase.process.uuid()
    await sql`
      DELETE FROM process_finally_read
      WHERE process = ${processUuid}
        AND field IN (SELECT uuid FROM field WHERE wimp = ${src} AND key = ${fieldKey})
    `
  }

  async all(): Promise<string[]> {
    const sql = this.finallyPhase.process.processes.wimp.sql
    const processUuid = await this.finallyPhase.process.uuid()
    const rows = await sql<Array<{ key: string }>>`
      SELECT field.key AS key
      FROM process_finally_read pfr
      INNER JOIN field ON field.uuid = pfr.field
      WHERE pfr.process = ${processUuid}
      ORDER BY pfr.rowid
    `
    return rows.map((row) => row.key)
  }

  async has(fieldKey: string): Promise<boolean> {
    const sql = this.finallyPhase.process.processes.wimp.sql
    const src = this.finallyPhase.process.processes.wimp.src
    const processUuid = await this.finallyPhase.process.uuid()
    const row = (
      await sql<Array<{ ok: number }>>`
        SELECT 1 AS ok
        FROM process_finally_read pfr
        INNER JOIN field ON field.uuid = pfr.field
        WHERE pfr.process = ${processUuid}
          AND field.wimp = ${src}
          AND field.key = ${fieldKey}
        LIMIT 1
      `
    )[0]
    return row !== undefined
  }

  async count(): Promise<number> {
    const sql = this.finallyPhase.process.processes.wimp.sql
    const processUuid = await this.finallyPhase.process.uuid()
    const row = (
      await sql<Array<{ count: number }>>`
        SELECT COUNT(*) AS count FROM process_finally_read WHERE process = ${processUuid}
      `
    )[0]
    return row?.count ?? 0
  }
}

/**
 * ORM для таблицы `process_finally` (1:1 к `process` для type=finally).
 * `setBefore` — INSERT при отсутствии row, иначе UPDATE (чтобы не cascade-удалять
 * связанные `process_finally_read`).
 */
export class ProcessFinally {
  readonly read: FinallyRead

  constructor(readonly process: Process) {
    this.read = new FinallyRead(this)
  }

  async setBefore(beforeSrc: string): Promise<void> {
    const sql = this.process.processes.wimp.sql
    const processUuid = await this.process.uuid()

    const existing = (
      await sql<Array<{ ok: number }>>`
        SELECT 1 AS ok FROM process_finally WHERE process = ${processUuid} LIMIT 1
      `
    )[0]

    if (existing) {
      await sql`UPDATE process_finally SET before = ${beforeSrc} WHERE process = ${processUuid}`
      return
    }

    await sql`INSERT INTO process_finally (process, before) VALUES (${processUuid}, ${beforeSrc})`
    emitGravitonAdd("process_finally", `${processUuid}/finally`)
  }

  async before(): Promise<string | null> {
    const sql = this.process.processes.wimp.sql
    const processUuid = await this.process.uuid()
    const row = (
      await sql<Array<{ before: string }>>`
        SELECT before FROM process_finally WHERE process = ${processUuid} LIMIT 1
      `
    )[0]
    return row?.before ?? null
  }

  async exists(): Promise<boolean> {
    const sql = this.process.processes.wimp.sql
    const processUuid = await this.process.uuid()
    const row = (
      await sql<Array<{ ok: number }>>`
        SELECT 1 AS ok FROM process_finally WHERE process = ${processUuid} LIMIT 1
      `
    )[0]
    return row !== undefined
  }
}
