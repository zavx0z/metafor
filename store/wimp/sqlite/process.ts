
import type { SQL } from "bun"
import type { MetaDSL } from "../../../metafor.t.ts"
import type { ParsedProcess } from "../../../process.t.ts"
import type { ParsedDestroy } from "../../../finally.t.ts"
import type { Wimp } from "./wimp.ts"

type ProcessType = "action" | "finally"

const insertProcessReads = async (
  sql: SQL,
  src: string,
  processUuid: string,
  phase: "action" | "success" | "error",
  fieldKeys: string[] | undefined,
): Promise<void> => {
  for (const fieldKey of fieldKeys ?? []) {
    await sql`
      INSERT INTO process_action_read (process, field, phase)
      SELECT ${processUuid}, field.uuid, ${phase}
      FROM field WHERE field.wimp = ${src} AND field.key = ${fieldKey}
    `
  }
}

const insertProcessWrites = async (
  sql: SQL,
  src: string,
  processUuid: string,
  phase: "success" | "error",
  fieldKeys: string[] | undefined,
): Promise<void> => {
  for (const fieldKey of fieldKeys ?? []) {
    await sql`
      INSERT INTO process_action_write (process, field, phase)
      SELECT ${processUuid}, field.uuid, ${phase}
      FROM field WHERE field.wimp = ${src} AND field.key = ${fieldKey}
    `
  }
}

export interface ProcessActionPhase {
  src: string
  importSpecifier?: string
  wrapperSrc?: string
  read?: string[]
}

export interface ProcessHandlerPhase {
  src: string
  read?: string[]
  write?: string[]
}

export interface ProcessBeforePhase {
  src: string
  read?: string[]
}

const parseJsonStringArray = (value: string | null): string[] | undefined => {
  if (!value) return undefined
  const arr = JSON.parse(value) as string[]
  return arr.length > 0 ? arr : undefined
}

export class Process {
  constructor(
    private readonly processes: Processes,
    readonly key: string,
  ) {}

    async type(): Promise<ProcessType> {
    const row = (
      await this.processes.wimp.sql<Array<{ type: ProcessType }>>`
        SELECT type FROM process WHERE wimp = ${this.processes.wimp.src} AND key = ${this.key}
      `
    )[0]
    if (!row) throw new Error(`process ${this.key} not found in meta ${this.processes.wimp.src}`)
    return row.type
  }

    async label(): Promise<string | undefined> {
    const row = (
      await this.processes.wimp.sql<Array<{ label: string | null }>>`
        SELECT label FROM process WHERE wimp = ${this.processes.wimp.src} AND key = ${this.key}
      `
    )[0]
    if (!row) throw new Error(`process ${this.key} not found in meta ${this.processes.wimp.src}`)
    return row.label ?? undefined
  }

  async setLabel(value: string | null): Promise<void> {
    await this.processes.wimp.sql`
      UPDATE process SET label = ${value}
      WHERE wimp = ${this.processes.wimp.src} AND key = ${this.key}
    `
  }

    async desc(): Promise<string | undefined> {
    const row = (
      await this.processes.wimp.sql<Array<{ desc: string | null }>>`
        SELECT desc FROM process WHERE wimp = ${this.processes.wimp.src} AND key = ${this.key}
      `
    )[0]
    if (!row) throw new Error(`process ${this.key} not found in meta ${this.processes.wimp.src}`)
    return row.desc ?? undefined
  }

  async setDesc(value: string | null): Promise<void> {
    await this.processes.wimp.sql`
      UPDATE process SET desc = ${value}
      WHERE wimp = ${this.processes.wimp.src} AND key = ${this.key}
    `
  }

    async env(): Promise<string[]> {
    const rows = await this.processes.wimp.sql<Array<{ env: string }>>`
      SELECT process_env.env AS env
      FROM process_env
      INNER JOIN process ON process.uuid = process_env.process
      WHERE process.wimp = ${this.processes.wimp.src} AND process.key = ${this.key}
      ORDER BY process_env.rowid
    `
    return rows.map((row) => row.env)
  }

    async action(): Promise<ProcessActionPhase> {
    type Row = {
      type: ProcessType
      action: string | null
      action_import_specifier: string | null
      action_wrapper_src: string | null
      reads: string | null
    }
    const row = (
      await this.processes.wimp.sql<Row[]>`
        SELECT
          p.type AS type,
          pa.action AS action,
          pa.action_import_specifier AS action_import_specifier,
          pa.action_wrapper_src AS action_wrapper_src,
          (SELECT json_group_array(field_key) FROM (
             SELECT field.key AS field_key
             FROM process_action_read par
             INNER JOIN field ON field.uuid = par.field
             WHERE par.process = p.uuid AND par.phase = 'action'
             ORDER BY par.rowid
           )) AS reads
        FROM process p
        LEFT JOIN process_action pa ON pa.process = p.uuid
        WHERE p.wimp = ${this.processes.wimp.src} AND p.key = ${this.key}
      `
    )[0]
    if (!row) throw new Error(`process ${this.key} not found in meta ${this.processes.wimp.src}`)
    if (row.type !== "action") throw new Error(`process ${this.key} is type=${row.type}, has no action phase`)
    if (row.action === null) throw new Error(`process_action row missing for ${this.key}`)

    const phase: ProcessActionPhase = { src: row.action }
    if (row.action_import_specifier !== null) phase.importSpecifier = row.action_import_specifier
    if (row.action_wrapper_src !== null) phase.wrapperSrc = row.action_wrapper_src
    const reads = parseJsonStringArray(row.reads)
    if (reads) phase.read = reads
    return phase
  }

    async success(): Promise<ProcessHandlerPhase | null> {
    return this.handlerPhase("success")
  }

    async error(): Promise<ProcessHandlerPhase | null> {
    return this.handlerPhase("error")
  }

  private async handlerPhase(phase: "success" | "error"): Promise<ProcessHandlerPhase | null> {
    type Row = {
      type: ProcessType
      src: string | null
      reads: string | null
      writes: string | null
    }
    const row = (
      await this.processes.wimp.sql<Row[]>`
        SELECT
          p.type AS type,
          (CASE ${phase} WHEN 'success' THEN pa.success WHEN 'error' THEN pa.error END) AS src,
          (SELECT json_group_array(field_key) FROM (
             SELECT field.key AS field_key
             FROM process_action_read par
             INNER JOIN field ON field.uuid = par.field
             WHERE par.process = p.uuid AND par.phase = ${phase}
             ORDER BY par.rowid
           )) AS reads,
          (SELECT json_group_array(field_key) FROM (
             SELECT field.key AS field_key
             FROM process_action_write paw
             INNER JOIN field ON field.uuid = paw.field
             WHERE paw.process = p.uuid AND paw.phase = ${phase}
             ORDER BY paw.rowid
           )) AS writes
        FROM process p
        LEFT JOIN process_action pa ON pa.process = p.uuid
        WHERE p.wimp = ${this.processes.wimp.src} AND p.key = ${this.key}
      `
    )[0]
    if (!row) throw new Error(`process ${this.key} not found in meta ${this.processes.wimp.src}`)
    if (row.type !== "action") throw new Error(`process ${this.key} is type=${row.type}, has no ${phase} phase`)
    if (row.src === null) return null
    const result: ProcessHandlerPhase = { src: row.src }
    const reads = parseJsonStringArray(row.reads)
    const writes = parseJsonStringArray(row.writes)
    if (reads) result.read = reads
    if (writes) result.write = writes
    return result
  }

    async before(): Promise<ProcessBeforePhase> {
    type Row = {
      type: ProcessType
      before: string | null
      reads: string | null
    }
    const row = (
      await this.processes.wimp.sql<Row[]>`
        SELECT
          p.type AS type,
          pf.before AS before,
          (SELECT json_group_array(field_key) FROM (
             SELECT field.key AS field_key
             FROM process_finally_read pfr
             INNER JOIN field ON field.uuid = pfr.field
             WHERE pfr.process = p.uuid
             ORDER BY pfr.rowid
           )) AS reads
        FROM process p
        LEFT JOIN process_finally pf ON pf.process = p.uuid
        WHERE p.wimp = ${this.processes.wimp.src} AND p.key = ${this.key}
      `
    )[0]
    if (!row) throw new Error(`process ${this.key} not found in meta ${this.processes.wimp.src}`)
    if (row.type !== "finally") throw new Error(`process ${this.key} is type=${row.type}, has no before phase`)
    if (row.before === null) throw new Error(`process_finally row missing for ${this.key}`)

    const phase: ProcessBeforePhase = { src: row.before }
    const reads = parseJsonStringArray(row.reads)
    if (reads) phase.read = reads
    return phase
  }
}

export class Processes {
  constructor(readonly wimp: Wimp) {}

  async create(dsl: MetaDSL): Promise<void> {
    if (!dsl.processes) return

    const sql = this.wimp.sql
    const src = this.wimp.src

    for (const [state, p] of Object.entries(dsl.processes)) {
      const uuid = crypto.randomUUID()
      const process = p as ParsedProcess | ParsedDestroy
      await sql`
        INSERT INTO process (uuid, wimp, key, type, label, desc)
        VALUES (${uuid}, ${src}, ${state}, ${process.type || "action"}, ${process.label || null}, ${process.desc || null})
      `

      if (process.env) {
        for (const env of process.env) {
          await sql`INSERT INTO process_env (process, env) VALUES (${uuid}, ${env})`
        }
      }

      if (process.type === "finally") {
        await sql`INSERT INTO process_finally (process, before) VALUES (${uuid}, ${process.before.src})`

        for (const fieldKey of process.before.read ?? []) {
          await sql`
            INSERT INTO process_finally_read (process, field)
            SELECT ${uuid}, field.uuid
            FROM field WHERE field.wimp = ${src} AND field.key = ${fieldKey}
          `
        }

        continue
      }

      await sql`
        INSERT INTO process_action (process, action, action_import_specifier, action_wrapper_src, success, error)
        VALUES (
          ${uuid},
          ${process.action.src},
          ${process.action.importSpecifier || null},
          ${process.action.wrapperSrc || null},
          ${process.success?.src || null},
          ${process.error?.src || null}
        )
      `

      await insertProcessReads(sql, src, uuid, "action", process.action.read)
      await insertProcessReads(sql, src, uuid, "success", process.success?.read)
      await insertProcessReads(sql, src, uuid, "error", process.error?.read)
      await insertProcessWrites(sql, src, uuid, "success", process.success?.write)
      await insertProcessWrites(sql, src, uuid, "error", process.error?.write)
    }
  }

  async all(): Promise<Process[]> {
    const rows = await this.wimp.sql<Array<{ key: string }>>`
      SELECT key FROM process WHERE wimp = ${this.wimp.src} ORDER BY rowid
    `
    return rows.map((row) => new Process(this, row.key))
  }

  async get(filter: { key: string }): Promise<Process | null> {
    const row = (
      await this.wimp.sql<Array<{ ok: number }>>`
        SELECT 1 AS ok FROM process WHERE wimp = ${this.wimp.src} AND key = ${filter.key} LIMIT 1
      `
    )[0]
    return row ? new Process(this, filter.key) : null
  }

  async count(): Promise<number> {
    const row = (
      await this.wimp.sql<Array<{ count: number }>>`
        SELECT COUNT(*) AS count FROM process WHERE wimp = ${this.wimp.src}
      `
    )[0]
    return row?.count ?? 0
  }

  async exists(): Promise<boolean> {
    const row = (
      await this.wimp.sql<Array<{ ok: number }>>`
        SELECT 1 AS ok FROM process WHERE wimp = ${this.wimp.src} LIMIT 1
      `
    )[0]
    return row !== undefined
  }
}
