import type {SQL} from "bun"
import {Fields} from "./fields.ts"
import {Superposition} from "./superposition.ts"
import {Processes} from "./process.ts"
import {Reactions} from "./reactions.ts"
import {Matter} from "./matter.ts"
import {Mass} from "./mass.ts"
import {Bulk} from "./bulk.ts"

export class Wimp {
  readonly fields: Fields
  readonly superposition: Superposition
  readonly processes: Processes
  readonly reactions: Reactions
  readonly matter: Matter
  readonly mass: Mass
  readonly bulk: Bulk
  readonly name: Name
  readonly desc: Desc

  constructor(
    readonly sql: SQL,
    readonly src: string,
  ) {
    this.fields = new Fields(this)
    this.superposition = new Superposition(this)
    this.processes = new Processes(this)
    this.reactions = new Reactions(this)
    this.matter = new Matter(this)
    this.mass = new Mass(this)
    this.bulk = new Bulk(this)
    this.name = new Name(this)
    this.desc = new Desc(this)
  }
}

export abstract class WimpScalar<T> {
  constructor(readonly wimp: Wimp) {
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
