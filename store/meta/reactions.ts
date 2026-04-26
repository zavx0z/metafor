import type { SQL } from "bun"
import type { MetaDSL } from "../../metafor.t.ts"
import { getReactions, hasReactions } from "./sqlite"
import type { Fields } from "./fields.ts"

type ReactionDefinition = NonNullable<MetaDSL["reactions"]>["reactions"][string]

/**
 * Одна реакция декларации. Хранит `(sql, src, fields, key)`; декларация
 * и список states подгружаются лениво.
 */
export class Reaction {
  constructor(
    private readonly sql: SQL,
    private readonly src: string,
    private readonly fields: Fields,
    readonly key: string,
  ) {}

  private async load(): Promise<NonNullable<MetaDSL["reactions"]>> {
    if (!(await hasReactions(this.sql, this.src))) {
      throw new Error(`reactions not declared in meta ${this.src}`)
    }
    const { fieldKeys } = await this.fields.raw()
    return (await getReactions(this.sql, this.src, fieldKeys)) ?? { reactions: {}, superposition: {} }
  }

  /** Полная декларация реакции. Бросает, если реакция исчезла. */
  async definition(): Promise<ReactionDefinition> {
    const r = await this.load()
    const def = r.reactions?.[this.key]
    if (def === undefined) throw new Error(`reaction ${this.key} not found in meta ${this.src}`)
    return def
  }

  /** Список states, в которых эта реакция активна. */
  async states(): Promise<string[]> {
    const r = await this.load()
    const result: string[] = []
    for (const [stateName, keys] of Object.entries(r.superposition ?? {})) {
      if ((keys ?? []).includes(this.key)) result.push(stateName)
    }
    return result
  }
}

/** Django-style manager для реакций одной меты. */
export class Reactions {
  constructor(
    private readonly sql: SQL,
    private readonly src: string,
    private readonly fields: Fields,
  ) {}

  private async load(): Promise<NonNullable<MetaDSL["reactions"]> | null> {
    if (!(await hasReactions(this.sql, this.src))) return null
    const { fieldKeys } = await this.fields.raw()
    return (await getReactions(this.sql, this.src, fieldKeys)) ?? { reactions: {}, superposition: {} }
  }

  async all(): Promise<Reaction[]> {
    const r = await this.load()
    if (!r) return []
    return Object.keys(r.reactions ?? {}).map((key) => new Reaction(this.sql, this.src, this.fields, key))
  }

  async get(filter: { key: string }): Promise<Reaction | null> {
    const r = await this.load()
    if (!r || r.reactions?.[filter.key] === undefined) return null
    return new Reaction(this.sql, this.src, this.fields, filter.key)
  }

  async count(): Promise<number> {
    const r = await this.load()
    return r ? Object.keys(r.reactions ?? {}).length : 0
  }

  async exists(): Promise<boolean> {
    return hasReactions(this.sql, this.src)
  }
}
