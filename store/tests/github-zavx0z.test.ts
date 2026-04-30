import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import { mkdirSync, rmSync } from "node:fs"
import { join } from "node:path"
import { SQL } from "bun"
import { matter } from "../../dark/index.ts"
import { readMetaDsl } from "../../dark/load.ts"
import { resetDarkLoadContext } from "../../dark/tests/test.helper.ts"
import { dark$ } from "../../dark/store.ts"
import { Wimp } from "../../dark/strong/index.ts"
import type { InstanceField } from "../../dark/strong/Field.ts"
import type { ActorRows, ValueRecord } from "@store/actor"
import type { Store } from "../index.ts"
import { open } from "../server.ts"

type FieldRow = {
  uuid: string
  key: string
  type: "string" | "number" | "boolean" | "array" | "enum"
}

const tmpDir = join(import.meta.dir, "..", "tmp")
const sqliteFilename = join(tmpDir, "github-zavx0z-full-tree.sqlite")

const requiredRow = <T>(row: T | undefined, message: string): T => {
  if (row === undefined) throw new Error(message)
  return row
}

const readInitialState = async (sql: SQL, src: string): Promise<string | null> =>
  (
    await sql<Array<{ uuid: string }>>`
      SELECT uuid FROM superposition WHERE meta = ${src} ORDER BY position LIMIT 1
    `
  )[0]?.uuid ?? null

const readEnumVariant = async (sql: SQL, field: string, value: string): Promise<string> =>
  requiredRow(
    (
      await sql<Array<{ uuid: string }>>`
        SELECT uuid FROM field_enum_variant WHERE field = ${field} AND item_value = ${value} LIMIT 1
      `
    )[0],
    `enum variant ${value} not found for field ${field}`,
  ).uuid

const buildValueRecord = async (
  sql: SQL,
  actor: string,
  field: FieldRow,
  instanceField: InstanceField | undefined,
): Promise<{ link: ActorRows["values"][number]; record: ValueRecord; items: ActorRows["valueItems"] }> => {
  const uuid = `${actor}:${field.key}`
  const link = { actor, field: field.uuid, value: uuid }
  const value = instanceField?.value

  if (value === null || value === undefined) return { link, record: { uuid, kind: "null" }, items: [] }

  switch (field.type) {
    case "boolean":
      return { link, record: { uuid, kind: "boolean", boolean: Boolean(value) }, items: [] }
    case "number":
      return { link, record: { uuid, kind: "number", number: Number(value) }, items: [] }
    case "string":
      return { link, record: { uuid, kind: "string", text: String(value) }, items: [] }
    case "enum":
      return { link, record: { uuid, kind: "enum", variant: await readEnumVariant(sql, field.uuid, String(value)) }, items: [] }
    case "array":
      return {
        link,
        record: { uuid, kind: "list" },
        items: Array.isArray(value)
          ? value.map((item, position) => ({ value: uuid, position, itemValue: String(item) }))
          : [],
      }
  }
}

const findParentWimp = (wimp: Wimp): Wimp | null => {
  let parent = wimp.parent
  while (parent) {
    if (parent instanceof Wimp) return parent
    parent = parent.parent
  }
  return null
}

const saveMetaOnce = async (store: Store, loadedMeta: Set<string>, src: string): Promise<void> => {
  if (loadedMeta.has(src)) return
  await store.meta.create(src, await readMetaDsl(src))
  loadedMeta.add(src)
}

const saveWimpActor = async (
  store: Store,
  sql: SQL,
  wimp: Wimp,
  positionByParent: Map<string, number>,
): Promise<void> => {
  if (!wimp.fields) throw new Error(`Wimp ${wimp.id} fields are not materialized`)

  const parent = findParentWimp(wimp)
  const parentKey = parent?.id ?? "root"
  const position = positionByParent.get(parentKey) ?? 0
  positionByParent.set(parentKey, position + 1)

  const fields = await sql<FieldRow[]>`
    SELECT uuid, key, type FROM field WHERE meta = ${wimp.src} ORDER BY rowid
  `
  const values = await Promise.all(fields.map((field) => buildValueRecord(sql, wimp.id, field, wimp.fields?.[field.key])))

  await store.actor.create({
    actor: { uuid: wimp.id, parent: parent?.id ?? null, meta: wimp.src, position },
    values: values.map((value) => value.link),
    valueRecords: values.map((value) => value.record),
    valueItems: values.flatMap((value) => value.items),
    state: { actor: wimp.id, metaState: await readInitialState(sql, wimp.src) },
  })
}

describe("store/tests github/zavx0z startup load", () => {
  let store: Store
  let sql: SQL

  beforeEach(async () => {
    mkdirSync(tmpDir, { recursive: true })
    rmSync(sqliteFilename, { force: true })
    rmSync(`${sqliteFilename}-shm`, { force: true })
    rmSync(`${sqliteFilename}-wal`, { force: true })
    store = await open(sqliteFilename)
    sql = new SQL(`sqlite://${sqliteFilename}`)
  })

  afterAll(() => {
    dark$.meta.clear()
    dark$.fields.clear()
    dark$.particles.clear()
    resetDarkLoadContext()
  })

  test("загружает всё дерево zavx0z/git в store meta и actor как при запуске приложения", async () => {
    const loadedMeta = new Set<string>()
    const materializedWimps = new Map<string, string>()
    const positionByParent = new Map<string, number>()
    const consoleLog = console.log

    try {
      console.log = () => {}
      await matter(new Wimp({ src: "zavx0z/git", parent: null }), undefined, {
        async onMaterializedStep(step) {
          if (step.kind !== "root") return
          await saveMetaOnce(store, loadedMeta, step.wimp.src)
          await saveWimpActor(store, sql, step.wimp, positionByParent)
          materializedWimps.set(step.wimp.id, step.wimp.src)
        },
      })
    } finally {
      console.log = consoleLog
    }

    const metaRows = await sql<Array<{ src: string }>>`
      SELECT src FROM meta ORDER BY src
    `
    const actorRows = await sql<Array<{ uuid: string; parent: string | null; meta: string }>>`
      SELECT uuid, parent, meta FROM actor ORDER BY position, uuid
    `
    const actorStateRows = await sql<Array<{ actor: string; metaState: string | null }>>`
      SELECT actor, metaState FROM actor_state ORDER BY actor
    `

    expect(metaRows.map((row) => row.src)).toContain("zavx0z/git")
    expect(metaRows.map((row) => row.src)).toContain("zavx0z/git-start")
    expect(metaRows.map((row) => row.src)).toContain("zavx0z/git-history-commit")
    expect(metaRows.map((row) => row.src)).toContain("zavx0z/git-error")
    expect(metaRows.length).toBe(loadedMeta.size)
    expect(actorRows.length).toBe(materializedWimps.size)
    expect(actorStateRows.length).toBe(actorRows.length)
    expect(actorRows.length).toBeGreaterThan(20)

    const roots = await store.actor.roots.all()
    expect(roots).toHaveLength(1)
    expect(await roots[0]!.meta()).toBe("zavx0z/git")
    expect(await roots[0]!.children.count()).toBeGreaterThan(0)

    const rootOperationField = requiredRow(
      (
        await sql<Array<{ uuid: string }>>`
          SELECT uuid FROM field WHERE meta = ${"zavx0z/git"} AND key = ${"operation"} LIMIT 1
        `
      )[0],
      "operation field not found",
    ).uuid
    const rootOperation = await (await roots[0]!.values.get({ field: rootOperationField }))?.value()
    expect(rootOperation?.kind).toBe("null")

    const commitActor = actorRows.find((row) => row.meta === "zavx0z/git-history-commit")
    if (!commitActor) throw new Error("zavx0z/git-history-commit actor was not materialized")
    const commit = (await store.actor.get(commitActor.uuid))!
    expect(await commit.values.count()).toBeGreaterThan(0)
    expect((await commit.state())?.metaState).not.toBeNull()

    await sql.close()
    await store.close()
  })
})
