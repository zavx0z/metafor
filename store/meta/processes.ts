import type { SQL } from "bun"
import type { MetaDSL } from "../../metafor.t.ts"
import { getProcesses, hasProcesses } from "./sqlite"
import type { Fields } from "./fields.ts"

export interface ProcessRecord {
  key: string
  /** Полная декларация процесса (action+success+error / finally). */
  definition: NonNullable<MetaDSL["processes"]>[string]
}

/** Django-style manager для процессов одной меты. */
export class Processes {
  constructor(
    private readonly sql: SQL,
    private readonly src: string,
    private readonly fields: Fields,
  ) {}

  private async load(): Promise<NonNullable<MetaDSL["processes"]> | null> {
    if (!(await hasProcesses(this.sql, this.src))) return null
    const { fieldKeys } = await this.fields.raw()
    return (await getProcesses(this.sql, this.src, fieldKeys)) ?? {}
  }

  async all(): Promise<ProcessRecord[]> {
    const procs = await this.load()
    if (!procs) return []
    return Object.entries(procs).map(([key, definition]) => ({ key, definition }))
  }

  async get(filter: { key: string }): Promise<ProcessRecord | null> {
    const procs = await this.load()
    if (!procs) return null
    const definition = procs[filter.key]
    return definition === undefined ? null : { key: filter.key, definition }
  }

  async count(): Promise<number> {
    const procs = await this.load()
    return procs ? Object.keys(procs).length : 0
  }

  async exists(): Promise<boolean> {
    return hasProcesses(this.sql, this.src)
  }
}
