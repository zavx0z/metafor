import type { SQL } from "bun"
import type { MetaDSL } from "../../metafor.t.ts"
import { getProcesses, hasProcesses } from "./sqlite"
import type { Fields } from "./fields.ts"

type ProcessDefinition = NonNullable<MetaDSL["processes"]>[string]

/**
 * Один процесс декларации (action / finally). Хранит `(sql, src, fields, key)`;
 * полная декларация загружается лениво методом `definition()`.
 */
export class Process {
  constructor(
    private readonly sql: SQL,
    private readonly src: string,
    private readonly fields: Fields,
    readonly key: string,
  ) {}

  /** Полная декларация процесса (action+success+error / finally). Бросает, если процесс исчез. */
  async definition(): Promise<ProcessDefinition> {
    const { fieldKeys } = await this.fields.raw()
    const procs = (await getProcesses(this.sql, this.src, fieldKeys)) ?? {}
    const def = procs[this.key]
    if (def === undefined) throw new Error(`process ${this.key} not found in meta ${this.src}`)
    return def
  }
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

  async all(): Promise<Process[]> {
    const procs = await this.load()
    if (!procs) return []
    return Object.keys(procs).map((key) => new Process(this.sql, this.src, this.fields, key))
  }

  async get(filter: { key: string }): Promise<Process | null> {
    const procs = await this.load()
    if (!procs || procs[filter.key] === undefined) return null
    return new Process(this.sql, this.src, this.fields, filter.key)
  }

  async count(): Promise<number> {
    const procs = await this.load()
    return procs ? Object.keys(procs).length : 0
  }

  async exists(): Promise<boolean> {
    return hasProcesses(this.sql, this.src)
  }
}
