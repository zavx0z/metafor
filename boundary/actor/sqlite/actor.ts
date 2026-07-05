import type {SQL} from "bun"
import type {ActorRecord, ActorRows, ActorStateRecord, ActorValueRecord, ValueItemRecord, ValueRecord} from "@metafor/types/persistence"
import {ActorFieldValue} from "./actor_value.ts"

const isStoredId = (id: number | null | undefined): id is number =>
  typeof id === "number" && Number.isInteger(id) && id > 0

const clearValueScalarTables = async (sql: SQL, id: number): Promise<void> => {
  await sql`DELETE FROM value_boolean WHERE value = ${id}`
  await sql`DELETE FROM value_number WHERE value = ${id}`
  await sql`DELETE FROM value_string WHERE value = ${id}`
  await sql`DELETE FROM value_enum WHERE value = ${id}`
}

const writeValueScalar = async (sql: SQL, value: ValueRecord): Promise<void> => {
  switch (value.kind) {
    case "null":
    case "list":
      return
    case "boolean":
      await sql`INSERT INTO value_boolean (value, boolean) VALUES (${value.id}, ${value.boolean ? 1 : 0})`
      return
    case "number":
      await sql`INSERT INTO value_number (value, number) VALUES (${value.id}, ${value.number})`
      return
    case "string":
      await sql`INSERT INTO value_string (value, text) VALUES (${value.id}, ${value.text})`
      return
    case "enum":
      await sql`INSERT INTO value_enum (value, variant) VALUES (${value.id}, ${value.variant})`
      return
  }
}

export const decodeActorRow = (row: Record<string, unknown>): ActorRecord => ({
  id: Number(row.id),
  parentActor: row.parent_actor === null || row.parent_actor === undefined ? null : Number(row.parent_actor),
  parentTopology: row.parent_topology === null || row.parent_topology === undefined ? null : Number(row.parent_topology),
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
    private readonly parentId: number,
  ) {}

  async all(): Promise<Actor[]> {
    const rows = await this.sql<Array<{id: number}>>`
      SELECT id FROM actor WHERE parent_actor = ${this.parentId} ORDER BY position
    `
    return rows.map((row) => new Actor(this.sql, Number(row.id)))
  }

  async get({id}: {id: number}): Promise<Actor | null> {
    const row = (
      await this.sql<Array<{ok: number}>>`
        SELECT 1 AS ok FROM actor WHERE id = ${id} AND parent_actor = ${this.parentId} LIMIT 1
      `
    )[0]
    return row ? new Actor(this.sql, id) : null
  }

  async count(): Promise<number> {
    const row = (
      await this.sql<Array<{count: number}>>`
        SELECT COUNT(*) AS count FROM actor WHERE parent_actor = ${this.parentId}
      `
    )[0]
    return row?.count ?? 0
  }

  async exists(): Promise<boolean> {
    const row = (
      await this.sql<Array<{ok: number}>>`
        SELECT 1 AS ok FROM actor WHERE parent_actor = ${this.parentId} LIMIT 1
      `
    )[0]
    return row !== undefined
  }
}

export class ActorValues {
  constructor(
    private readonly sql: SQL,
    private readonly actorId: number,
  ) {}

  async all(): Promise<ActorFieldValue[]> {
    const rows = await this.sql<Array<{field: number}>>`
      SELECT field FROM actor_value WHERE actor = ${this.actorId}
    `
    return rows.map((row) => new ActorFieldValue(this.sql, this.actorId, Number(row.field)))
  }

  async get({field}: {field: number}): Promise<ActorFieldValue | null> {
    return ActorFieldValue.get(this.sql, this.actorId, field)
  }

  async count(): Promise<number> {
    const row = (
      await this.sql<Array<{count: number}>>`
        SELECT COUNT(*) AS count FROM actor_value WHERE actor = ${this.actorId}
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
    const rows = await this.sql<Array<{id: number}>>`
      SELECT id FROM actor
      WHERE parent_actor IS NULL AND parent_topology IS NULL
      ORDER BY position
    `
    return rows.map((row) => new Actor(this.sql, Number(row.id)))
  }

  async get({id}: {id: number}): Promise<Actor | null> {
    const row = (
      await this.sql<Array<{ok: number}>>`
        SELECT 1 AS ok FROM actor
        WHERE id = ${id} AND parent_actor IS NULL AND parent_topology IS NULL
        LIMIT 1
      `
    )[0]
    return row ? new Actor(this.sql, id) : null
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
    readonly id: number,
  ) {
    this.children = new ActorChildren(sql, id)
    this.values = new ActorValues(sql, id)
  }

  /**
   * Записывает actor row + actor_value-связи + value-records + actor_state одной транзакцией.
   * Идемпотентно по `actor.id`: повторная запись делает DELETE+INSERT, оставляет orphan-value cleanup.
   */
  static async writeRows(sql: SQL, rows: ActorRows): Promise<number> {
    return await sql.begin(async (tx) => {
      const inputActorId = rows.actor.id
      const collected = isStoredId(inputActorId)
        ? await tx<Array<{value: number}>>`SELECT value FROM actor_value WHERE actor = ${inputActorId}`
        : []
      const oldValueIds = collected.map((r) => r.value)
      if (isStoredId(inputActorId)) await tx`DELETE FROM actor WHERE id = ${inputActorId}`

      // position = next среди siblings по polymorphic parent
      const siblingCount = (
        await tx<Array<{count: number}>>`
          SELECT COUNT(*) AS count FROM actor
          WHERE parent_actor IS ${rows.actor.parentActor}
            AND parent_topology IS ${rows.actor.parentTopology}
        `
      )[0]?.count ?? 0
      const position = Number(siblingCount)

      const actorId = isStoredId(inputActorId)
        ? inputActorId
        : (await tx<Array<{id: number}>>`
            INSERT INTO actor (parent_actor, parent_topology, wimp, position)
            VALUES (${rows.actor.parentActor}, ${rows.actor.parentTopology}, ${rows.actor.wimp}, ${position})
            RETURNING id
          `)[0]?.id
      if (!actorId) throw new Error("Actor.writeRows: actor insert did not return id")

      if (isStoredId(inputActorId)) {
        await tx`
          INSERT INTO actor (id, parent_actor, parent_topology, wimp, position)
          VALUES (${actorId}, ${rows.actor.parentActor}, ${rows.actor.parentTopology},
                  ${rows.actor.wimp}, ${position})
        `
      }

      // value-записи: upsert корня + типизированная подтаблица
      const valueIdMap = new Map<number, number>()
      const resolveValueId = (id: number): number => {
        const mapped = valueIdMap.get(id)
        if (mapped !== undefined) return mapped
        if (isStoredId(id)) return id
        throw new Error(`Actor.writeRows: unresolved temporary value id ${id}`)
      }

      for (const v of rows.valueRecords) {
        const valueId = isStoredId(v.id)
          ? v.id
          : (await tx<Array<{id: number}>>`
              INSERT INTO value (kind) VALUES (${v.kind})
              RETURNING id
            `)[0]?.id
        if (!valueId) throw new Error("Actor.writeRows: value insert did not return id")
        if (!isStoredId(v.id)) valueIdMap.set(v.id, valueId)

        if (isStoredId(v.id)) {
          await tx`
            INSERT INTO value (id, kind) VALUES (${valueId}, ${v.kind})
            ON CONFLICT (id) DO UPDATE SET kind = excluded.kind
          `
        }
        await clearValueScalarTables(tx, valueId)
        await writeValueScalar(tx, {...v, id: valueId} as ValueRecord)
      }

      // value_list_item: переписать набор для каждой list-value-записи
      const listValueIds = new Set(rows.valueRecords.filter((v) => v.kind === "list").map((v) => resolveValueId(v.id)))
      for (const valueId of listValueIds) {
        await tx`DELETE FROM value_list_item WHERE value = ${valueId}`
      }
      for (const item of rows.valueItems) {
        const valueId = resolveValueId(item.value)
        await tx`
          INSERT INTO value_list_item (value, position, item_value) VALUES (${valueId}, ${item.position}, ${item.itemValue})
          ON CONFLICT (value, position) DO UPDATE SET item_value = excluded.item_value
        `
      }

      // связи actor_value
      for (const av of rows.values) {
        await tx`INSERT INTO actor_value (actor, field, value) VALUES (${actorId}, ${av.field}, ${resolveValueId(av.value)})`
      }

      // metaState может быть NULL, если у meta нет superposition
      await tx`INSERT INTO actor_state (actor, metaState) VALUES (${actorId}, ${rows.state.metaState})`

      // подчистить orphan-value (которые после удаления актора больше никем не делятся)
      for (const valueId of oldValueIds) {
        await tx`
          DELETE FROM value WHERE id = ${valueId} AND NOT EXISTS (SELECT 1 FROM actor_value WHERE value = id)
        `
      }
      return actorId
    })
  }

  async wimp(): Promise<string> {
    const row = (
      await this.sql<Array<{wimp: string}>>`
        SELECT wimp FROM actor WHERE id = ${this.id} LIMIT 1
      `
    )[0]
    if (!row) throw new Error(`actor ${this.id} not found`)
    return String(row.wimp)
  }

  async position(): Promise<number> {
    const row = (
      await this.sql<Array<{position: number}>>`
        SELECT position FROM actor WHERE id = ${this.id} LIMIT 1
      `
    )[0]
    if (!row) throw new Error(`actor ${this.id} not found`)
    return Number(row.position)
  }

  /**
   * Возвращает `parentActor`/`parentTopology` id. Если у актора есть родитель-actor —
   * вернётся `Actor`-ORM. Если родитель — topology-узел, нужно получать его через
   * `boundary.topology.get(parentTopology)` (избегаем cross-package import).
   */
  async parentRef(): Promise<{kind: "actor"; id: number} | {kind: "topology"; id: number} | null> {
    const row = (
      await this.sql<Array<{parent_actor: number | null; parent_topology: number | null}>>`
        SELECT parent_actor, parent_topology FROM actor WHERE id = ${this.id} LIMIT 1
      `
    )[0]
    if (!row) throw new Error(`actor ${this.id} not found`)
    if (row.parent_actor !== null && row.parent_actor !== undefined) {
      return {kind: "actor", id: Number(row.parent_actor)}
    }
    if (row.parent_topology !== null && row.parent_topology !== undefined) {
      return {kind: "topology", id: Number(row.parent_topology)}
    }
    return null
  }

  /** Удобный метод когда заведомо известно что родитель — другой actor (wimp под wimp). */
  async parent(): Promise<Actor | null> {
    const ref = await this.parentRef()
    return ref?.kind === "actor" ? new Actor(this.sql, ref.id) : null
  }

  async state(): Promise<ActorStateRecord | null> {
    const row = (
      await this.sql<Array<{actor: number; metaState: number | null}>>`
        SELECT actor, metaState FROM actor_state WHERE actor = ${this.id} LIMIT 1
      `
    )[0]
    if (!row) return null
    return {actor: Number(row.actor), metaState: row.metaState === null ? null : Number(row.metaState)}
  }

  async rows(): Promise<ActorRows> {
    const actorRow = (
      await this.sql<Array<Record<string, unknown>>>`
        SELECT id, parent_actor, parent_topology, wimp, position FROM actor WHERE id = ${this.id}
      `
    )[0]
    if (!actorRow) throw new Error(`actor ${this.id} not found`)

    const actorValueRows = await this.sql<Array<{actor: number; field: number; value: number}>>`
      SELECT actor, field, value FROM actor_value WHERE actor = ${this.id}
    `
    const values: ActorValueRecord[] = actorValueRows.map((row) => ({
      actor: Number(row.actor),
      field: Number(row.field),
      value: Number(row.value),
    }))

    const valueIds = [...new Set(values.map((v) => v.value))]
    const valueRecords: ValueRecord[] = []
    const valueItems: ValueItemRecord[] = []

    if (valueIds.length > 0) {
      const valueRows = await this.sql<Array<Record<string, unknown>>>`
        SELECT v.id AS id,
               v.kind AS kind,
               vb.boolean AS boolean,
               vn.number  AS number,
               vs.text    AS text,
               ve.variant AS variant
        FROM value v
             LEFT JOIN value_boolean vb ON vb.value = v.id
             LEFT JOIN value_number  vn ON vn.value = v.id
             LEFT JOIN value_string  vs ON vs.value = v.id
             LEFT JOIN value_enum    ve ON ve.value = v.id
        WHERE v.id IN ${this.sql(valueIds)}
      `
      for (const row of valueRows) {
        const id = Number(row.id)
        const kind = String(row.kind)
        switch (kind) {
          case "null":
            valueRecords.push({id: id, kind: "null"})
            break
          case "boolean":
            valueRecords.push({id: id, kind: "boolean", boolean: row.boolean === 1})
            break
          case "number":
            valueRecords.push({id: id, kind: "number", number: Number(row.number)})
            break
          case "string":
            valueRecords.push({id: id, kind: "string", text: String(row.text)})
            break
          case "enum":
            valueRecords.push({id: id, kind: "enum", variant: Number(row.variant)})
            break
          case "list":
            valueRecords.push({id: id, kind: "list"})
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
          value: Number(row.value),
          position: Number(row.position),
          itemValue: String(row.item_value),
        })
      }
    }

    const stateRow = (
      await this.sql<Array<{actor: number; metaState: number | null}>>`
        SELECT actor, metaState FROM actor_state WHERE actor = ${this.id} LIMIT 1
      `
    )[0]
    if (!stateRow) throw new Error(`actor_state ${this.id} not found`)

    return {
      actor: decodeActorRow(actorRow),
      values,
      valueRecords,
      valueItems,
      state: {
        actor: Number(stateRow.actor),
        metaState: stateRow.metaState === null ? null : Number(stateRow.metaState),
      },
    }
  }
}
