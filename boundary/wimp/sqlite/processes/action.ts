import type { Process } from "./process.ts"
import type { ProcessActionReadPhase, ProcessActionWritePhase } from "@metafor/types/boundary/wimp"

/**
 * Sub-ORM для таблицы `process_action_read` (PK (process, phase, field)).
 * Резолв `field.id` через WHERE field.wimp=src AND field.key=fieldKey.
 */
export class ActionRead {
  constructor(readonly action: ProcessAction) {}

  async add(phase: ProcessActionReadPhase, fieldKey: string): Promise<void> {
    const sql = this.action.process.processes.wimp.sql
    const src = this.action.process.processes.wimp.src
    const processId = await this.action.process.id()
    await sql`
      INSERT OR IGNORE INTO process_action_read (process, field, phase)
      SELECT ${processId}, field.id, ${phase}
      FROM field WHERE field.wimp = ${src} AND field.key = ${fieldKey}
    `
  }

  async remove(phase: ProcessActionReadPhase, fieldKey: string): Promise<void> {
    const sql = this.action.process.processes.wimp.sql
    const src = this.action.process.processes.wimp.src
    const processId = await this.action.process.id()
    await sql`
      DELETE FROM process_action_read
      WHERE process = ${processId}
        AND phase = ${phase}
        AND field IN (SELECT id FROM field WHERE wimp = ${src} AND key = ${fieldKey})
    `
  }

  async all(phase: ProcessActionReadPhase): Promise<string[]> {
    const sql = this.action.process.processes.wimp.sql
    const processId = await this.action.process.id()
    const rows = await sql<Array<{ key: string }>>`
      SELECT field.key AS key
      FROM process_action_read par
      INNER JOIN field ON field.id = par.field
      WHERE par.process = ${processId} AND par.phase = ${phase}
      ORDER BY par.rowid
    `
    return rows.map((row) => row.key)
  }

  async has(phase: ProcessActionReadPhase, fieldKey: string): Promise<boolean> {
    const sql = this.action.process.processes.wimp.sql
    const src = this.action.process.processes.wimp.src
    const processId = await this.action.process.id()
    const row = (
      await sql<Array<{ ok: number }>>`
        SELECT 1 AS ok
        FROM process_action_read par
        INNER JOIN field ON field.id = par.field
        WHERE par.process = ${processId}
          AND par.phase = ${phase}
          AND field.wimp = ${src}
          AND field.key = ${fieldKey}
        LIMIT 1
      `
    )[0]
    return row !== undefined
  }

  async count(phase?: ProcessActionReadPhase): Promise<number> {
    const sql = this.action.process.processes.wimp.sql
    const processId = await this.action.process.id()
    if (phase === undefined) {
      const row = (
        await sql<Array<{ count: number }>>`
          SELECT COUNT(*) AS count FROM process_action_read WHERE process = ${processId}
        `
      )[0]
      return row?.count ?? 0
    }
    const row = (
      await sql<Array<{ count: number }>>`
        SELECT COUNT(*) AS count FROM process_action_read
        WHERE process = ${processId} AND phase = ${phase}
      `
    )[0]
    return row?.count ?? 0
  }
}

/**
 * Sub-ORM для таблицы `process_action_write` (PK (process, phase, field)).
 * Фазы: success | error.
 */
export class ActionWrite {
  constructor(readonly action: ProcessAction) {}

  async add(phase: ProcessActionWritePhase, fieldKey: string): Promise<void> {
    const sql = this.action.process.processes.wimp.sql
    const src = this.action.process.processes.wimp.src
    const processId = await this.action.process.id()
    await sql`
      INSERT OR IGNORE INTO process_action_write (process, field, phase)
      SELECT ${processId}, field.id, ${phase}
      FROM field WHERE field.wimp = ${src} AND field.key = ${fieldKey}
    `
  }

  async remove(phase: ProcessActionWritePhase, fieldKey: string): Promise<void> {
    const sql = this.action.process.processes.wimp.sql
    const src = this.action.process.processes.wimp.src
    const processId = await this.action.process.id()
    await sql`
      DELETE FROM process_action_write
      WHERE process = ${processId}
        AND phase = ${phase}
        AND field IN (SELECT id FROM field WHERE wimp = ${src} AND key = ${fieldKey})
    `
  }

  async all(phase: ProcessActionWritePhase): Promise<string[]> {
    const sql = this.action.process.processes.wimp.sql
    const processId = await this.action.process.id()
    const rows = await sql<Array<{ key: string }>>`
      SELECT field.key AS key
      FROM process_action_write paw
      INNER JOIN field ON field.id = paw.field
      WHERE paw.process = ${processId} AND paw.phase = ${phase}
      ORDER BY paw.rowid
    `
    return rows.map((row) => row.key)
  }

  async has(phase: ProcessActionWritePhase, fieldKey: string): Promise<boolean> {
    const sql = this.action.process.processes.wimp.sql
    const src = this.action.process.processes.wimp.src
    const processId = await this.action.process.id()
    const row = (
      await sql<Array<{ ok: number }>>`
        SELECT 1 AS ok
        FROM process_action_write paw
        INNER JOIN field ON field.id = paw.field
        WHERE paw.process = ${processId}
          AND paw.phase = ${phase}
          AND field.wimp = ${src}
          AND field.key = ${fieldKey}
        LIMIT 1
      `
    )[0]
    return row !== undefined
  }

  async count(phase?: ProcessActionWritePhase): Promise<number> {
    const sql = this.action.process.processes.wimp.sql
    const processId = await this.action.process.id()
    if (phase === undefined) {
      const row = (
        await sql<Array<{ count: number }>>`
          SELECT COUNT(*) AS count FROM process_action_write WHERE process = ${processId}
        `
      )[0]
      return row?.count ?? 0
    }
    const row = (
      await sql<Array<{ count: number }>>`
        SELECT COUNT(*) AS count FROM process_action_write
        WHERE process = ${processId} AND phase = ${phase}
      `
    )[0]
    return row?.count ?? 0
  }
}

/**
 * ORM для таблицы `process_action` (1:1 к `process` для type=action).
 * `set()` создаёт row при отсутствии, иначе UPDATE — чтобы не cascade-удалять
 * связанные `process_action_read`/`process_action_write` через INSERT OR REPLACE.
 */
export class ProcessAction {
  readonly read: ActionRead
  readonly write: ActionWrite

  constructor(readonly process: Process) {
    this.read = new ActionRead(this)
    this.write = new ActionWrite(this)
  }

  async set(input: {
    src: string
    importSpecifier?: string | null | undefined
    wrapperSrc?: string | null | undefined
    success?: string | null | undefined
    error?: string | null | undefined
  }): Promise<void> {
    const sql = this.process.processes.wimp.sql
    const processId = await this.process.id()

    const importSpecifier = input.importSpecifier ?? null
    const wrapperSrc = input.wrapperSrc ?? null
    const success = input.success ?? null
    const error = input.error ?? null

    const existing = (
      await sql<Array<{ ok: number }>>`
        SELECT 1 AS ok FROM process_action WHERE process = ${processId} LIMIT 1
      `
    )[0]

    if (existing) {
      await sql`
        UPDATE process_action
        SET action = ${input.src},
            action_import_specifier = ${importSpecifier},
            action_wrapper_src = ${wrapperSrc},
            success = ${success},
            error = ${error}
        WHERE process = ${processId}
      `
      return
    }

    await sql`
      INSERT INTO process_action (process, action, action_import_specifier, action_wrapper_src, success, error)
      VALUES (${processId}, ${input.src}, ${importSpecifier}, ${wrapperSrc}, ${success}, ${error})
    `
  }

  async setSuccess(src: string | null): Promise<void> {
    const sql = this.process.processes.wimp.sql
    const processId = await this.process.id()
    await sql`UPDATE process_action SET success = ${src} WHERE process = ${processId}`
  }

  async setError(src: string | null): Promise<void> {
    const sql = this.process.processes.wimp.sql
    const processId = await this.process.id()
    await sql`UPDATE process_action SET error = ${src} WHERE process = ${processId}`
  }

  async script(): Promise<{ src: string; importSpecifier?: string; wrapperSrc?: string } | null> {
    const sql = this.process.processes.wimp.sql
    const processId = await this.process.id()
    const row = (
      await sql<
        Array<{
          action: string
          action_import_specifier: string | null
          action_wrapper_src: string | null
        }>
      >`
        SELECT action, action_import_specifier, action_wrapper_src
        FROM process_action WHERE process = ${processId} LIMIT 1
      `
    )[0]
    if (!row) return null
    const result: { src: string; importSpecifier?: string; wrapperSrc?: string } = { src: row.action }
    if (row.action_import_specifier !== null) result.importSpecifier = row.action_import_specifier
    if (row.action_wrapper_src !== null) result.wrapperSrc = row.action_wrapper_src
    return result
  }

  async success(): Promise<string | null> {
    const sql = this.process.processes.wimp.sql
    const processId = await this.process.id()
    const row = (
      await sql<Array<{ success: string | null }>>`
        SELECT success FROM process_action WHERE process = ${processId} LIMIT 1
      `
    )[0]
    return row?.success ?? null
  }

  async error(): Promise<string | null> {
    const sql = this.process.processes.wimp.sql
    const processId = await this.process.id()
    const row = (
      await sql<Array<{ error: string | null }>>`
        SELECT error FROM process_action WHERE process = ${processId} LIMIT 1
      `
    )[0]
    return row?.error ?? null
  }

  async exists(): Promise<boolean> {
    const sql = this.process.processes.wimp.sql
    const processId = await this.process.id()
    const row = (
      await sql<Array<{ ok: number }>>`
        SELECT 1 AS ok FROM process_action WHERE process = ${processId} LIMIT 1
      `
    )[0]
    return row !== undefined
  }
}
