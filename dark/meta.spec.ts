import {afterEach, beforeEach, describe, expect, test} from "bun:test"
import {SQL} from "bun"
import type {Store} from "../store/index.ts"
import {open} from "../store/server.ts"
import {matter} from "./index.ts"
import {loadMeta} from "./load.ts"

describe("meta normalization", () => {
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
    await matter(await loadMeta("zavx0z/git"))

    const firstMeta = await store.meta.get("zavx0z/git")
    expect(firstMeta).not.toBeNull()
    const firstIds = await firstMeta!.identifiers()

    // Вторая попытка той же src через matter():
    // loadMeta видит существующую meta и пропускает emit declaration —
    // декларация в БД не перезаписывается, identifiers те же.
    await matter(await loadMeta("zavx0z/git"))

    const secondMeta = await store.meta.get("zavx0z/git")
    expect(secondMeta).not.toBeNull()
    const secondIds = await secondMeta!.identifiers()

    expect(secondIds.fieldUuids.get("operation")).toBe(firstIds.fieldUuids.get("operation"))
    expect(secondIds.initialState).toBe(firstIds.initialState)
  })
})
