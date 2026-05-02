import {beforeEach, describe, expect, test} from "bun:test"
import {mkdirSync, rmSync} from "node:fs"
import {join} from "node:path"
import {SQL} from "bun"
import {matter} from "../../dark/index.ts"
import {loadMeta} from "../../dark/load.ts"
import {GRAVITY_BROADCAST_CHANNEL, isGravitonMessage, type GravitonMessage} from "@shared/protocol"
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
    const channel = new BroadcastChannel(GRAVITY_BROADCAST_CHANNEL)
    const messages: unknown[] = []
    const materializedWimps: string[] = []

    channel.onmessage = (event: MessageEvent<unknown>) => {
      messages.push(event.data)
    }

    try {
      const meta = await loadMeta("zavx0z/git")
      await matter(meta, {
        async onMaterializedStep(step) {
          if (step.kind !== "actor") return
          materializedWimps.push(step.particle.uuid)
        },
      })

      await waitForMessages(messages, materializedWimps.length + 1)
    } finally {
      channel.close()
    }

    const metaRows = await sql<Array<{src: string}>>`
        SELECT src
        FROM meta
        ORDER BY src
    `
    const actorRows = await sql<Array<{uuid: string; parent_actor: string | null; parent_topology: string | null; meta: string}>>`
        SELECT uuid, parent_actor, parent_topology, meta
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
    expect(await roots[0]!.meta()).toBe("zavx0z/git")
    // Wimp-под-Wimp напрямую может не быть (всё дерево идёт через topology Fuzzy/Axion).
    // Проверяем через topology: у root должны быть дочерние topology-узлы.
    const rootTopology = await store.topology.childrenOfActor(roots[0]!.uuid)
    expect(rootTopology.length).toBeGreaterThan(0)

    const rootOperationField = requiredRow(
      (
        await sql<Array<{uuid: string}>>`
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
      ...materializedWimps.map(
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

    await sql.close()
    await store.close()
  })
})
