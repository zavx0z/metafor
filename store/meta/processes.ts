import type { Database } from "bun:sqlite"
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
    private readonly db: Database,
    private readonly src: string,
    private readonly fields: Fields,
  ) {}

  private load(): NonNullable<MetaDSL["processes"]> | null {
    if (!hasProcesses(this.db, this.src)) return null
    return getProcesses(this.db, this.src, this.fields.raw().fieldKeys) ?? {}
  }

  all(): ProcessRecord[] {
    const procs = this.load()
    if (!procs) return []
    return Object.entries(procs).map(([key, definition]) => ({ key, definition }))
  }

  get(filter: { key: string }): ProcessRecord | null {
    const procs = this.load()
    if (!procs) return null
    const definition = procs[filter.key]
    return definition === undefined ? null : { key: filter.key, definition }
  }

  count(): number {
    const procs = this.load()
    return procs ? Object.keys(procs).length : 0
  }

  exists(): boolean {
    return hasProcesses(this.db, this.src)
  }
}
