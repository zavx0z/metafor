import type { Database } from "bun:sqlite"
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
    private readonly db: Database,
    private readonly src: string,
    private readonly fields: Fields,
  ) {}

  private load(): NonNullable<MetaDSL["reactions"]> | null {
    if (!hasReactions(this.db, this.src)) return null
    return getReactions(this.db, this.src, this.fields.raw().fieldKeys) ?? { reactions: {}, superposition: {} }
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

  all(): ReactionRecord[] {
    const r = this.load()
    if (!r) return []
    const stateIndex = this.buildStateIndex(r)
    return Object.entries(r.reactions ?? {}).map(([key, definition]) => ({
      key,
      definition,
      states: stateIndex[key] ?? [],
    }))
  }

  get(filter: { key: string }): ReactionRecord | null {
    const r = this.load()
    if (!r) return null
    const definition = r.reactions?.[filter.key]
    if (definition === undefined) return null
    const states: string[] = []
    for (const [stateName, keys] of Object.entries(r.superposition ?? {})) {
      if ((keys ?? []).includes(filter.key)) states.push(stateName)
    }
    return { key: filter.key, definition, states }
  }

  count(): number {
    const r = this.load()
    return r ? Object.keys(r.reactions ?? {}).length : 0
  }

  exists(): boolean {
    return hasReactions(this.db, this.src)
  }
}
