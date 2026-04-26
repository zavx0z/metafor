import type { SQL } from "bun"
import type { MetaDSL } from "../../metafor.t.ts"
import { getReactions, hasReactions } from "./sqlite"
import type { Fields } from "./fields.ts"

export interface ReactionRecord {
  key: string
  definition: NonNullable<MetaDSL["reactions"]>["reactions"][string]
  /** Список states, в которых эта реакция активна. */
  states: string[]
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

  private buildStateIndex(r: NonNullable<MetaDSL["reactions"]>): Record<string, string[]> {
    const index: Record<string, string[]> = {}
    for (const [stateName, keys] of Object.entries(r.superposition ?? {})) {
      for (const key of keys ?? []) {
        ;(index[key] ??= []).push(stateName)
      }
    }
    return index
  }

  async all(): Promise<ReactionRecord[]> {
    const r = await this.load()
    if (!r) return []
    const stateIndex = this.buildStateIndex(r)
    return Object.entries(r.reactions ?? {}).map(([key, definition]) => ({
      key,
      definition,
      states: stateIndex[key] ?? [],
    }))
  }

  async get(filter: { key: string }): Promise<ReactionRecord | null> {
    const r = await this.load()
    if (!r) return null
    const definition = r.reactions?.[filter.key]
    if (definition === undefined) return null
    const states: string[] = []
    for (const [stateName, keys] of Object.entries(r.superposition ?? {})) {
      if ((keys ?? []).includes(filter.key)) states.push(stateName)
    }
    return { key: filter.key, definition, states }
  }

  async count(): Promise<number> {
    const r = await this.load()
    return r ? Object.keys(r.reactions ?? {}).length : 0
  }

  async exists(): Promise<boolean> {
    return hasReactions(this.sql, this.src)
  }
}
