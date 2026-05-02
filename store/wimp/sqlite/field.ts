import type {FieldKey} from "../../../metafor.t.ts"
import type {Fields} from "./fields.ts"

export type FieldType = "string" | "number" | "boolean" | "array" | "enum"

export abstract class Field {
  constructor(
    protected readonly fields: Fields,
    public key: FieldKey,
  ) {
  }

  abstract readonly type: FieldType

  async uuid(): Promise<string> {
    const row = (
      await this.fields.wimp.sql<Array<{ uuid: string }>>`
          SELECT uuid
          FROM field
          WHERE wimp = ${this.fields.wimp.src}
            AND key = ${this.key}
          LIMIT 1
      `
    )[0]
    if (!row) throw new Error(`field ${this.key} not found in meta ${this.fields.wimp.src}`)
    return row.uuid
  }

  async setKey(newKey: FieldKey): Promise<void> {
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
  protected async ensureDefaultRow(uuid: string): Promise<void> {
    const existing = (
      await this.fields.wimp.sql<Array<{ field: string }>>`
          SELECT field
          FROM field_default
          WHERE field = ${uuid}
          LIMIT 1
      `
    )[0]
    if (existing) return
    await this.fields.wimp.sql`INSERT INTO field_default (field) VALUES (${uuid})`
  }
}
