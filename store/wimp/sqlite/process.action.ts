import type { Process } from "./process.process.ts"

type ReadPhase = "action" | "success" | "error"
type WritePhase = "success" | "error"

/**
 * Sub-ORM для таблицы `process_action_read` (PK (process, phase, field)).
 * Резолв `field.uuid` через WHERE field.wimp=src AND field.key=fieldKey.
 */
export class ActionRead {
  constructor(readonly action: ProcessAction) {}

  async add(phase: ReadPhase, fieldKey: string): Promise<void> {
    const sql = this.action.process.processes.wimp.sql
    const src = this.action.process.processes.wimp.src
    const processUuid = await this.action.process.uuid()
    await sql`
      INSERT OR IGNORE INTO process_action_read (process, field, phase)
      SELECT ${processUuid}, field.uuid, ${phase}
      FROM field WHERE field.wimp = ${src} AND field.key = ${fieldKey}
    `
  }

  async remove(phase: ReadPhase, fieldKey: string): Promise<void> {
    const sql = this.action.process.processes.wimp.sql
    const src = this.action.process.processes.wimp.src
    const processUuid = await this.action.process.uuid()
    await sql`
      DELETE FROM process_action_read
      WHERE process = ${processUuid}
        AND phase = ${phase}
        AND field IN (SELECT uuid FROM field WHERE wimp = ${src} AND key = ${fieldKey})
    `
  }

  async all(phase: ReadPhase): Promise<string[]> {
    const sql = this.action.process.processes.wimp.sql
    const processUuid = await this.action.process.uuid()
    const rows = await sql<Array<{ key: string }>>`
      SELECT field.key AS key
      FROM process_action_read par
      INNER JOIN field ON field.uuid = par.field
      WHERE par.process = ${processUuid} AND par.phase = ${phase}
      ORDER BY par.rowid
    `
    return rows.map((row) => row.key)
  }

  async has(phase: ReadPhase, fieldKey: string): Promise<boolean> {
    const sql = this.action.process.processes.wimp.sql
    const src = this.action.process.processes.wimp.src
    const processUuid = await this.action.process.uuid()
    const row = (
      await sql<Array<{ ok: number }>>`
        SELECT 1 AS ok
        FROM process_action_read par
        INNER JOIN field ON field.uuid = par.field
        WHERE par.process = ${processUuid}
          AND par.phase = ${phase}
          AND field.wimp = ${src}
          AND field.key = ${fieldKey}
        LIMIT 1
      `
    )[0]
    return row !== undefined
  }

  async count(phase?: ReadPhase): Promise<number> {
    const sql = this.action.process.processes.wimp.sql
    const processUuid = await this.action.process.uuid()
    if (phase === undefined) {
      const row = (
        await sql<Array<{ count: number }>>`
          SELECT COUNT(*) AS count FROM process_action_read WHERE process = ${processUuid}
        `
      )[0]
      return row?.count ?? 0
    }
    const row = (
      await sql<Array<{ count: number }>>`
        SELECT COUNT(*) AS count FROM process_action_read
        WHERE process = ${processUuid} AND phase = ${phase}
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

  async add(phase: WritePhase, fieldKey: string): Promise<void> {
    const sql = this.action.process.processes.wimp.sql
    const src = this.action.process.processes.wimp.src
    const processUuid = await this.action.process.uuid()
    await sql`
      INSERT OR IGNORE INTO process_action_write (process, field, phase)
      SELECT ${processUuid}, field.uuid, ${phase}
      FROM field WHERE field.wimp = ${src} AND field.key = ${fieldKey}
    `
  }

  async remove(phase: WritePhase, fieldKey: string): Promise<void> {
    const sql = this.action.process.processes.wimp.sql
    const src = this.action.process.processes.wimp.src
    const processUuid = await this.action.process.uuid()
    await sql`
      DELETE FROM process_action_write
      WHERE process = ${processUuid}
        AND phase = ${phase}
        AND field IN (SELECT uuid FROM field WHERE wimp = ${src} AND key = ${fieldKey})
    `
  }

  async all(phase: WritePhase): Promise<string[]> {
    const sql = this.action.process.processes.wimp.sql
    const processUuid = await this.action.process.uuid()
    const rows = await sql<Array<{ key: string }>>`
      SELECT field.key AS key
      FROM process_action_write paw
      INNER JOIN field ON field.uuid = paw.field
      WHERE paw.process = ${processUuid} AND paw.phase = ${phase}
      ORDER BY paw.rowid
    `
    return rows.map((row) => row.key)
  }

  async has(phase: WritePhase, fieldKey: string): Promise<boolean> {
    const sql = this.action.process.processes.wimp.sql
    const src = this.action.process.processes.wimp.src
    const processUuid = await this.action.process.uuid()
    const row = (
      await sql<Array<{ ok: number }>>`
        SELECT 1 AS ok
        FROM process_action_write paw
        INNER JOIN field ON field.uuid = paw.field
        WHERE paw.process = ${processUuid}
          AND paw.phase = ${phase}
          AND field.wimp = ${src}
          AND field.key = ${fieldKey}
        LIMIT 1
      `
    )[0]
    return row !== undefined
  }

  async count(phase?: WritePhase): Promise<number> {
    const sql = this.action.process.processes.wimp.sql
    const processUuid = await this.action.process.uuid()
    if (phase === undefined) {
      const row = (
        await sql<Array<{ count: number }>>`
          SELECT COUNT(*) AS count FROM process_action_write WHERE process = ${processUuid}
        `
      )[0]
      return row?.count ?? 0
    }
    const row = (
      await sql<Array<{ count: number }>>`
        SELECT COUNT(*) AS count FROM process_action_write
        WHERE process = ${processUuid} AND phase = ${phase}
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
    const processUuid = await this.process.uuid()

    const importSpecifier = input.importSpecifier ?? null
    const wrapperSrc = input.wrapperSrc ?? null
    const success = input.success ?? null
    const error = input.error ?? null

    const existing = (
      await sql<Array<{ ok: number }>>`
        SELECT 1 AS ok FROM process_action WHERE process = ${processUuid} LIMIT 1
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
        WHERE process = ${processUuid}
      `
      return
    }

    await sql`
      INSERT INTO process_action (process, action, action_import_specifier, action_wrapper_src, success, error)
      VALUES (${processUuid}, ${input.src}, ${importSpecifier}, ${wrapperSrc}, ${success}, ${error})
    `
  }

  async setSuccess(src: string | null): Promise<void> {
    const sql = this.process.processes.wimp.sql
    const processUuid = await this.process.uuid()
    await sql`UPDATE process_action SET success = ${src} WHERE process = ${processUuid}`
  }

  async setError(src: string | null): Promise<void> {
    const sql = this.process.processes.wimp.sql
    const processUuid = await this.process.uuid()
    await sql`UPDATE process_action SET error = ${src} WHERE process = ${processUuid}`
  }

  async script(): Promise<{ src: string; importSpecifier?: string; wrapperSrc?: string } | null> {
    const sql = this.process.processes.wimp.sql
    const processUuid = await this.process.uuid()
    const row = (
      await sql<
        Array<{
          action: string
          action_import_specifier: string | null
          action_wrapper_src: string | null
        }>
      >`
        SELECT action, action_import_specifier, action_wrapper_src
        FROM process_action WHERE process = ${processUuid} LIMIT 1
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
    const processUuid = await this.process.uuid()
    const row = (
      await sql<Array<{ success: string | null }>>`
        SELECT success FROM process_action WHERE process = ${processUuid} LIMIT 1
      `
    )[0]
    return row?.success ?? null
  }

  async error(): Promise<string | null> {
    const sql = this.process.processes.wimp.sql
    const processUuid = await this.process.uuid()
    const row = (
      await sql<Array<{ error: string | null }>>`
        SELECT error FROM process_action WHERE process = ${processUuid} LIMIT 1
      `
    )[0]
    return row?.error ?? null
  }

  async exists(): Promise<boolean> {
    const sql = this.process.processes.wimp.sql
    const processUuid = await this.process.uuid()
    const row = (
      await sql<Array<{ ok: number }>>`
        SELECT 1 AS ok FROM process_action WHERE process = ${processUuid} LIMIT 1
      `
    )[0]
    return row !== undefined
  }
}
