import type { SQL } from "bun"
import { getSuperposition } from "./sqlite"
import type { Fields } from "./fields.ts"

/**
 * Один FSM-state декларации. Хранит только `(sql, src, fields, name)`;
 * `transitions()` подгружается лениво.
 */
export class State {
  constructor(
    private readonly sql: SQL,
    private readonly src: string,
    private readonly fields: Fields,
    readonly name: string,
  ) {}

  /** Карта переходов: `Record<targetState, conditions>`. Пусто для terminal-state. */
  async transitions(): Promise<Record<string, unknown>> {
    const { enumVariants } = await this.fields.raw()
    const sp = ((await getSuperposition(this.sql, this.src, enumVariants)) ?? {}) as Record<string, unknown>
    return ((sp as Record<string, Record<string, unknown> | undefined>)[this.name] ?? {}) as Record<string, unknown>
  }
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

  async all(): Promise<State[]> {
    const sp = await this.load()
    return Object.keys(sp).map((name) => new State(this.sql, this.src, this.fields, name))
  }

  async get(filter: { name: string }): Promise<State | null> {
    const sp = await this.load()
    if (!Object.prototype.hasOwnProperty.call(sp, filter.name)) return null
    return new State(this.sql, this.src, this.fields, filter.name)
  }

  async count(): Promise<number> {
    return Object.keys(await this.load()).length
  }

  async exists(): Promise<boolean> {
    return Object.keys(await this.load()).length > 0
  }
}
