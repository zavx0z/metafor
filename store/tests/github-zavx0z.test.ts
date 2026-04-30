import {afterAll, beforeEach, describe, expect, test} from "bun:test"
import {mkdirSync, rmSync} from "node:fs"
import {join} from "node:path"
import {SQL} from "bun"
import {matter} from "../../dark/index.ts"
import {readMetaDsl} from "../../dark/load.ts"
import {projectTemplateMatterRelations} from "../../dark/matter.ts"
import {resetDarkLoadContext} from "../../dark/tests/test.helper.ts"
import {dark$} from "../../dark/store.ts"
import {Wimp} from "../../dark/strong/index.ts"
import type {InstanceField} from "../../dark/strong/Field.ts"
import type {ActorRows, ValueRecord} from "@store/actor"
import {GRAVITY_BROADCAST_CHANNEL, isGravitonMessage, type GravitonMessage} from "@shared/protocol"
import type {Store} from "../index.ts"
import {open} from "../server.ts"

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
        SELECT uuid
        FROM superposition
        WHERE meta = ${src}
        ORDER BY position
        LIMIT 1
    `
  )[0]?.uuid ?? null

const readEnumVariant = async (sql: SQL, field: string, value: string): Promise<string> =>
  requiredRow(
    (
      await sql<Array<{ uuid: string }>>`
          SELECT uuid
          FROM field_enum_variant
          WHERE field = ${field}
            AND item_value = ${value}
          LIMIT 1
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
  const link = {actor, field: field.uuid, value: uuid}
  const value = instanceField?.value

  if (value === null || value === undefined) return {link, record: {uuid, kind: "null"}, items: []}

  switch (field.type) {
    case "boolean":
      return {link, record: {uuid, kind: "boolean", boolean: Boolean(value)}, items: []}
    case "number":
      return {link, record: {uuid, kind: "number", number: Number(value)}, items: []}
    case "string":
      return {link, record: {uuid, kind: "string", text: String(value)}, items: []}
    case "enum":
      return {
        link,
        record: {uuid, kind: "enum", variant: await readEnumVariant(sql, field.uuid, String(value))},
        items: []
      }
    case "array":
      return {
        link,
        record: {uuid, kind: "list"},
        items: Array.isArray(value)
          ? value.map((item, position) => ({value: uuid, position, itemValue: String(item)}))
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
  const dsl = await readMetaDsl(src)
  await store.meta.create(src, dsl, projectTemplateMatterRelations(dsl))
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
      SELECT uuid, key, type
      FROM field
      WHERE meta = ${wimp.src}
      ORDER BY rowid
  `
  const values = await Promise.all(fields.map((field) => buildValueRecord(sql, wimp.id, field, wimp.fields?.[field.key])))

  await store.actor.create({
    actor: {uuid: wimp.id, parent: parent?.id ?? null, meta: wimp.src, position},
    values: values.map((value) => value.link),
    valueRecords: values.map((value) => value.record),
    valueItems: values.flatMap((value) => value.items),
    state: {actor: wimp.id, metaState: await readInitialState(sql, wimp.src)},
  })
}

const waitForMessages = async (messages: unknown[], count: number): Promise<void> => {
  const deadline = Date.now() + 1000

  while (messages.length < count) {
    if (Date.now() > deadline) {
      throw new Error(`Expected ${count} gravity messages, received ${messages.length}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

describe("store/tests github/zavx0z startup load", () => {
  let store: Store
  let sql: SQL

  beforeEach(async () => {
    mkdirSync(tmpDir, {recursive: true})
    rmSync(sqliteFilename, {force: true})
    rmSync(`${sqliteFilename}-shm`, {force: true})
    rmSync(`${sqliteFilename}-wal`, {force: true})
    store = await open(sqliteFilename)
    sql = new SQL(`sqlite://${sqliteFilename}`)
  })

  afterAll(() => {
    dark$.meta.clear()
    dark$.fields.clear()
    dark$.particles.clear()
    resetDarkLoadContext()
  })

  test("загружает всё дерево zavx0z/git и публикует gravity-сообщения как при запуске приложения", async () => {
    const channel = new BroadcastChannel(GRAVITY_BROADCAST_CHANNEL)
    const messages: unknown[] = []
    const loadedMeta = new Set<string>()
    const materializedWimps = new Map<string, string>()
    const positionByParent = new Map<string, number>()
    const consoleLog = console.log

    channel.onmessage = (event: MessageEvent<unknown>) => {
      messages.push(event.data)
    }

    try {
      console.log = () => {
      }
      await matter(new Wimp({src: "zavx0z/git", parent: null}), undefined, {
        dbWriter: {
          saveMetaBundle: async () => {
          },
          saveWimpBundle: async () => {
          },
        } as never,
        async onMaterializedStep(step) {
          if (step.kind !== "root") return
          await saveMetaOnce(store, loadedMeta, step.wimp.src)
          await saveWimpActor(store, sql, step.wimp, positionByParent)
          materializedWimps.set(step.wimp.id, step.wimp.src)
        },
      })

      await waitForMessages(messages, materializedWimps.size + 1)
    } finally {
      console.log = consoleLog
      channel.close()
    }

    const metaRows = await sql<Array<{ src: string }>>`
        SELECT src
        FROM meta
        ORDER BY src
    `
    const actorRows = await sql<Array<{ uuid: string; parent: string | null; meta: string }>>`
        SELECT uuid, parent, meta
        FROM actor
        ORDER BY position, uuid
    `
    const actorStateRows = await sql<Array<{ actor: string; metaState: string | null }>>`
        SELECT actor, metaState
        FROM actor_state
        ORDER BY actor
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
            SELECT uuid
            FROM field
            WHERE meta = ${"zavx0z/git"}
              AND key = ${"operation"}
            LIMIT 1
        `
      )[0],
      "operation field not found",
    ).uuid
    const rootOperation = await (await roots[0]!.values.get({field: rootOperationField}))?.value()
    expect(rootOperation?.kind).toBe("null")

    const commitActor = actorRows.find((row) => row.meta === "zavx0z/git-history-commit")
    if (!commitActor) throw new Error("zavx0z/git-history-commit actor was not materialized")
    const commit = (await store.actor.get(commitActor.uuid))!
    expect(await commit.values.count()).toBeGreaterThan(0)
    expect((await commit.state())?.metaState).not.toBeNull()

    expect(messages.every(isGravitonMessage)).toBe(true)
    const gravitonMessages = messages as GravitonMessage[]
    const expectedMessages: GravitonMessage[] = [
      ...[...materializedWimps.keys()].map(
        (wimpId): GravitonMessage => ({
          channel: "gravity",
          boson: "graviton",
          source: "dark",
          patches: [{op: "add", path: `/wimp/${wimpId}`}],
        }),
      ),
      {
        channel: "gravity",
        boson: "graviton",
        source: "dark",
        patches: [{op: "test", path: "", value: null}],
      },
    ]

    expect(
      gravitonMessages.map((message) => ({
        channel: message.channel,
        boson: message.boson,
        source: message.source,
        patches: message.patches,
      })),
    ).toEqual(expectedMessages)
    console.log(messages)
    await sql.close()
    await store.close()
  })
})
