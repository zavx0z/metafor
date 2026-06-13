import wimpSchemaSql from "./wimp.sql" with {type: "text"}
import massSchemaSql from "./mass.sql" with {type: "text"}
import fieldSchemaSql from "./fields/field.sql" with {type: "text"}
import fieldStringSchemaSql from "./fields/string.sql" with {type: "text"}
import fieldNumberSchemaSql from "./fields/number.sql" with {type: "text"}
import fieldBooleanSchemaSql from "./fields/boolean.sql" with {type: "text"}
import fieldArraySchemaSql from "./fields/array.sql" with {type: "text"}
import fieldEnumSchemaSql from "./fields/enum.sql" with {type: "text"}
import stateSchemaSql from "./states/state.sql" with {type: "text"}
import transitionSchemaSql from "./states/transition.sql" with {type: "text"}
import conditionSchemaSql from "./states/condition.sql" with {type: "text"}
import predicateSchemaSql from "./states/predicate.sql" with {type: "text"}
import processSchemaSql from "./processes/process.sql" with {type: "text"}
import actionSchemaSql from "./processes/action.sql" with {type: "text"}
import finallySchemaSql from "./processes/finally.sql" with {type: "text"}
import reactionsSchemaSql from "./reactions.sql" with {type: "text"}
import matterSchemaSql from "./matter.sql" with {type: "text"}
import {SQL} from "bun"
import {Wimp} from "./wimp.ts"
import {emitForceParts, type Particle} from "../../force.ts"
import type {FieldDefinition, FieldKey, MetaDSL} from "../../../metafor.t.ts"

export type WimpCreateInput = {
  name?: string | null | undefined
  desc?: string | null | undefined
  bulk?: MetaDSL["bulk"] | null | undefined
  mass?: MetaDSL["mass"]
  fields?: Record<FieldKey, FieldDefinition> | undefined
}

type FieldRow = {
  uuid: string
  key: string
  type: FieldDefinition["type"]
  required: number
  label: string | null
}

const encodePathSegment = (segment: string): string => segment.replaceAll("~", "~0").replaceAll("/", "~1")

const wimpPath = (src: string): string => `/wimp/${encodePathSegment(src)}`

const collectWimpCreateParticles = async (sql: SQL, src: string): Promise<Particle[]> => {
  const basePath = wimpPath(src)
  const parts: Particle[] = []
  const row = (
    await sql<Array<{name: string | null; desc: string | null; view_css: string | null}>>`
      SELECT name, desc, view_css FROM wimp WHERE src = ${src} LIMIT 1
    `
  )[0]
  if (!row) return parts

  parts.push({
    part: "graviton",
    op: "add",
    path: basePath,
    value: {name: row.name, desc: row.desc, view_css: row.view_css},
  })

  const massRows = await sql<
    Array<{
      uuid: string
      parent_value: string | null
      value_kind: string
      entry_key: string | null
      entry_order: number | null
      text_value: string | null
      number_value: number | null
      boolean_value: number | null
    }>
  >`
    SELECT uuid, parent_value, value_kind, entry_key, entry_order,
           text_value, number_value, boolean_value
    FROM wimp_mass_value
    WHERE wimp = ${src}
    ORDER BY CASE WHEN parent_value IS NULL THEN 0 ELSE 1 END, entry_order, entry_key, rowid
  `
  for (const mass of massRows) {
    const value: Record<string, unknown> = {kind: mass.value_kind}
    if (mass.parent_value !== null) value.parent = mass.parent_value
    if (mass.entry_key !== null) value.key = mass.entry_key
    if (mass.entry_order !== null) value.order = mass.entry_order
    if (mass.text_value !== null) value.text = mass.text_value
    if (mass.number_value !== null) value.number = mass.number_value
    if (mass.boolean_value !== null) value.boolean = mass.boolean_value === 1
    parts.push({part: "graviton", op: "add", path: `${basePath}/mass/${encodePathSegment(mass.uuid)}`, value})
  }

  const fields = await sql<FieldRow[]>`
    SELECT uuid, key, type, required, label
    FROM field
    WHERE wimp = ${src}
    ORDER BY rowid
  `
  for (const field of fields) {
    const fieldPath = `${basePath}/field/${encodePathSegment(field.uuid)}`
    parts.push({
      part: "graviton",
      op: "add",
      path: fieldPath,
      value: {key: field.key, type: field.type, required: field.required === 1, label: field.label},
    })

    if (field.type === "enum") {
      const variants = await sql<Array<{uuid: string; position: number; item_value: string}>>`
        SELECT uuid, position, item_value
        FROM field_enum_variant
        WHERE field = ${field.uuid}
        ORDER BY position
      `
      for (const variant of variants) {
        parts.push({
          part: "graviton",
          op: "add",
          path: `${fieldPath}/variant/${encodePathSegment(variant.uuid)}`,
          value: {position: variant.position, item_value: variant.item_value},
        })
      }
    }

    const hasDefault = (
      await sql<Array<{ok: number}>>`SELECT 1 AS ok FROM field_default WHERE field = ${field.uuid} LIMIT 1`
    )[0]
    if (!hasDefault) continue

    parts.push({part: "graviton", op: "add", path: `${fieldPath}/default`})
    if (field.type === "string") {
      const defaultRow = (
        await sql<Array<{default_value: string}>>`
          SELECT default_value FROM field_string_default WHERE field = ${field.uuid} LIMIT 1
        `
      )[0]
      if (defaultRow) {
        parts.push({part: "graviton", op: "add", path: `${fieldPath}/default/scalar`, value: {kind: "string", text: defaultRow.default_value}})
      }
    } else if (field.type === "number") {
      const defaultRow = (
        await sql<Array<{default_value: number}>>`
          SELECT default_value FROM field_number_default WHERE field = ${field.uuid} LIMIT 1
        `
      )[0]
      if (defaultRow) {
        parts.push({part: "graviton", op: "add", path: `${fieldPath}/default/scalar`, value: {kind: "number", number: defaultRow.default_value}})
      }
    } else if (field.type === "boolean") {
      const defaultRow = (
        await sql<Array<{default_value: number}>>`
          SELECT default_value FROM field_boolean_default WHERE field = ${field.uuid} LIMIT 1
        `
      )[0]
      if (defaultRow) {
        parts.push({part: "graviton", op: "add", path: `${fieldPath}/default/scalar`, value: {kind: "boolean", boolean: defaultRow.default_value === 1}})
      }
    } else if (field.type === "array") {
      const items = await sql<Array<{uuid: string; position: number; item_value: string}>>`
        SELECT uuid, position, item_value
        FROM field_array_default_item
        WHERE field = ${field.uuid}
        ORDER BY position
      `
      for (const item of items) {
        parts.push({
          part: "graviton",
          op: "add",
          path: `${fieldPath}/default/item/${encodePathSegment(item.uuid)}`,
          value: {position: item.position, text: item.item_value},
        })
      }
    } else if (field.type === "enum") {
      const defaultRow = (
        await sql<Array<{variant: string}>>`
          SELECT variant FROM field_enum_default WHERE field = ${field.uuid} LIMIT 1
        `
      )[0]
      if (defaultRow) {
        parts.push({part: "graviton", op: "add", path: `${fieldPath}/default/variant`, value: {variant: defaultRow.variant}})
      }
    }
  }

  return parts
}

export class StoreWimpSqlite {
  private constructor(private readonly sql: SQL) {}

  static async open(sql: SQL): Promise<StoreWimpSqlite> {
    await sql.unsafe(
      [
        wimpSchemaSql,
        massSchemaSql,
        fieldSchemaSql,
        fieldStringSchemaSql,
        fieldNumberSchemaSql,
        fieldBooleanSchemaSql,
        fieldArraySchemaSql,
        fieldEnumSchemaSql,
        stateSchemaSql,
        transitionSchemaSql,
        conditionSchemaSql,
        predicateSchemaSql,
        processSchemaSql,
        actionSchemaSql,
        finallySchemaSql,
        reactionsSchemaSql,
        matterSchemaSql,
      ]
        .map((sql) => sql.trim())
        .filter(Boolean)
        .join("\n\n")
        .trim(),
    )
    return new StoreWimpSqlite(sql)
  }

  /**
   * Дешевая проверка существования декларации без создания ORM-объекта.
   */
  async exists(src: string): Promise<boolean> {
    const row = (
      await this.sql<Array<{ok: number}>>`
        SELECT 1 AS ok FROM wimp WHERE src = ${src} LIMIT 1
      `
    )[0]
    return row !== undefined
  }

  /**
   * Создаёт wimp-декларацию одним ORM-входом.
   * Все параметры опциональны; после SQL commit Store отправляет batch `particles`.
   */
  async create(src: string, input: WimpCreateInput = {}): Promise<Wimp> {
    await this.sql.begin(async (tx) => {
      await tx`DELETE FROM wimp WHERE src = ${src}`
      await tx`
        INSERT INTO wimp (src, name, desc, view_css)
        VALUES (${src}, ${input.name ?? null}, ${input.desc ?? null}, ${input.bulk?.view ?? null})
      `

      const wimp = new Wimp(tx as SQL, src)
      if (input.mass !== undefined) await wimp.mass.set(input.mass)

      for (const [key, {type, ...definition}] of Object.entries(input.fields ?? {})) {
        await wimp.fields.add(type, {key, ...definition})
      }
    })

    const wimp = new Wimp(this.sql, src)
    emitForceParts(await collectWimpCreateParticles(this.sql, src))
    return wimp
  }

  async get(src: string): Promise<Wimp | null> {
    return await this.exists(src) ? new Wimp(this.sql, src) : null
  }
}
