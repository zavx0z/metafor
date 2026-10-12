import type {SQL} from "bun"
import {Fields} from "./fields"
import {States} from "./states"
import {Processes} from "./processes"
import {Reactions} from "./reactions.ts"
import {Matter} from "./matter.ts"
import {Bulk} from "./bulk.ts"
import {normalizeMetaLifecycle, type MetaLifecycle} from "@metafor/types/metafor/lifecycle"

export class Wimp {
  readonly fields: Fields
  readonly states: States
  readonly processes: Processes
  readonly reactions: Reactions
  readonly matter: Matter
  readonly bulk: Bulk
  readonly name: Name
  readonly desc: Desc
  readonly lifecycle: Lifecycle

  constructor(
    readonly sql: SQL,
    readonly src: string,
  ) {
    this.fields = new Fields(this)
    this.states = new States(this)
    this.processes = new Processes(this)
    this.reactions = new Reactions(this)
    this.matter = new Matter(this)
    this.bulk = new Bulk(this)
    this.name = new Name(this)
    this.desc = new Desc(this)
    this.lifecycle = new Lifecycle(this)
  }

}

export abstract class WimpScalar<T> {
  readonly #wimp: Wimp

  constructor(wimp: Wimp) {
    this.#wimp = wimp
  }

  get wimp(): Wimp {
    return this.#wimp
  }

  abstract get(): Promise<T | undefined>

  abstract set(value: T | null): Promise<void>
}

export class Name extends WimpScalar<string> {
  async get(): Promise<string | undefined> {
    const row = (
      await this.wimp.sql<Array<{ name: string | null }>>`
          SELECT name
          FROM wimp
          WHERE src = ${this.wimp.src}
          LIMIT 1
      `
    )[0]
    return row?.name ?? undefined
  }

  async set(value: string | null): Promise<void> {
    await this.wimp.sql`
        UPDATE wimp
        SET name = ${value}
        WHERE src = ${this.wimp.src}`
  }
}

export class Desc extends WimpScalar<string> {
  async get(): Promise<string | undefined> {
    const row = (
      await this.wimp.sql<Array<{ desc: string | null }>>`
          SELECT desc
          FROM wimp
          WHERE src = ${this.wimp.src}
          LIMIT 1
      `
    )[0]
    return row?.desc ?? undefined
  }

  async set(value: string | null): Promise<void> {
    await this.wimp.sql`
        UPDATE wimp
        SET desc = ${value}
        WHERE src = ${this.wimp.src}
    `
  }
}

/** Canonical native-input metadata; resource policy remains in declared Meta Processes. */
export class Lifecycle extends WimpScalar<MetaLifecycle> {
  async get(): Promise<MetaLifecycle | undefined> {
    const row = (await this.wimp.sql<Array<{lifecycle: string | null}>>`SELECT lifecycle_json AS lifecycle FROM wimp WHERE src = ${this.wimp.src}`)[0]
    return row && row.lifecycle !== null ? normalizeMetaLifecycle(JSON.parse(row.lifecycle)) : undefined
  }
  async set(value: MetaLifecycle | null): Promise<void> {
    const fields = await this.wimp.sql<Array<{key: string; type: string; required: number}>>`SELECT key, type, required FROM field WHERE wimp = ${this.wimp.src}`
    const lifecycle = normalizeMetaLifecycle(value ?? undefined, fields.map(field => ({...field, required: field.required === 1})))
    await this.wimp.sql`UPDATE wimp SET lifecycle_json = ${lifecycle === undefined ? null : JSON.stringify(lifecycle)} WHERE src = ${this.wimp.src}`
  }
}
