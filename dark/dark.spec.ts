import {afterAll, beforeAll, describe, expect, test} from "bun:test"
import {SQL} from "bun"
import {mkdirSync, rmSync} from "node:fs"
import {join} from "node:path"
import type {Actor} from "@boundary/actor"
import type {Boundary} from "boundary"
import {open} from "boundary/sqlite"
import {matter} from "./dark.ts"

const src = "zavx0z/git"

describe("matter(zavx0z/git) → boundary", () => {
  let boundary: Awaited<ReturnType<typeof open>>
  let sql: SQL
  let root: Actor
  let tmpFile: string

  beforeAll(async () => {
    const tmpDir = join(import.meta.dir, "tmp")
    mkdirSync(tmpDir, {recursive: true})
    tmpFile = join(tmpDir, `dark-spec-${crypto.randomUUID()}.sqlite`)
    boundary = await open(tmpFile)
    globalThis.boundary = boundary
    sql = new SQL(`sqlite://${tmpFile}`)
    await matter(src)
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

  test("root actor создан, привязан к wimp zavx0z/git", async () => {
    expect(root.id).toBeDefined()
    expect(await root.wimp()).toBe(src)
    expect(await root.position()).toBe(0)
    const ref = await root.parentRef()
    expect(ref).toBeNull()
  })

  test("у root есть topology-узлы Fuzzy и Axion (первый слой git)", async () => {
    const topology = await boundary.topology.childrenOfActor(root.id)
    const kinds = topology.map((t) => t.kind).sort()
    expect(kinds).toEqual(["axion", "fuzzy"])
  })

  test("Fuzzy раскрыт на статические Wimp-ветви соответствующие values enum operation", async () => {
    const topology = await boundary.topology.childrenOfActor(root.id)
    const fuzzy = topology.find((t) => t.kind === "fuzzy")
    if (!fuzzy) throw new Error("fuzzy missing")
    const branches = await boundary
      .actor.head(root.id) // sanity
      .then(() =>
        boundary.wimp
          .get(src)
          .then((w) => w!.fields.get({key: "operation"}))
          .then((field) =>
            field && field.type === "enum"
              ? field.variants.all().then((variants) => variants.map((v) => v.value))
              : Promise.resolve([] as string[]),
          ),
      )
    expect(branches.length).toBeGreaterThan(0)

    const wimpRows = await sql<Array<{src: string}>>`
      SELECT wimp AS src FROM actor
      WHERE parent_topology = ${fuzzy.id}
      ORDER BY position
    `
    const expectedBranchSrcs = branches.map((value) => `${src}-${value}`)
    expect(wimpRows.map((r) => r.src).sort()).toEqual(expectedBranchSrcs.sort())
  })

  test("под Axion ровно один child wimp — zavx0z/git-error", async () => {
    const topology = await boundary.topology.childrenOfActor(root.id)
    const axion = topology.find((t) => t.kind === "axion")
    if (!axion) throw new Error("axion missing")
    const wimps = await sql<Array<{wimp: string}>>`
      SELECT wimp FROM actor WHERE parent_topology = ${axion.id}
    `
    expect(wimps.length).toBe(1)
    expect(wimps[0]!.wimp).toBe(`${src}-error`)
  })

  test("entanglement: поле args дочернего git-start должно share value.id с args корневого git", async () => {
    // Под fuzzy → wimp git-start. У wimp git-start есть поле args (мapping от parent).
    // root.args значение null (default), и git-start.args тоже null — но через shared value.id.
    const topology = await boundary.topology.childrenOfActor(root.id)
    const fuzzy = topology.find((t) => t.kind === "fuzzy")!
    const startRow = (
      await sql<Array<{id: number}>>`
        SELECT id FROM actor
        WHERE parent_topology = ${fuzzy.id} AND wimp = ${src + "-start"}
      `
    )[0]
    if (!startRow) throw new Error("git-start actor not found")

    const rootArgsField = (
      await sql<Array<{id: number}>>`
        SELECT id FROM field WHERE wimp = ${src} AND key = ${"args"} LIMIT 1
      `
    )[0]?.id
    const startArgsField = (
      await sql<Array<{id: number}>>`
        SELECT id FROM field WHERE wimp = ${src + "-start"} AND key = ${"args"} LIMIT 1
      `
    )[0]?.id
    expect(rootArgsField).toBeDefined()
    expect(startArgsField).toBeDefined()

    const rootLink = await boundary.actor.link.get(root.id, rootArgsField!)
    const startLink = await boundary.actor.link.get(startRow.id, startArgsField!)
    const rootValue = await rootLink!.value()
    const startValue = await startLink!.value()
    // entanglement через shared value.id
    expect(startValue.id).toBe(rootValue.id)
  })
})
