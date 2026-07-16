import type {SQL} from "bun"
import type { AtomRecord, AtomRows } from "@metafor/types/boundary/atom"
import type { AtomStateRecord, AtomValueRecord, ValueItemRecord, ValueRecord } from "@metafor/types/boundary/value"
import {AtomFieldValue} from "./atom_value.ts"

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

export const decodeAtomRow = (row: Record<string, unknown>): AtomRecord => ({
  id: Number(row.id),
  parentAtom: row.parent_atom === null || row.parent_atom === undefined ? null : Number(row.parent_atom),
  parentTopology: row.parent_topology === null || row.parent_topology === undefined ? null : Number(row.parent_topology),
  wimp: String(row.wimp),
  position: Number(row.position),
})

/**
 * Дочерние атомы (Wimp под Wimp). Для смешанных детей с topology-узлами
 * читать также `topology` table напрямую — runtime tree polymorphic.
 */
export class AtomChildren {
  constructor(
    private readonly sql: SQL,
    private readonly parentId: number,
  ) {}

  async all(): Promise<Atom[]> {
    const rows = await this.sql<Array<{id: number}>>`
      SELECT id FROM atom WHERE parent_atom = ${this.parentId} ORDER BY position
    `
    return rows.map((row) => new Atom(this.sql, Number(row.id)))
  }

  async get({id}: {id: number}): Promise<Atom | null> {
    const row = (
      await this.sql<Array<{ok: number}>>`
        SELECT 1 AS ok FROM atom WHERE id = ${id} AND parent_atom = ${this.parentId} LIMIT 1
      `
    )[0]
    return row ? new Atom(this.sql, id) : null
  }

  async count(): Promise<number> {
    const row = (
      await this.sql<Array<{count: number}>>`
        SELECT COUNT(*) AS count FROM atom WHERE parent_atom = ${this.parentId}
      `
    )[0]
    return row?.count ?? 0
  }

  async exists(): Promise<boolean> {
    const row = (
      await this.sql<Array<{ok: number}>>`
        SELECT 1 AS ok FROM atom WHERE parent_atom = ${this.parentId} LIMIT 1
      `
    )[0]
    return row !== undefined
  }
}

export class AtomValues {
  constructor(
    private readonly sql: SQL,
    private readonly atomId: number,
  ) {}

  async all(): Promise<AtomFieldValue[]> {
    const rows = await this.sql<Array<{field: number}>>`
      SELECT field FROM atom_value WHERE atom = ${this.atomId}
    `
    return rows.map((row) => new AtomFieldValue(this.sql, this.atomId, Number(row.field)))
  }

  async get({field}: {field: number}): Promise<AtomFieldValue | null> {
    return AtomFieldValue.get(this.sql, this.atomId, field)
  }

  async count(): Promise<number> {
    const row = (
      await this.sql<Array<{count: number}>>`
        SELECT COUNT(*) AS count FROM atom_value WHERE atom = ${this.atomId}
      `
    )[0]
    return row?.count ?? 0
  }
}

/**
 * Корневые атомы — те, у которых нет ни atom-родителя, ни topology-родителя.
 */
export class AtomRoots {
  constructor(private readonly sql: SQL) {}

  async all(): Promise<Atom[]> {
    const rows = await this.sql<Array<{id: number}>>`
      SELECT id FROM atom
      WHERE parent_atom IS NULL AND parent_topology IS NULL
      ORDER BY position
    `
    return rows.map((row) => new Atom(this.sql, Number(row.id)))
  }

  async get({id}: {id: number}): Promise<Atom | null> {
    const row = (
      await this.sql<Array<{ok: number}>>`
        SELECT 1 AS ok FROM atom
        WHERE id = ${id} AND parent_atom IS NULL AND parent_topology IS NULL
        LIMIT 1
      `
    )[0]
    return row ? new Atom(this.sql, id) : null
  }

  async count(): Promise<number> {
    const row = (
      await this.sql<Array<{count: number}>>`
        SELECT COUNT(*) AS count FROM atom
        WHERE parent_atom IS NULL AND parent_topology IS NULL
      `
    )[0]
    return row?.count ?? 0
  }

  async exists(): Promise<boolean> {
    const row = (
      await this.sql<Array<{ok: number}>>`
        SELECT 1 AS ok FROM atom
        WHERE parent_atom IS NULL AND parent_topology IS NULL
        LIMIT 1
      `
    )[0]
    return row !== undefined
  }
}

export class Atom {
  readonly children: AtomChildren
  readonly values: AtomValues

  constructor(
    private readonly sql: SQL,
    readonly id: number,
  ) {
    this.children = new AtomChildren(sql, id)
    this.values = new AtomValues(sql, id)
  }

  /**
   * Записывает atom row + atom_value-связи + value-records + atom_state одной транзакцией.
   * Идемпотентно по `atom.id`: повторная запись делает DELETE+INSERT, оставляет orphan-value cleanup.
   */
  static async writeRows(sql: SQL, rows: AtomRows): Promise<number> {
    return await sql.begin(async (tx) => {
      const inputAtomId = rows.atom.id
      const collected = isStoredId(inputAtomId)
        ? await tx<Array<{value: number}>>`SELECT value FROM atom_value WHERE atom = ${inputAtomId}`
        : []
      const oldValueIds = collected.map((r) => r.value)
      if (isStoredId(inputAtomId)) await tx`DELETE FROM atom WHERE id = ${inputAtomId}`

      // position = next среди siblings по polymorphic parent
      const siblingCount = (
        await tx<Array<{count: number}>>`
          SELECT COUNT(*) AS count FROM atom
          WHERE parent_atom IS ${rows.atom.parentAtom}
            AND parent_topology IS ${rows.atom.parentTopology}
        `
      )[0]?.count ?? 0
      const position = Number(siblingCount)

      const atomId = isStoredId(inputAtomId)
        ? inputAtomId
        : (await tx<Array<{id: number}>>`
            INSERT INTO atom (parent_atom, parent_topology, wimp, position)
            VALUES (${rows.atom.parentAtom}, ${rows.atom.parentTopology}, ${rows.atom.wimp}, ${position})
            RETURNING id
          `)[0]?.id
      if (!atomId) throw new Error("Atom.writeRows: atom insert did not return id")

      if (isStoredId(inputAtomId)) {
        await tx`
          INSERT INTO atom (id, parent_atom, parent_topology, wimp, position)
          VALUES (${atomId}, ${rows.atom.parentAtom}, ${rows.atom.parentTopology},
                  ${rows.atom.wimp}, ${position})
        `
      }

      // value-записи: upsert корня + типизированная подтаблица
      const valueIdMap = new Map<number, number>()
      const resolveValueId = (id: number): number => {
        const mapped = valueIdMap.get(id)
        if (mapped !== undefined) return mapped
        if (isStoredId(id)) return id
        throw new Error(`Atom.writeRows: unresolved temporary value id ${id}`)
      }

      for (const v of rows.valueRecords) {
        const valueId = isStoredId(v.id)
          ? v.id
          : (await tx<Array<{id: number}>>`
              INSERT INTO value (kind) VALUES (${v.kind})
              RETURNING id
            `)[0]?.id
        if (!valueId) throw new Error("Atom.writeRows: value insert did not return id")
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

      // связи atom_value
      for (const av of rows.values) {
        await tx`INSERT INTO atom_value (atom, field, value) VALUES (${atomId}, ${av.field}, ${resolveValueId(av.value)})`
      }

      // metaState может быть NULL, если у meta нет superposition
      await tx`INSERT INTO atom_state (atom, metaState) VALUES (${atomId}, ${rows.state.metaState})`

      // подчистить orphan-value (которые после удаления атома больше никем не делятся)
      for (const valueId of oldValueIds) {
        await tx`
          DELETE FROM value WHERE id = ${valueId} AND NOT EXISTS (SELECT 1 FROM atom_value WHERE value = id)
        `
      }
      return atomId
    })
  }

  async wimp(): Promise<string> {
    const row = (
      await this.sql<Array<{wimp: string}>>`
        SELECT wimp FROM atom WHERE id = ${this.id} LIMIT 1
      `
    )[0]
    if (!row) throw new Error(`atom ${this.id} not found`)
    return String(row.wimp)
  }

  async position(): Promise<number> {
    const row = (
      await this.sql<Array<{position: number}>>`
        SELECT position FROM atom WHERE id = ${this.id} LIMIT 1
      `
    )[0]
    if (!row) throw new Error(`atom ${this.id} not found`)
    return Number(row.position)
  }

  /**
   * Возвращает `parentAtom`/`parentTopology` id. Если у атома есть родитель-atom —
   * вернётся `Atom`-ORM. Если родитель — topology-узел, нужно получать его через
   * `boundary.topology.get(parentTopology)` (избегаем cross-package import).
   */
  async parentRef(): Promise<{kind: "atom"; id: number} | {kind: "topology"; id: number} | null> {
    const row = (
      await this.sql<Array<{parent_atom: number | null; parent_topology: number | null}>>`
        SELECT parent_atom, parent_topology FROM atom WHERE id = ${this.id} LIMIT 1
      `
    )[0]
    if (!row) throw new Error(`atom ${this.id} not found`)
    if (row.parent_atom !== null && row.parent_atom !== undefined) {
      return {kind: "atom", id: Number(row.parent_atom)}
    }
    if (row.parent_topology !== null && row.parent_topology !== undefined) {
      return {kind: "topology", id: Number(row.parent_topology)}
    }
    return null
  }

  /** Удобный метод когда заведомо известно что родитель — другой atom (wimp под wimp). */
  async parent(): Promise<Atom | null> {
    const ref = await this.parentRef()
    return ref?.kind === "atom" ? new Atom(this.sql, ref.id) : null
  }

  async state(): Promise<AtomStateRecord | null> {
    const row = (
      await this.sql<Array<{atom: number; metaState: number | null}>>`
        SELECT atom, metaState FROM atom_state WHERE atom = ${this.id} LIMIT 1
      `
    )[0]
    if (!row) return null
    return {atom: Number(row.atom), metaState: row.metaState === null ? null : Number(row.metaState)}
  }

  async rows(): Promise<AtomRows> {
    const atomRow = (
      await this.sql<Array<Record<string, unknown>>>`
        SELECT id, parent_atom, parent_topology, wimp, position FROM atom WHERE id = ${this.id}
      `
    )[0]
    if (!atomRow) throw new Error(`atom ${this.id} not found`)

    const atomValueRows = await this.sql<Array<{atom: number; field: number; value: number}>>`
      SELECT atom, field, value FROM atom_value WHERE atom = ${this.id}
    `
    const values: AtomValueRecord[] = atomValueRows.map((row) => ({
      atom: Number(row.atom),
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
      await this.sql<Array<{atom: number; metaState: number | null}>>`
        SELECT atom, metaState FROM atom_state WHERE atom = ${this.id} LIMIT 1
      `
    )[0]
    if (!stateRow) throw new Error(`atom_state ${this.id} not found`)

    return {
      atom: decodeAtomRow(atomRow),
      values,
      valueRecords,
      valueItems,
      state: {
        atom: Number(stateRow.atom),
        metaState: stateRow.metaState === null ? null : Number(stateRow.metaState),
      },
    }
  }
}
