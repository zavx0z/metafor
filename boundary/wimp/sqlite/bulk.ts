import type {MetaDSL} from "../../../metafor.t.ts"
import type {Wimp} from "./wimp.ts"

export class Bulk {
  readonly #wimp: Wimp

  constructor(wimp: Wimp) {
    this.#wimp = wimp
  }

  get wimp(): Wimp {
    return this.#wimp
  }

  async get(): Promise<MetaDSL["bulk"]> {
    const row = (
      await this.wimp.sql<Array<{view_css: string | null}>>`
          SELECT view_css FROM wimp WHERE src = ${this.wimp.src} LIMIT 1
      `
    )[0]
    return row?.view_css ? ({view: row.view_css} as MetaDSL["bulk"]) : undefined
  }

  async set(value: MetaDSL["bulk"] | null): Promise<void> {
    const viewCss = value?.view ?? null
    await this.wimp.sql`UPDATE wimp SET view_css = ${viewCss} WHERE src = ${this.wimp.src}`
  }

  async clear(): Promise<void> {
    await this.wimp.sql`UPDATE wimp SET view_css = NULL WHERE src = ${this.wimp.src}`
  }

  async exists(): Promise<boolean> {
    const row = (
      await this.wimp.sql<Array<{ok: number}>>`
          SELECT 1 AS ok FROM wimp WHERE src = ${this.wimp.src} AND view_css IS NOT NULL LIMIT 1
      `
    )[0]
    return row !== undefined
  }
}
