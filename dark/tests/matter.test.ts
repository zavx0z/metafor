import {afterAll, beforeAll, describe, expect, test} from "bun:test"
import {SQL} from "bun"
import {mkdirSync, rmSync} from "node:fs"
import {join} from "node:path"
import type {Actor} from "@boundary/actor"
import type { Boundary } from "@metafor/types/boundary/api"
import {open} from "boundary/sqlite"
import {matter} from "../dark.ts"

let boundary: Awaited<ReturnType<typeof open>>
let sql: SQL
let root: Actor
let tmpFile: string

describe("matter() — runtime tree через boundary", () => {
  beforeAll(async () => {
    const tmpDir = join(import.meta.dir, "tmp")
    mkdirSync(tmpDir, {recursive: true})
    tmpFile = join(tmpDir, `matter-${crypto.randomUUID()}.sqlite`)
    boundary = await open(tmpFile)
    globalThis.boundary = boundary
    sql = new SQL(`sqlite://${tmpFile}`)
    await matter("zavx0z/git")
    const roots = await boundary.actor.roots.all()
    if (roots.length === 0) throw new Error("root actor not created")
    root = roots[0]!
  })
  afterAll(async () => {
    await sql.close()
    await boundary.close()
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

  describe("декларация в boundary", () => {
    test("каждая meta из дерева — единственная запись в boundary.meta", async () => {
      const distinctSrcs = (
        await sql<Array<{wimp: string}>>`SELECT DISTINCT wimp FROM actor`
      ).map((r) => r.wimp)
      for (const src of distinctSrcs) {
        const meta = await boundary.wimp.get(src)
        expect(meta, `meta для "${src}" должна существовать в boundary`).not.toBeNull()
      }
    })
  })

  describe("родители", () => {
    test("корневой actor не имеет parent (parent_actor IS NULL AND parent_topology IS NULL)", async () => {
      const rows = await sql<Array<{id: number; wimp: string}>>`
        SELECT id, wimp FROM actor WHERE parent_actor IS NULL AND parent_topology IS NULL
      `
      expect(rows.length).toBe(1)
      expect(rows[0]!.wimp).toBe("zavx0z/git")
      expect(rows[0]!.id).toBe(root.id)
    })

    test("каждый non-root actor ссылается либо на actor либо на topology в качестве parent", async () => {
      const rows = await sql<Array<{id: number; parent_actor: number | null; parent_topology: number | null}>>`
        SELECT id, parent_actor, parent_topology FROM actor WHERE NOT (parent_actor IS NULL AND parent_topology IS NULL)
      `
      for (const row of rows) {
        const oneSet = (row.parent_actor !== null) !== (row.parent_topology !== null)
        expect(oneSet, `actor ${row.id} должен иметь ровно один из parent_actor/parent_topology`).toBe(true)
      }
    })
  })
})
