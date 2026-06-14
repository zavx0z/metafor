import {Field} from "./field.ts"

export class StringField extends Field {
  readonly type = "string" as const

  async default(): Promise<string | undefined> {
    const row = (
      await this.fields.wimp.sql<Array<{ default_value: string }>>`
          SELECT sd.default_value
          FROM field f
                   INNER JOIN field_string_default sd ON sd.field = f.uuid
          WHERE f.wimp = ${this.fields.wimp.src}
            AND f.key = ${this.key}
      `
    )[0]
    return row?.default_value
  }

  async setDefault(value: string): Promise<void> {
    if (typeof value !== "string") {
      throw new Error(`StringField.setDefault: expected string, got ${typeof value}`)
    }
    const uuid = await this.uuid()
    await this.ensureDefaultRow(uuid)
    const sql = this.fields.wimp.sql
    await sql`DELETE FROM field_string_default WHERE field = ${uuid}`
    await sql`INSERT INTO field_string_default (field, default_value) VALUES (${uuid}, ${value})`
  }
}
