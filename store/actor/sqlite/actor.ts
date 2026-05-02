import type {SQL} from "bun"
import type {ActorRecord, ActorRows} from "./actor.t.ts"
import type {ActorStateRecord} from "./state.t.ts"
import type {ActorValueRecord} from "./actor_value.t.ts"
import type {ValueItemRecord, ValueRecord} from "./value.t.ts"
import {ActorFieldValue} from "./actor_value.ts"

const clearValueScalarTables = async (sql: SQL, uuid: string): Promise<void> => {
  await sql`DELETE FROM value_boolean WHERE value = ${uuid}`
  await sql`DELETE FROM value_number WHERE value = ${uuid}`
  await sql`DELETE FROM value_string WHERE value = ${uuid}`
  await sql`DELETE FROM value_enum WHERE value = ${uuid}`
}

const writeValueScalar = async (sql: SQL, value: ValueRecord): Promise<void> => {
  switch (value.kind) {
    case "null":
    case "list":
      return
    case "boolean":
      await sql`INSERT INTO value_boolean (value, boolean) VALUES (${value.uuid}, ${value.boolean ? 1 : 0})`
      return
    case "number":
      await sql`INSERT INTO value_number (value, number) VALUES (${value.uuid}, ${value.number})`
      return
    case "string":
      await sql`INSERT INTO value_string (value, text) VALUES (${value.uuid}, ${value.text})`
      return
    case "enum":
      await sql`INSERT INTO value_enum (value, variant) VALUES (${value.uuid}, ${value.variant})`
      return
  }
}

export const decodeActorRow = (row: Record<string, unknown>): ActorRecord => ({
  uuid: String(row.uuid),
  parentActor: row.parent_actor === null || row.parent_actor === undefined ? null : String(row.parent_actor),
  parentTopology: row.parent_topology === null || row.parent_topology === undefined ? null : String(row.parent_topology),
  wimp: String(row.wimp),
  position: Number(row.position),
})

/**
 * Дочерние акторы (Wimp под Wimp). Для смешанных детей с topology-узлами
 * читать также `topology` table напрямую — runtime tree polymorphic.
 */
export class ActorChildren {
  constructor(
    private readonly sql: SQL,
    private readonly parentUuid: string,
  ) {}

  async all(): Promise<Actor[]> {
    const rows = await this.sql<Array<{uuid: string}>>`
      SELECT uuid FROM actor WHERE parent_actor = ${this.parentUuid} ORDER BY position
    `
    return rows.map((row) => new Actor(this.sql, String(row.uuid)))
  }

  async get({uuid}: {uuid: string}): Promise<Actor | null> {
    const row = (
      await this.sql<Array<{ok: number}>>`
        SELECT 1 AS ok FROM actor WHERE uuid = ${uuid} AND parent_actor = ${this.parentUuid} LIMIT 1
      `
    )[0]
    return row ? new Actor(this.sql, uuid) : null
  }

  async count(): Promise<number> {
    const row = (
      await this.sql<Array<{count: number}>>`
        SELECT COUNT(*) AS count FROM actor WHERE parent_actor = ${this.parentUuid}
      `
    )[0]
    return row?.count ?? 0
  }

  async exists(): Promise<boolean> {
    const row = (
      await this.sql<Array<{ok: number}>>`
        SELECT 1 AS ok FROM actor WHERE parent_actor = ${this.parentUuid} LIMIT 1
      `
    )[0]
    return row !== undefined
  }
}

export class ActorValues {
  constructor(
    private readonly sql: SQL,
    private readonly actorUuid: string,
  ) {}

  async all(): Promise<ActorFieldValue[]> {
    const rows = await this.sql<Array<{field: string}>>`
      SELECT field FROM actor_value WHERE actor = ${this.actorUuid}
    `
    return rows.map((row) => new ActorFieldValue(this.sql, this.actorUuid, String(row.field)))
  }

  async get({field}: {field: string}): Promise<ActorFieldValue | null> {
    return ActorFieldValue.get(this.sql, this.actorUuid, field)
  }

  async count(): Promise<number> {
    const row = (
      await this.sql<Array<{count: number}>>`
        SELECT COUNT(*) AS count FROM actor_value WHERE actor = ${this.actorUuid}
      `
    )[0]
    return row?.count ?? 0
  }
}

/**
 * Корневые акторы — те, у которых нет ни actor-родителя, ни topology-родителя.
 */
export class ActorRoots {
  constructor(private readonly sql: SQL) {}

  async all(): Promise<Actor[]> {
    const rows = await this.sql<Array<{uuid: string}>>`
      SELECT uuid FROM actor
      WHERE parent_actor IS NULL AND parent_topology IS NULL
      ORDER BY position
    `
    return rows.map((row) => new Actor(this.sql, String(row.uuid)))
  }

  async get({uuid}: {uuid: string}): Promise<Actor | null> {
    const row = (
      await this.sql<Array<{ok: number}>>`
        SELECT 1 AS ok FROM actor
        WHERE uuid = ${uuid} AND parent_actor IS NULL AND parent_topology IS NULL
        LIMIT 1
      `
    )[0]
    return row ? new Actor(this.sql, uuid) : null
  }

  async count(): Promise<number> {
    const row = (
      await this.sql<Array<{count: number}>>`
        SELECT COUNT(*) AS count FROM actor
        WHERE parent_actor IS NULL AND parent_topology IS NULL
      `
    )[0]
    return row?.count ?? 0
  }

  async exists(): Promise<boolean> {
    const row = (
      await this.sql<Array<{ok: number}>>`
        SELECT 1 AS ok FROM actor
        WHERE parent_actor IS NULL AND parent_topology IS NULL
        LIMIT 1
      `
    )[0]
    return row !== undefined
  }
}

export class Actor {
  readonly children: ActorChildren
  readonly values: ActorValues

  constructor(
    private readonly sql: SQL,
    readonly uuid: string,
  ) {
    this.children = new ActorChildren(sql, uuid)
    this.values = new ActorValues(sql, uuid)
  }

  /**
   * Записывает actor row + actor_value-связи + value-records + actor_state одной транзакцией.
   * Идемпотентно по `actor.uuid`: повторная запись делает DELETE+INSERT, оставляет orphan-value cleanup.
   */
  static async writeRows(sql: SQL, rows: ActorRows): Promise<void> {
    await sql.begin(async (tx) => {
      const collected = await tx<Array<{value: string}>>`SELECT value FROM actor_value WHERE actor = ${rows.actor.uuid}`
      const oldValueIds = collected.map((r) => r.value)
      await tx`DELETE FROM actor WHERE uuid = ${rows.actor.uuid}`

      // position = next среди siblings по polymorphic parent
      const siblingCount = (
        await tx<Array<{count: number}>>`
          SELECT COUNT(*) AS count FROM actor
          WHERE parent_actor IS ${rows.actor.parentActor}
            AND parent_topology IS ${rows.actor.parentTopology}
        `
      )[0]?.count ?? 0
      const position = Number(siblingCount)

      // вставка actor с polymorphic parent
      await tx`
        INSERT INTO actor (uuid, parent_actor, parent_topology, wimp, position)
        VALUES (${rows.actor.uuid}, ${rows.actor.parentActor}, ${rows.actor.parentTopology},
                ${rows.actor.wimp}, ${position})
      `

      // value-записи: upsert корня + типизированная подтаблица
      for (const v of rows.valueRecords) {
        await tx`
          INSERT INTO value (uuid, kind) VALUES (${v.uuid}, ${v.kind})
          ON CONFLICT (uuid) DO UPDATE SET kind = excluded.kind
        `
        await clearValueScalarTables(tx, v.uuid)
        await writeValueScalar(tx, v)
      }

      // value_list_item: переписать набор для каждой list-value-записи
      const listValueIds = new Set(rows.valueRecords.filter((v) => v.kind === "list").map((v) => v.uuid))
      for (const valueId of listValueIds) {
        await tx`DELETE FROM value_list_item WHERE value = ${valueId}`
      }
      for (const item of rows.valueItems) {
        await tx`
          INSERT INTO value_list_item (value, position, item_value) VALUES (${item.value}, ${item.position}, ${item.itemValue})
          ON CONFLICT (value, position) DO UPDATE SET item_value = excluded.item_value
        `
      }

      // связи actor_value
      for (const av of rows.values) {
        await tx`INSERT INTO actor_value (actor, field, value) VALUES (${av.actor}, ${av.field}, ${av.value})`
      }

      // metaState может быть NULL, если у meta нет superposition
      await tx`INSERT INTO actor_state (actor, metaState) VALUES (${rows.state.actor}, ${rows.state.metaState})`

      // подчистить orphan-value (которые после удаления актора больше никем не делятся)
      for (const valueId of oldValueIds) {
        await tx`
          DELETE FROM value WHERE uuid = ${valueId} AND NOT EXISTS (SELECT 1 FROM actor_value WHERE value = uuid)
        `
      }
    })
  }

  async wimp(): Promise<string> {
    const row = (
      await this.sql<Array<{wimp: string}>>`
        SELECT wimp FROM actor WHERE uuid = ${this.uuid} LIMIT 1
      `
    )[0]
    if (!row) throw new Error(`actor ${this.uuid} not found`)
    return String(row.wimp)
  }

  async position(): Promise<number> {
    const row = (
      await this.sql<Array<{position: number}>>`
        SELECT position FROM actor WHERE uuid = ${this.uuid} LIMIT 1
      `
    )[0]
    if (!row) throw new Error(`actor ${this.uuid} not found`)
    return Number(row.position)
  }

  /**
   * Возвращает `parentActor`/`parentTopology` UUID. Если у актора есть родитель-actor —
   * вернётся `Actor`-ORM. Если родитель — topology-узел, нужно получать его через
   * `store.topology.get(parentTopology)` (избегаем cross-package import).
   */
  async parentRef(): Promise<{kind: "actor"; uuid: string} | {kind: "topology"; uuid: string} | null> {
    const row = (
      await this.sql<Array<{parent_actor: string | null; parent_topology: string | null}>>`
        SELECT parent_actor, parent_topology FROM actor WHERE uuid = ${this.uuid} LIMIT 1
      `
    )[0]
    if (!row) throw new Error(`actor ${this.uuid} not found`)
    if (row.parent_actor !== null && row.parent_actor !== undefined) {
      return {kind: "actor", uuid: String(row.parent_actor)}
    }
    if (row.parent_topology !== null && row.parent_topology !== undefined) {
      return {kind: "topology", uuid: String(row.parent_topology)}
    }
    return null
  }

  /** Удобный метод когда заведомо известно что родитель — другой actor (wimp под wimp). */
  async parent(): Promise<Actor | null> {
    const ref = await this.parentRef()
    return ref?.kind === "actor" ? new Actor(this.sql, ref.uuid) : null
  }

  async state(): Promise<ActorStateRecord | null> {
    const row = (
      await this.sql<Array<{actor: string; metaState: string | null}>>`
        SELECT actor, metaState FROM actor_state WHERE actor = ${this.uuid} LIMIT 1
      `
    )[0]
    if (!row) return null
    return {actor: String(row.actor), metaState: row.metaState === null ? null : String(row.metaState)}
  }

  async rows(): Promise<ActorRows> {
    const actorRow = (
      await this.sql<Array<Record<string, unknown>>>`
        SELECT uuid, parent_actor, parent_topology, wimp, position FROM actor WHERE uuid = ${this.uuid}
      `
    )[0]
    if (!actorRow) throw new Error(`actor ${this.uuid} not found`)

    const actorValueRows = await this.sql<Array<{actor: string; field: string; value: string}>>`
      SELECT actor, field, value FROM actor_value WHERE actor = ${this.uuid}
    `
    const values: ActorValueRecord[] = actorValueRows.map((row) => ({
      actor: String(row.actor),
      field: String(row.field),
      value: String(row.value),
    }))

    const valueIds = [...new Set(values.map((v) => v.value))]
    const valueRecords: ValueRecord[] = []
    const valueItems: ValueItemRecord[] = []

    if (valueIds.length > 0) {
      const valueRows = await this.sql<Array<Record<string, unknown>>>`
        SELECT v.uuid AS uuid,
               v.kind AS kind,
               vb.boolean AS boolean,
               vn.number  AS number,
               vs.text    AS text,
               ve.variant AS variant
        FROM value v
             LEFT JOIN value_boolean vb ON vb.value = v.uuid
             LEFT JOIN value_number  vn ON vn.value = v.uuid
             LEFT JOIN value_string  vs ON vs.value = v.uuid
             LEFT JOIN value_enum    ve ON ve.value = v.uuid
        WHERE v.uuid IN ${this.sql(valueIds)}
      `
      for (const row of valueRows) {
        const id = String(row.uuid)
        const kind = String(row.kind)
        switch (kind) {
          case "null":
            valueRecords.push({uuid: id, kind: "null"})
            break
          case "boolean":
            valueRecords.push({uuid: id, kind: "boolean", boolean: row.boolean === 1})
            break
          case "number":
            valueRecords.push({uuid: id, kind: "number", number: Number(row.number)})
            break
          case "string":
            valueRecords.push({uuid: id, kind: "string", text: String(row.text)})
            break
          case "enum":
            valueRecords.push({uuid: id, kind: "enum", variant: String(row.variant)})
            break
          case "list":
            valueRecords.push({uuid: id, kind: "list"})
            break
          default:
            throw new Error(`Unknown value.kind '${kind}' for ${id}`)
        }
      }

      const itemRows = await this.sql<Array<Record<string, unknown>>>`
        SELECT value, position, item_value FROM value_list_item
        WHERE value IN ${this.sql(valueIds)}
        ORDER BY value, position
      `
      for (const row of itemRows) {
        valueItems.push({
          value: String(row.value),
          position: Number(row.position),
          itemValue: String(row.item_value),
        })
      }
    }

    const stateRow = (
      await this.sql<Array<{actor: string; metaState: string | null}>>`
        SELECT actor, metaState FROM actor_state WHERE actor = ${this.uuid} LIMIT 1
      `
    )[0]
    if (!stateRow) throw new Error(`actor_state ${this.uuid} not found`)

    return {
      actor: decodeActorRow(actorRow),
      values,
      valueRecords,
      valueItems,
      state: {
        actor: String(stateRow.actor),
        metaState: stateRow.metaState === null ? null : String(stateRow.metaState),
      },
    }
  }
}
