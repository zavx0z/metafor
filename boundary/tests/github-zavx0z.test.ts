import {beforeEach, describe, expect, test} from "bun:test"
import {mkdirSync, rmSync} from "node:fs"
import {join} from "node:path"
import {SQL} from "bun"
import {matter} from "../../dark/index.ts"
import type {Particle, Boundary} from "../index.ts"
import {open} from "../sqlite.ts"

const requiredRow = <T>(row: T | undefined, message: string): T => {
  if (row === undefined) throw new Error(message)
  return row
}

const tmpDir = join(import.meta.dir, "..", "tmp")
const sqliteFilename = join(tmpDir, "github-zavx0z-full-tree.sqlite")

const waitForParts = async (predicate: () => boolean): Promise<void> => {
  const deadline = Date.now() + 1000

  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error("Expected gravity parts")
    }
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

const particleId = (part: Particle): unknown => {
  if (typeof part.value !== "object" || part.value === null || Array.isArray(part.value)) return part.value
  const value = part.value as {id?: unknown; actor?: {id?: unknown}}
  return value.actor?.id ?? value.id
}

describe("boundary/tests github/zavx0z startup load", () => {
  let boundary: Boundary
  let sql: SQL

  beforeEach(async () => {
    mkdirSync(tmpDir, {recursive: true})
    rmSync(sqliteFilename, {force: true})
    rmSync(`${sqliteFilename}-shm`, {force: true})
    rmSync(`${sqliteFilename}-wal`, {force: true})
    boundary = await open(sqliteFilename)
    globalThis.boundary = boundary
    sql = new SQL(`sqlite://${sqliteFilename}`)
  })

  test("matter() пишет всё дерево zavx0z/git через force-flow и публикует gravity-сообщения", async () => {
    const parts: Particle[] = []
    const subscription = boundary.observe((event) => {
      parts.push(...event.data.parts)
    })

    try {
      await matter("zavx0z/git")

      const metaRows = await sql<Array<{src: string}>>`
        SELECT src
        FROM wimp
        ORDER BY src
    `
      const actorRows = await sql<Array<{id: number; parent_actor: number | null; parent_topology: number | null; wimp: string}>>`
        SELECT id, parent_actor, parent_topology, wimp
        FROM actor
        ORDER BY position, id
    `
      const actorStateRows = await sql<Array<{actor: number; metaState: number | null}>>`
        SELECT actor, metaState
        FROM actor_state
        ORDER BY actor
      `
      const runtime = await boundary.energyRuntime()
      const bulkRuntime = await boundary.bulkRuntime()
      const topologyRows = await sql<Array<{id: number; kind: string}>>`
        SELECT id, kind
        FROM topology
        ORDER BY position, id
    `

      await waitForParts(() => {
        return parts.filter((part) => part.part === "graviton" && part.op === "add" && part.path === "actor").length
          >= actorRows.length
      })

      expect(metaRows.map((row) => row.src)).toContain("zavx0z/git")
      expect(metaRows.map((row) => row.src)).toContain("zavx0z/git-start")
      expect(metaRows.map((row) => row.src)).toContain("zavx0z/git-history-commit")
      expect(metaRows.map((row) => row.src)).toContain("zavx0z/git-error")
      expect(actorStateRows.length).toBe(actorRows.length)
      expect(actorRows.length).toBeGreaterThan(20)
      expect(runtime.version).toBe(1)
      expect(runtime.wimpIds).toHaveLength(actorRows.length)
      expect(runtime.legacyProcessActorIds).toHaveLength(actorRows.length)
      expect(runtime.runtime.actorIdByBraneIndex).toHaveLength(actorRows.length)
      expect(runtime.runtime.braneIndexByActorId).toHaveLength(actorRows.length)
      expect(runtime.runtime.wimpSrcByActorId).toHaveLength(actorRows.length)
      expect(runtime.runtime.actorIdsByWimpSrc.length).toBeGreaterThan(0)
      expect(runtime.data.branes).toHaveLength(actorRows.length)
      expect(runtime.data.fields.length).toBeGreaterThan(0)
      expect(runtime.strong.runtimeFieldIndexByWimpFieldId.length).toBe(runtime.data.fields.length)
      expect(runtime.runtime.runtimeFieldIndexByActorFieldId.length).toBe(runtime.data.fields.length)
      expect(runtime.weak.stateMetaStateIdsByBraneIndex).toHaveLength(actorRows.length)
      expect(bulkRuntime.version).toBe(1)
      expect(bulkRuntime.actors).toHaveLength(actorRows.length)
      expect(bulkRuntime.topologies).toHaveLength(topologyRows.length)
      expect(bulkRuntime.fields.length).toBeGreaterThan(0)
      expect(bulkRuntime.values.length).toBeGreaterThan(0)
      expect(bulkRuntime.matterParticles.length).toBeGreaterThan(0)

      const roots = await boundary.actor.roots.all()
      expect(roots).toHaveLength(1)
      expect(await roots[0]!.wimp()).toBe("zavx0z/git")
      // Wimp-под-Wimp напрямую может не быть (всё дерево идёт через topology Fuzzy/Axion).
      // Проверяем через topology: у root должны быть дочерние topology-узлы.
      const rootTopology = await boundary.topology.childrenOfActor(roots[0]!.id)
      expect(rootTopology.length).toBeGreaterThan(0)

      const rootOperationField = requiredRow(
        (
          await sql<Array<{id: number}>>`
            SELECT id
            FROM field
            WHERE wimp = ${"zavx0z/git"}
              AND key = ${"operation"}
            LIMIT 1
        `
        )[0],
        "operation field not found",
      ).id
      const rootOperation = await (await roots[0]!.values.get({field: rootOperationField}))?.value()
      expect(rootOperation?.kind).toBe("null")

      const commitActor = actorRows.find((row) => row.wimp === "zavx0z/git-history-commit")
      if (!commitActor) throw new Error("zavx0z/git-history-commit actor was not materialized")
      const commit = (await boundary.actor.get(commitActor.id))!
      expect(await commit.values.count()).toBeGreaterThan(0)
      expect((await commit.state())?.metaState).not.toBeNull()

      const actorParts = parts.filter((part) => part.part === "graviton" && part.op === "add" && part.path === "actor")
      const topologyParts = parts.filter((part) =>
        part.part === "graviton" && part.op === "add" && (part.path === "fuzzy" || part.path === "axion" || part.path === "macho")
      )
      expect(actorParts.map(particleId).sort()).toEqual(actorRows.map((row) => row.id).sort())
      expect(topologyParts.map(particleId).sort()).toEqual(topologyRows.map((row) => row.id).sort())
    } finally {
      subscription.close()
      await sql.close()
      await boundary.close()
    }
  })
})
