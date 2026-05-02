import type {SQL} from "bun"
import type {MetaDSL} from "../../../metafor.t.ts"
import type {WimpRow} from "./wimp.t.ts"
import {Fields} from "./fields.ts"
import {Superposition} from "./superposition.ts"
import {Processes} from "./process.ts"
import {Reactions} from "./reactions.ts"
import {Matter} from "./matter.ts"
import {Mass} from "./mass.ts"

const getWimpRow = async (sql: SQL, src: string): Promise<WimpRow | null> => {
  const rows = await sql<WimpRow[]>`
      SELECT src, name, desc, view_css
      FROM wimp
      WHERE src = ${src}
  `
  return rows[0] ?? null
}

export class Wimp {
  readonly fields: Fields
  readonly superposition: Superposition
  readonly processes: Processes
  readonly reactions: Reactions
  readonly matter: Matter
  readonly mass: Mass

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
  }

  async name(): Promise<string> {
    const row = await getWimpRow(this.sql, this.src)
    return row?.name ?? this.src.split("/").pop() ?? this.src
  }

  async desc(): Promise<string | undefined> {
    const row = await getWimpRow(this.sql, this.src)
    return row?.desc ?? undefined
  }

  async bulk(): Promise<MetaDSL["bulk"]> {
    const row = await getWimpRow(this.sql, this.src)
    return row?.view_css ? ({view: row.view_css} as MetaDSL["bulk"]) : undefined
  }

  async setMetadata(input: {name?: string | null; desc?: string | null; viewCss?: string | null}): Promise<void> {
    if (input.name !== undefined) {
      await this.sql`UPDATE wimp SET name = ${input.name} WHERE src = ${this.src}`
    }
    if (input.desc !== undefined) {
      await this.sql`UPDATE wimp SET desc = ${input.desc} WHERE src = ${this.src}`
    }
    if (input.viewCss !== undefined) {
      await this.sql`UPDATE wimp SET view_css = ${input.viewCss} WHERE src = ${this.src}`
    }
  }
}
