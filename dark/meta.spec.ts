import {afterEach, beforeEach, describe, expect, test} from "bun:test"
import {SQL} from "bun"
import {open} from "../store/server.ts"
import {matter} from "./index.ts"

describe("meta normalization", () => {
  let store: Awaited<ReturnType<typeof open>>
  let sql: SQL

  beforeEach(async () => {
    store = await open(":memory:")
    sql = new SQL("sqlite::memory:")
  })

  afterEach(async () => {
    await sql.close()
    await store.close()
  })

  test("повторная materialization одинакового src НЕ дублирует декларацию в store", async () => {
    await matter("zavx0z/git", {store})

    const firstMeta = await store.meta.get("zavx0z/git")
    expect(firstMeta).not.toBeNull()
    const firstIds = await firstMeta!.identifiers()

    // Вторая попытка той же src через matter():
    // loadMeta видит существующую meta и пропускает emit declaration —
    // декларация в БД не перезаписывается, identifiers те же.
    await matter("zavx0z/git", {store})

    const secondMeta = await store.meta.get("zavx0z/git")
    expect(secondMeta).not.toBeNull()
    const secondIds = await secondMeta!.identifiers()

    expect(secondIds.fieldUuids.get("operation")).toBe(firstIds.fieldUuids.get("operation"))
    expect(secondIds.initialState).toBe(firstIds.initialState)
  })
})
