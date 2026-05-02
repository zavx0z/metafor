import type { Transition } from "./transition.ts"
import { Predicate } from "./predicate.ts"

/**
 * Резолвит `field.uuid` по ключу поля внутри текущей wimp.
 */
const resolveFieldUuid = async (
  sql: import("bun").SQL,
  src: string,
  fieldKey: string,
): Promise<string | null> => {
  const row = (
    await sql<Array<{ uuid: string }>>`
      SELECT uuid FROM field WHERE wimp = ${src} AND key = ${fieldKey} LIMIT 1
    `
  )[0]
  return row?.uuid ?? null
}

export class Condition {
  readonly predicates: Predicates

  constructor(
    readonly transition: Transition,
    readonly fieldKey: string,
  ) {
    this.predicates = new Predicates(this)
  }

  async uuid(): Promise<string> {
    const sql = this.transition.state.states.wimp.sql
    const transitionUuid = await this.transition.uuid()
    const row = (
      await sql<Array<{ uuid: string }>>`
        SELECT condition.uuid AS uuid
        FROM condition
        INNER JOIN field ON field.uuid = condition.field
        WHERE condition.transition = ${transitionUuid}
          AND field.key = ${this.fieldKey}
        LIMIT 1
      `
    )[0]
    if (!row) {
      throw new Error(
        `condition for field ${this.fieldKey} not found in transition (state ${this.transition.state.name})`,
      )
    }
    return row.uuid
  }
}

export class Predicates {
  constructor(readonly condition: Condition) {}

  /**
   * INSERT в `condition_predicate`. `op` — DSL-ключ (`eq`, `notEq`, `null`, `gt`, ...);
   * внутри транслируется в SQL-operator (`notEq → neq`, `null` → eq/neq + value_kind=null).
   * `value_kind/value_*` определяются по типу `val`. Для enum-вариантов используется
   * pre-resolve в `value_variant` (если value совпадает с enum.item_value поля).
   */
  async add(op: string, val: unknown): Promise<Predicate> {
    const sql = this.condition.transition.state.states.wimp.sql
    const conditionUuid = await this.condition.uuid()

    const posRow = (
      await sql<Array<{ next: number }>>`
        SELECT COALESCE(MAX(predicate_order) + 1, 0) AS next
        FROM condition_predicate
        WHERE condition = ${conditionUuid}
      `
    )[0]
    const order = posRow?.next ?? 0

    let operator = op
    let valueKind: "null" | "boolean" | "number" | "string" | "enum" | "list" = "null"
    let valueBoolean: number | null = null
    let valueNumber: number | null = null
    let valueText: string | null = null
    const valueVariant: string | null = null

    if (op === "notEq") operator = "neq"

    if (op === "null") {
      operator = val === false ? "neq" : "eq"
      valueKind = "null"
    } else if (typeof val === "boolean") {
      valueKind = "boolean"
      valueBoolean = val ? 1 : 0
    } else if (typeof val === "number") {
      valueKind = "number"
      valueNumber = val
    } else if (typeof val === "string") {
      valueKind = "string"
      valueText = val
    }

    const uuid = crypto.randomUUID()
    await sql`
      INSERT INTO condition_predicate (uuid, condition, predicate_order, subject_kind, operator,
                                       value_kind, value_boolean, value_number, value_text,
                                       value_variant)
      VALUES (${uuid}, ${conditionUuid}, ${order}, ${"value"}, ${operator},
              ${valueKind}, ${valueBoolean}, ${valueNumber}, ${valueText},
              ${valueVariant})
    `
    return new Predicate(this.condition, uuid)
  }

  async all(): Promise<Predicate[]> {
    const sql = this.condition.transition.state.states.wimp.sql
    const conditionUuid = await this.condition.uuid()
    const rows = await sql<Array<{ uuid: string }>>`
      SELECT uuid FROM condition_predicate
      WHERE condition = ${conditionUuid}
      ORDER BY predicate_order
    `
    return rows.map((row) => new Predicate(this.condition, row.uuid))
  }

  async count(): Promise<number> {
    const sql = this.condition.transition.state.states.wimp.sql
    const conditionUuid = await this.condition.uuid()
    const row = (
      await sql<Array<{ count: number }>>`
        SELECT COUNT(*) AS count FROM condition_predicate WHERE condition = ${conditionUuid}
      `
    )[0]
    return row?.count ?? 0
  }

  async exists(): Promise<boolean> {
    const sql = this.condition.transition.state.states.wimp.sql
    const conditionUuid = await this.condition.uuid()
    const row = (
      await sql<Array<{ ok: number }>>`
        SELECT 1 AS ok FROM condition_predicate WHERE condition = ${conditionUuid} LIMIT 1
      `
    )[0]
    return row !== undefined
  }
}

export class Conditions {
  constructor(readonly transition: Transition) {}

  /**
   * INSERT в `condition`. `fieldKey` резолвится в `field.uuid` через wimp+key.
   * Если поле не существует — возвращает `null` (caller skip-ает).
   */
  async add(fieldKey: string): Promise<Condition | null> {
    const sql = this.transition.state.states.wimp.sql
    const src = this.transition.state.states.wimp.src
    const fieldUuid = await resolveFieldUuid(sql, src, fieldKey)
    if (!fieldUuid) return null

    const transitionUuid = await this.transition.uuid()

    const posRow = (
      await sql<Array<{ next: number }>>`
        SELECT COALESCE(MAX(position) + 1, 0) AS next
        FROM condition
        WHERE transition = ${transitionUuid}
      `
    )[0]
    const position = posRow?.next ?? 0

    const uuid = crypto.randomUUID()
    await sql`
      INSERT INTO condition (uuid, transition, field, position)
      VALUES (${uuid}, ${transitionUuid}, ${fieldUuid}, ${position})
    `
    return new Condition(this.transition, fieldKey)
  }

  async all(): Promise<Condition[]> {
    const sql = this.transition.state.states.wimp.sql
    const transitionUuid = await this.transition.uuid()
    const rows = await sql<Array<{ field_key: string }>>`
      SELECT field.key AS field_key
      FROM condition
      INNER JOIN field ON field.uuid = condition.field
      WHERE condition.transition = ${transitionUuid}
      ORDER BY condition.position
    `
    return rows.map((row) => new Condition(this.transition, row.field_key))
  }

  async get(filter: { fieldKey: string }): Promise<Condition | null> {
    const sql = this.transition.state.states.wimp.sql
    const transitionUuid = await this.transition.uuid()
    const row = (
      await sql<Array<{ ok: number }>>`
        SELECT 1 AS ok
        FROM condition
        INNER JOIN field ON field.uuid = condition.field
        WHERE condition.transition = ${transitionUuid}
          AND field.key = ${filter.fieldKey}
        LIMIT 1
      `
    )[0]
    return row ? new Condition(this.transition, filter.fieldKey) : null
  }

  async count(): Promise<number> {
    const sql = this.transition.state.states.wimp.sql
    const transitionUuid = await this.transition.uuid()
    const row = (
      await sql<Array<{ count: number }>>`
        SELECT COUNT(*) AS count FROM condition WHERE transition = ${transitionUuid}
      `
    )[0]
    return row?.count ?? 0
  }

  async exists(): Promise<boolean> {
    const sql = this.transition.state.states.wimp.sql
    const transitionUuid = await this.transition.uuid()
    const row = (
      await sql<Array<{ ok: number }>>`
        SELECT 1 AS ok FROM condition WHERE transition = ${transitionUuid} LIMIT 1
      `
    )[0]
    return row !== undefined
  }
}
