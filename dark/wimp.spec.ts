import {afterEach, beforeEach, describe, expect, test} from "bun:test"
import {SQL} from "bun"
import type {Boundary} from "boundary"
import {open} from "boundary/sqlite"
import {matter} from "./index.ts"
import {loadMeta} from "./load.ts"

describe("wimp normalization", () => {
  let boundary: Awaited<ReturnType<typeof open>>
  let sql: SQL

  beforeEach(async () => {
    boundary = await open(":memory:")
    globalThis.boundary = boundary
    sql = new SQL("sqlite::memory:")
  })

  afterEach(async () => {
    await sql.close()
    await boundary.close()
  })

  test("повторная materialization одинакового src НЕ дублирует декларацию в boundary", async () => {
    await matter("zavx0z/git")

    const firstWimp = await boundary.wimp.get("zavx0z/git")
    expect(firstWimp).not.toBeNull()
    const firstField = await firstWimp!.fields.get({key: "operation"})
    expect(firstField).not.toBeNull()

    // Вторая попытка той же root src через matter():
    // matter() видит существующий root actor и пропускает повторный runtime instance —
    // декларация WIMP в БД не перезаписывается.
    await matter("zavx0z/git")

    const secondWimp = await boundary.wimp.get("zavx0z/git")
    expect(secondWimp).not.toBeNull()
    const secondField = await secondWimp!.fields.get({key: "operation"})
    expect(secondField).not.toBeNull()

    // Поле operation должно сохраниться.
    expect(secondField?.key).toBe("operation")
  })

  test("materialization читает matter relation из boundary, а не повторно из DSL", async () => {
    const dsl = await loadMeta("zavx0z/git")
    await boundary.wimp.create("zavx0z/git", {...dsl, matter: []})

    await matter("zavx0z/git")

    const roots = await boundary.actor.roots.all()
    expect(roots).toHaveLength(1)
    expect(await boundary.topology.childrenOfActor(roots[0]!.id)).toHaveLength(0)
  })
})
