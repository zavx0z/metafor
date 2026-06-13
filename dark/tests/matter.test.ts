import {afterAll, beforeAll, describe, expect, test} from "bun:test"
import {SQL} from "bun"
import {mkdirSync, rmSync} from "node:fs"
import {join} from "node:path"
import type {Actor} from "@store/actor"
import type {Store} from "../../store/index.ts"
import {open} from "../../store/sqlite.ts"
import {matter} from "../index.ts"

let store: Awaited<ReturnType<typeof open>>
let sql: SQL
let root: Actor
let tmpFile: string

describe("matter() — runtime tree через store", () => {
  beforeAll(async () => {
    const tmpDir = join(import.meta.dir, "tmp")
    mkdirSync(tmpDir, {recursive: true})
    tmpFile = join(tmpDir, `matter-${crypto.randomUUID()}.sqlite`)
    store = await open(tmpFile)
    globalThis.store = store
    sql = new SQL(`sqlite://${tmpFile}`)
    await matter("zavx0z/git")
    const roots = await store.actor.roots.all()
    if (roots.length === 0) throw new Error("root actor not created")
    root = roots[0]!
  })
  afterAll(async () => {
    await sql.close()
    await store.close()
    rmSync(tmpFile, {force: true})
    rmSync(`${tmpFile}-shm`, {force: true})
    rmSync(`${tmpFile}-wal`, {force: true})
  })

  describe("particle counts через ORM/SQL", () => {
    test("акторы созданы (>20)", async () => {
      const rows = await sql<Array<{n: number}>>`SELECT COUNT(*) AS n FROM actor`
      expect(rows[0]!.n).toBeGreaterThan(20)
    })

    test("Fuzzy-узлы присутствуют", async () => {
      const rows = await sql<Array<{n: number}>>`SELECT COUNT(*) AS n FROM topology WHERE kind = 'fuzzy'`
      expect(rows[0]!.n).toBeGreaterThan(0)
    })

    test("Axion-узлы присутствуют", async () => {
      const rows = await sql<Array<{n: number}>>`SELECT COUNT(*) AS n FROM topology WHERE kind = 'axion'`
      expect(rows[0]!.n).toBeGreaterThan(0)
    })

    test("Macho-узлов нет", async () => {
      const rows = await sql<Array<{n: number}>>`SELECT COUNT(*) AS n FROM topology WHERE kind = 'macho'`
      expect(rows[0]!.n).toBe(0)
    })
  })

  describe("декларация в store", () => {
    test("каждая meta из дерева — единственная запись в store.meta", async () => {
      const distinctSrcs = (
        await sql<Array<{wimp: string}>>`SELECT DISTINCT wimp FROM actor`
      ).map((r) => r.wimp)
      for (const src of distinctSrcs) {
        const meta = await store.wimp.get(src)
        expect(meta, `meta для "${src}" должна существовать в store`).not.toBeNull()
      }
    })
  })

  describe("родители", () => {
    test("корневой actor не имеет parent (parent_actor IS NULL AND parent_topology IS NULL)", async () => {
      const rows = await sql<Array<{uuid: string; wimp: string}>>`
        SELECT uuid, wimp FROM actor WHERE parent_actor IS NULL AND parent_topology IS NULL
      `
      expect(rows.length).toBe(1)
      expect(rows[0]!.wimp).toBe("zavx0z/git")
      expect(rows[0]!.uuid).toBe(root.uuid)
    })

    test("каждый non-root actor ссылается либо на actor либо на topology в качестве parent", async () => {
      const rows = await sql<Array<{uuid: string; parent_actor: string | null; parent_topology: string | null}>>`
        SELECT uuid, parent_actor, parent_topology FROM actor WHERE NOT (parent_actor IS NULL AND parent_topology IS NULL)
      `
      for (const row of rows) {
        const oneSet = (row.parent_actor !== null) !== (row.parent_topology !== null)
        expect(oneSet, `actor ${row.uuid} должен иметь ровно один из parent_actor/parent_topology`).toBe(true)
      }
    })
  })
})
