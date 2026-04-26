import type { Database } from "bun:sqlite"
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
    private readonly db: Database,
    private readonly src: string,
    private readonly fields: Fields,
  ) {}

  private load(): Record<string, unknown> {
    return (getSuperposition(this.db, this.src, this.fields.raw().enumVariants) ?? {}) as Record<string, unknown>
  }

  all(): SuperpositionStateRecord[] {
    const sp = this.load()
    return Object.entries(sp).map(([name, transitions]) => ({
      name,
      transitions: (transitions ?? {}) as Record<string, unknown>,
    }))
  }

  get(filter: { name: string }): SuperpositionStateRecord | null {
    const sp = this.load()
    if (!Object.prototype.hasOwnProperty.call(sp, filter.name)) return null
    return { name: filter.name, transitions: (sp[filter.name] ?? {}) as Record<string, unknown> }
  }

  count(): number {
    return Object.keys(this.load()).length
  }

  exists(): boolean {
    return Object.keys(this.load()).length > 0
  }
}
