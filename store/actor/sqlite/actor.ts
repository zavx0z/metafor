
import type { SQL } from "bun"
import type { ActorRecord, ActorRows } from "./actor.t.ts"
import type { ActorStateRecord } from "./state.t.ts"
import type { ActorValueRecord } from "./actor_value.t.ts"
import type { ValueItemRecord, ValueRecord } from "./value.t.ts"
import { ActorFieldValue } from "./actor_value.ts"
import { deleteActor } from "./actor.D.ts"
import { setActorState } from "./state.U.ts"

const decodeActorRow = (row: Record<string, unknown>): ActorRecord => ({
  uuid: String(row.uuid),
  parent: row.parent === null || row.parent === undefined ? null : String(row.parent),
  meta: String(row.meta),
  position: Number(row.position),
})

export class ActorChildren {
  constructor(
    private readonly sql: SQL,
    private readonly parentUuid: string,
  ) {}

  async all(): Promise<Actor[]> {
    const rows = await this.sql<Array<{ uuid: string }>>`
      SELECT uuid FROM actor WHERE parent = ${this.parentUuid} ORDER BY position
    `
    return rows.map((row) => new Actor(this.sql, String(row.uuid)))
  }

  async get({ uuid }: { uuid: string }): Promise<Actor | null> {
    const row = (
      await this.sql<Array<{ ok: number }>>`
        SELECT 1 AS ok FROM actor WHERE uuid = ${uuid} AND parent = ${this.parentUuid} LIMIT 1
      `
    )[0]
    return row ? new Actor(this.sql, uuid) : null
  }

  async count(): Promise<number> {
    const row = (
      await this.sql<Array<{ count: number }>>`
        SELECT COUNT(*) AS count FROM actor WHERE parent = ${this.parentUuid}
      `
    )[0]
    return row?.count ?? 0
  }

  async exists(): Promise<boolean> {
    const row = (
      await this.sql<Array<{ ok: number }>>`
        SELECT 1 AS ok FROM actor WHERE parent = ${this.parentUuid} LIMIT 1
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
    const rows = await this.sql<Array<{ field: string }>>`
      SELECT field FROM actor_value WHERE actor = ${this.actorUuid}
    `
    return rows.map((row) => new ActorFieldValue(this.sql, this.actorUuid, String(row.field)))
  }

  async get({ field }: { field: string }): Promise<ActorFieldValue | null> {
    return ActorFieldValue.get(this.sql, this.actorUuid, field)
  }

  async count(): Promise<number> {
    const row = (
      await this.sql<Array<{ count: number }>>`
        SELECT COUNT(*) AS count FROM actor_value WHERE actor = ${this.actorUuid}
      `
    )[0]
    return row?.count ?? 0
  }
}

export class ActorRoots {
  constructor(private readonly sql: SQL) {}

  async all(): Promise<Actor[]> {
    const rows = await this.sql<Array<{ uuid: string }>>`
      SELECT uuid FROM actor WHERE parent IS NULL ORDER BY position
    `
    return rows.map((row) => new Actor(this.sql, String(row.uuid)))
  }

  async get({ uuid }: { uuid: string }): Promise<Actor | null> {
    const row = (
      await this.sql<Array<{ ok: number }>>`
        SELECT 1 AS ok FROM actor WHERE uuid = ${uuid} AND parent IS NULL LIMIT 1
      `
    )[0]
    return row ? new Actor(this.sql, uuid) : null
  }

  async count(): Promise<number> {
    const row = (
      await this.sql<Array<{ count: number }>>`
        SELECT COUNT(*) AS count FROM actor WHERE parent IS NULL
      `
    )[0]
    return row?.count ?? 0
  }

  async exists(): Promise<boolean> {
    const row = (
      await this.sql<Array<{ ok: number }>>`
        SELECT 1 AS ok FROM actor WHERE parent IS NULL LIMIT 1
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

    async meta(): Promise<string> {
    const row = (
      await this.sql<Array<{ meta: string }>>`
        SELECT meta FROM actor WHERE uuid = ${this.uuid} LIMIT 1
      `
    )[0]
    if (!row) throw new Error(`actor ${this.uuid} not found`)
    return String(row.meta)
  }

    async position(): Promise<number> {
    const row = (
      await this.sql<Array<{ position: number }>>`
        SELECT position FROM actor WHERE uuid = ${this.uuid} LIMIT 1
      `
    )[0]
    if (!row) throw new Error(`actor ${this.uuid} not found`)
    return Number(row.position)
  }

    async parent(): Promise<Actor | null> {
    const row = (
      await this.sql<Array<{ parent: string | null }>>`
        SELECT parent FROM actor WHERE uuid = ${this.uuid} LIMIT 1
      `
    )[0]
    if (!row) throw new Error(`actor ${this.uuid} not found`)
    return row.parent === null || row.parent === undefined ? null : new Actor(this.sql, String(row.parent))
  }

    async state(): Promise<ActorStateRecord | null> {
    const row = (
      await this.sql<Array<{ actor: string; metaState: string | null }>>`
        SELECT actor, metaState FROM actor_state WHERE actor = ${this.uuid} LIMIT 1
      `
    )[0]
    if (!row) return null
    return { actor: String(row.actor), metaState: row.metaState === null ? null : String(row.metaState) }
  }

    async rows(): Promise<ActorRows> {
    const actorRow = (
      await this.sql<Array<Record<string, unknown>>>`
        SELECT uuid, parent, meta, position FROM actor WHERE uuid = ${this.uuid}
      `
    )[0]
    if (!actorRow) throw new Error(`actor ${this.uuid} not found`)

    const actorValueRows = await this.sql<Array<{ actor: string; field: string; value: string }>>`
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
            valueRecords.push({ uuid: id, kind: "null" })
            break
          case "boolean":
            valueRecords.push({ uuid: id, kind: "boolean", boolean: row.boolean === 1 })
            break
          case "number":
            valueRecords.push({ uuid: id, kind: "number", number: Number(row.number) })
            break
          case "string":
            valueRecords.push({ uuid: id, kind: "string", text: String(row.text) })
            break
          case "enum":
            valueRecords.push({ uuid: id, kind: "enum", variant: String(row.variant) })
            break
          case "list":
            valueRecords.push({ uuid: id, kind: "list" })
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
      await this.sql<Array<{ actor: string; metaState: string | null }>>`
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

    async setState(metaState: string | null): Promise<void> {
    await setActorState(this.sql, this.uuid, metaState)
  }

    async delete(): Promise<void> {
    await deleteActor(this.sql, this.uuid)
  }
}
