import type {Fields} from "./index.ts"
import type {MetaFieldDSL} from "@metafor/types/metafor/metafor"

export abstract class Field {
  constructor(
    protected readonly fields: Fields,
    public key: string,
  ) {
  }

  abstract readonly type: MetaFieldDSL["type"]

  async id(): Promise<number> {
    const row = (
      await this.fields.wimp.sql<Array<{ id: number }>>`
          SELECT id
          FROM field
          WHERE wimp = ${this.fields.wimp.src}
            AND key = ${this.key}
          LIMIT 1
      `
    )[0]
    if (!row) throw new Error(`field ${this.key} not found in meta ${this.fields.wimp.src}`)
    return row.id
  }

  async setKey(newKey: string): Promise<void> {
    await this.fields.wimp.sql`
        UPDATE field
        SET key = ${newKey}
        WHERE wimp = ${this.fields.wimp.src}
          AND key = ${this.key}
    `
    this.key = newKey
  }

  async required(): Promise<boolean> {
    const row = (
      await this.fields.wimp.sql<Array<{ required: number }>>`
          SELECT required
          FROM field
          WHERE wimp = ${this.fields.wimp.src}
            AND key = ${this.key}
      `
    )[0]
    if (!row) throw new Error(`field ${this.key} not found in meta ${this.fields.wimp.src}`)
    return row.required === 1
  }

  async label(): Promise<string | undefined> {
    const row = (
      await this.fields.wimp.sql<Array<{ label: string | null }>>`
          SELECT label
          FROM field
          WHERE wimp = ${this.fields.wimp.src}
            AND key = ${this.key}
      `
    )[0]
    if (!row) throw new Error(`field ${this.key} not found in meta ${this.fields.wimp.src}`)
    return row.label ?? undefined
  }

  /**
   * Гарантирует наличие row в `field_default` для текущего field.
   * Идемпотентно: если row уже есть — пропускает INSERT.
   */
  protected async ensureDefaultRow(id: number): Promise<void> {
    const existing = (
      await this.fields.wimp.sql<Array<{ field: number }>>`
          SELECT field
          FROM field_default
          WHERE field = ${id}
          LIMIT 1
      `
    )[0]
    if (existing) return
    await this.fields.wimp.sql`INSERT INTO field_default (field) VALUES (${id})`
  }
}
