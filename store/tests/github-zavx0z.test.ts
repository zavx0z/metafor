import {beforeEach, describe, expect, test} from "bun:test"
import {mkdirSync, rmSync} from "node:fs"
import {join} from "node:path"
import {SQL} from "bun"
import {matter} from "../../dark/index.ts"
import {createProtocolChannel} from "../../protocol.ts"
import type {Store} from "../index.ts"
import {open} from "../server.ts"

const requiredRow = <T>(row: T | undefined, message: string): T => {
  if (row === undefined) throw new Error(message)
  return row
}

const tmpDir = join(import.meta.dir, "..", "tmp")
const sqliteFilename = join(tmpDir, "github-zavx0z-full-tree.sqlite")

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
    globalThis.store = store
    sql = new SQL(`sqlite://${sqliteFilename}`)
  })

  test("matter() пишет всё дерево zavx0z/git через patch-flow и публикует gravity-сообщения", async () => {
    const channel = createProtocolChannel()
    const messages: unknown[] = []
    const materializedWimps: string[] = []

    channel.onmessage = (event: MessageEvent<unknown>) => {
      messages.push(event.data)
    }

    try {
      await matter("zavx0z/git", {
        async onMaterializedStep(step) {
          if (step.kind !== "actor") return
          materializedWimps.push(step.particle.uuid)
        },
      })

      // dark больше не эмитит gravity-патчи в matter() — emitAdd удалён.
      // Микро-задержка чтобы убедиться что никаких сообщений не пришло.
      await new Promise((resolve) => setTimeout(resolve, 50))
    } finally {
      channel.close()
    }

    const metaRows = await sql<Array<{src: string}>>`
        SELECT src
        FROM wimp
        ORDER BY src
    `
    const actorRows = await sql<Array<{uuid: string; parent_actor: string | null; parent_topology: string | null; wimp: string}>>`
        SELECT uuid, parent_actor, parent_topology, wimp
        FROM actor
        ORDER BY position, uuid
    `
    const actorStateRows = await sql<Array<{actor: string; metaState: string | null}>>`
        SELECT actor, metaState
        FROM actor_state
        ORDER BY actor
    `

    expect(metaRows.map((row) => row.src)).toContain("zavx0z/git")
    expect(metaRows.map((row) => row.src)).toContain("zavx0z/git-start")
    expect(metaRows.map((row) => row.src)).toContain("zavx0z/git-history-commit")
    expect(metaRows.map((row) => row.src)).toContain("zavx0z/git-error")
    expect(actorRows.length).toBe(materializedWimps.length)
    expect(actorStateRows.length).toBe(actorRows.length)
    expect(actorRows.length).toBeGreaterThan(20)

    const roots = await store.actor.roots.all()
    expect(roots).toHaveLength(1)
    expect(await roots[0]!.wimp()).toBe("zavx0z/git")
    // Wimp-под-Wimp напрямую может не быть (всё дерево идёт через topology Fuzzy/Axion).
    // Проверяем через topology: у root должны быть дочерние topology-узлы.
    const rootTopology = await store.topology.childrenOfActor(roots[0]!.uuid)
    expect(rootTopology.length).toBeGreaterThan(0)

    const rootOperationField = requiredRow(
      (
        await sql<Array<{uuid: string}>>`
            SELECT uuid
            FROM field
            WHERE wimp = ${"zavx0z/git"}
              AND key = ${"operation"}
            LIMIT 1
        `
      )[0],
      "operation field not found",
    ).uuid
    const rootOperation = await (await roots[0]!.values.get({field: rootOperationField}))?.value()
    expect(rootOperation?.kind).toBe("null")

    const commitActor = actorRows.find((row) => row.wimp === "zavx0z/git-history-commit")
    if (!commitActor) throw new Error("zavx0z/git-history-commit actor was not materialized")
    const commit = (await store.actor.get(commitActor.uuid))!
    expect(await commit.values.count()).toBeGreaterThan(0)
    expect((await commit.state())?.metaState).not.toBeNull()

    // dark больше не эмитит gravity-патчи (emitAdd удалён).
    expect(messages).toEqual([])

    await sql.close()
    await store.close()
  })
})
