import {afterAll, beforeAll, describe, expect, test} from "bun:test"
import {mkdirSync, rmSync} from "node:fs"
import {join} from "node:path"
import {SQL} from "bun"
import type {ForceMessage} from "@metafor/types/force/message"
import {createForceTestFixture, type ForceTestFixture} from "force/fixture"
import {open, type BoundaryDatabase} from "./sqlite.ts"

const ROOT = "zavx0z/linux"

describe("Dark -> Inflaton -> Boundary", () => {
  let fixture: ForceTestFixture
  let boundary: BoundaryDatabase
  let sql: SQL
  let filename: string
  let declaration: ForceMessage

  beforeAll(async () => {
    fixture = createForceTestFixture()
    await import(`../dark/dark.ts?boundary-integration=${crypto.randomUUID()}`)
    const dark = await fixture.waitForClient("dark", 5_000)
    const fromIndex = fixture.messages.length
    fixture.impulse(dark, {
      parts: [{part: "inflaton", op: "test", path: ROOT}],
    })
    declaration = (await fixture.waitForMessage(
      ({domain, message}) => (
        domain === "dark" &&
        message.parts[0]?.path === ROOT &&
        message.parts.some((part) => part.path === "zavx0z/codex")
      ),
      fromIndex,
      30_000,
    )).message

    mkdirSync(join(import.meta.dir, "tmp"), {recursive: true})
    filename = join(import.meta.dir, "tmp", `dark-boundary-${crypto.randomUUID()}.sqlite`)
    boundary = await open(filename)
    sql = new SQL(`sqlite://${filename}`)
  })

  afterAll(async () => {
    fixture.close()
    await sql.close()
    await boundary.close()
    rmSync(filename, {force: true})
    rmSync(`${filename}-shm`, {force: true})
    rmSync(`${filename}-wal`, {force: true})
  })

  test("materializes the real root-first Dark declaration stream", async () => {
    const commit = await boundary.materialize(declaration)
    if (!commit) throw new Error("Boundary did not accept the Dark declaration")

    expect(commit.rootSrc).toBe(ROOT)
    expect(
      await sql<Array<{src: string}>>`
        SELECT src FROM wimp WHERE src IN (${ROOT}, ${"zavx0z/codex"}) ORDER BY src
      `,
    ).toEqual([{src: "zavx0z/codex"}, {src: ROOT}])

    const actors = await sql<Array<{id: number; wimp: string}>>`
      SELECT id, wimp FROM actor ORDER BY id
    `
    expect(actors.map(({wimp}) => wimp)).toEqual([ROOT, "zavx0z/codex"])
    expect(commit.graviton.parts.filter((part) => (
      part.part === "graviton" && part.op === "add" && part.path === "actor"
    ))).toHaveLength(2)
    expect(commit.matrix.runtime.actorIdByBraneIndex).toEqual(actors.map(({id}) => id))
    expect(commit.energy.actors).toEqual(actors.map(({id, wimp}) => [id, wimp]))
  })
})
