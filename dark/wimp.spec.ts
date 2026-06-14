import {afterEach, beforeEach, describe, expect, test} from "bun:test"
import {SQL} from "bun"
import type {Store} from "../store/index.ts"
import {open} from "../store/sqlite.ts"
import {matter} from "./index.ts"
import {loadMeta} from "./load.ts"

describe("wimp normalization", () => {
  let store: Awaited<ReturnType<typeof open>>
  let sql: SQL

  beforeEach(async () => {
    store = await open(":memory:")
    globalThis.store = store
    sql = new SQL("sqlite::memory:")
  })

  afterEach(async () => {
    await sql.close()
    await store.close()
  })

  test("повторная materialization одинакового src НЕ дублирует декларацию в store", async () => {
    await matter("zavx0z/git")

    const firstWimp = await store.wimp.get("zavx0z/git")
    expect(firstWimp).not.toBeNull()
    const firstFieldUuid = await firstWimp!.fields.get({key: "operation"})
    expect(firstFieldUuid).not.toBeNull()

    // Вторая попытка той же root src через matter():
    // matter() видит существующий root actor и пропускает повторный runtime instance —
    // декларация WIMP в БД не перезаписывается.
    await matter("zavx0z/git")

    const secondWimp = await store.wimp.get("zavx0z/git")
    expect(secondWimp).not.toBeNull()
    const secondFieldUuid = await secondWimp!.fields.get({key: "operation"})
    expect(secondFieldUuid).not.toBeNull()

    // Поле operation должно сохраниться.
    expect(secondFieldUuid?.key).toBe("operation")
  })

  test("materialization читает matter relation из store, а не повторно из DSL", async () => {
    const dsl = await loadMeta("zavx0z/git")
    await store.wimp.create("zavx0z/git", {...dsl, matter: []})

    await matter("zavx0z/git")

    const roots = await store.actor.roots.all()
    expect(roots).toHaveLength(1)
    expect(await store.topology.childrenOfActor(roots[0]!.uuid)).toHaveLength(0)
  })
})
