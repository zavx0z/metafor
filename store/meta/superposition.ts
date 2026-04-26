import type { SQL } from "bun"
import { getSuperposition } from "./sqlite"
import type { Fields } from "./fields.ts"

export interface SuperpositionStateRecord {
  name: string
  /** Карта переходов: `Record<targetState, conditions>`. Пусто для terminal-state. */
  transitions: Record<string, unknown>
}

/** Django-style manager для FSM-состояний одной меты. */
export class Superposition {
  constructor(
    private readonly sql: SQL,
    private readonly src: string,
    private readonly fields: Fields,
  ) {}

  private async load(): Promise<Record<string, unknown>> {
    const { enumVariants } = await this.fields.raw()
    return ((await getSuperposition(this.sql, this.src, enumVariants)) ?? {}) as Record<string, unknown>
  }

  async all(): Promise<SuperpositionStateRecord[]> {
    const sp = await this.load()
    return Object.entries(sp).map(([name, transitions]) => ({
      name,
      transitions: (transitions ?? {}) as Record<string, unknown>,
    }))
  }

  async get(filter: { name: string }): Promise<SuperpositionStateRecord | null> {
    const sp = await this.load()
    if (!Object.prototype.hasOwnProperty.call(sp, filter.name)) return null
    return { name: filter.name, transitions: (sp[filter.name] ?? {}) as Record<string, unknown> }
  }

  async count(): Promise<number> {
    return Object.keys(await this.load()).length
  }

  async exists(): Promise<boolean> {
    return Object.keys(await this.load()).length > 0
  }
}
