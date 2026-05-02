import {Field} from "./field.ts"

export class BooleanField extends Field {
  readonly type = "boolean" as const

  async default(): Promise<boolean | undefined> {
    const row = (
      await this.fields.wimp.sql<Array<{ default_value: number }>>`
          SELECT bd.default_value
          FROM field f
                   INNER JOIN field_boolean_default bd ON bd.field = f.uuid
          WHERE f.wimp = ${this.fields.wimp.src}
            AND f.key = ${this.key}
      `
    )[0]
    return row === undefined ? undefined : row.default_value === 1
  }

  async setDefault(value: boolean): Promise<void> {
    if (typeof value !== "boolean") {
      throw new Error(`BooleanField.setDefault: expected boolean, got ${typeof value}`)
    }
    const uuid = await this.uuid()
    await this.ensureDefaultRow(uuid)
    const sql = this.fields.wimp.sql
    await sql`DELETE FROM field_boolean_default WHERE field = ${uuid}`
    await sql`INSERT INTO field_boolean_default (field, default_value) VALUES (${uuid}, ${value ? 1 : 0})`
  }
}
