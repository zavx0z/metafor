import {afterEach, beforeEach, describe, expect, test} from "bun:test"
import {SQL} from "bun"
import type {Store} from "../store/index.ts"
import {open} from "../store/server.ts"
import {matter} from "./index.ts"
import {loadWimp} from "./load.ts"

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
    await matter(await loadWimp("zavx0z/git"))

    const firstWimp = await store.wimp.get("zavx0z/git")
    expect(firstWimp).not.toBeNull()
    const firstIds = await firstWimp!.identifiers()

    // Вторая попытка той же src через matter():
    // loadWimp видит существующий wimp и пропускает emit declaration —
    // декларация в БД не перезаписывается, identifiers те же.
    await matter(await loadWimp("zavx0z/git"))

    const secondWimp = await store.wimp.get("zavx0z/git")
    expect(secondWimp).not.toBeNull()
    const secondIds = await secondWimp!.identifiers()

    expect(secondIds.fieldUuids.get("operation")).toBe(firstIds.fieldUuids.get("operation"))
    expect(secondIds.initialState).toBe(firstIds.initialState)
  })
})
