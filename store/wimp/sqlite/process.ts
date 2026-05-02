
import type { SQL } from "bun"
import type { MetaDSL } from "../../../metafor.t.ts"
import { createProcess } from "./process.C.ts"
import type { FieldUuidByKey } from "./process.t.ts"

type ProcessType = "action" | "finally"

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
    private readonly sql: SQL,
    private readonly wimpSrc: string,
    readonly key: string,
  ) {}

    async type(): Promise<ProcessType> {
    const row = (
      await this.sql<Array<{ type: ProcessType }>>`
        SELECT type FROM process WHERE wimp = ${this.wimpSrc} AND key = ${this.key}
      `
    )[0]
    if (!row) throw new Error(`process ${this.key} not found in meta ${this.wimpSrc}`)
    return row.type
  }

    async label(): Promise<string | undefined> {
    const row = (
      await this.sql<Array<{ label: string | null }>>`
        SELECT label FROM process WHERE wimp = ${this.wimpSrc} AND key = ${this.key}
      `
    )[0]
    if (!row) throw new Error(`process ${this.key} not found in meta ${this.wimpSrc}`)
    return row.label ?? undefined
  }

  async setLabel(value: string | null): Promise<void> {
    await this.sql`
      UPDATE process SET label = ${value}
      WHERE wimp = ${this.wimpSrc} AND key = ${this.key}
    `
  }

    async desc(): Promise<string | undefined> {
    const row = (
      await this.sql<Array<{ desc: string | null }>>`
        SELECT desc FROM process WHERE wimp = ${this.wimpSrc} AND key = ${this.key}
      `
    )[0]
    if (!row) throw new Error(`process ${this.key} not found in meta ${this.wimpSrc}`)
    return row.desc ?? undefined
  }

  async setDesc(value: string | null): Promise<void> {
    await this.sql`
      UPDATE process SET desc = ${value}
      WHERE wimp = ${this.wimpSrc} AND key = ${this.key}
    `
  }

    async env(): Promise<string[]> {
    const rows = await this.sql<Array<{ env: string }>>`
      SELECT process_env.env AS env
      FROM process_env
      INNER JOIN process ON process.uuid = process_env.process
      WHERE process.wimp = ${this.wimpSrc} AND process.key = ${this.key}
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
      await this.sql<Row[]>`
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
        WHERE p.wimp = ${this.wimpSrc} AND p.key = ${this.key}
      `
    )[0]
    if (!row) throw new Error(`process ${this.key} not found in meta ${this.wimpSrc}`)
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
      await this.sql<Row[]>`
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
        WHERE p.wimp = ${this.wimpSrc} AND p.key = ${this.key}
      `
    )[0]
    if (!row) throw new Error(`process ${this.key} not found in meta ${this.wimpSrc}`)
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
      await this.sql<Row[]>`
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
        WHERE p.wimp = ${this.wimpSrc} AND p.key = ${this.key}
      `
    )[0]
    if (!row) throw new Error(`process ${this.key} not found in meta ${this.wimpSrc}`)
    if (row.type !== "finally") throw new Error(`process ${this.key} is type=${row.type}, has no before phase`)
    if (row.before === null) throw new Error(`process_finally row missing for ${this.key}`)

    const phase: ProcessBeforePhase = { src: row.before }
    const reads = parseJsonStringArray(row.reads)
    if (reads) phase.read = reads
    return phase
  }
}

export class Processes {
  constructor(
    private readonly sql: SQL,
    private readonly src: string,
  ) {}

  async create(dsl: MetaDSL, fieldUuids: FieldUuidByKey): Promise<void> {
    await createProcess(this.sql, dsl, this.src, fieldUuids)
  }

  async all(): Promise<Process[]> {
    const rows = await this.sql<Array<{ key: string }>>`
      SELECT key FROM process WHERE wimp = ${this.src} ORDER BY rowid
    `
    return rows.map((row) => new Process(this.sql, this.src, row.key))
  }

  async get(filter: { key: string }): Promise<Process | null> {
    const row = (
      await this.sql<Array<{ ok: number }>>`
        SELECT 1 AS ok FROM process WHERE wimp = ${this.src} AND key = ${filter.key} LIMIT 1
      `
    )[0]
    return row ? new Process(this.sql, this.src, filter.key) : null
  }

  async count(): Promise<number> {
    const row = (
      await this.sql<Array<{ count: number }>>`
        SELECT COUNT(*) AS count FROM process WHERE wimp = ${this.src}
      `
    )[0]
    return row?.count ?? 0
  }

  async exists(): Promise<boolean> {
    const row = (
      await this.sql<Array<{ ok: number }>>`
        SELECT 1 AS ok FROM process WHERE wimp = ${this.src} LIMIT 1
      `
    )[0]
    return row !== undefined
  }
}
