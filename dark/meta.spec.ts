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
    // Используем один и тот же store — повторный matter() для уже залитой меты
    // должен пройти без UNIQUE-конфликтов (loadMeta сам видит существующую и читает identifiers).
    await matter("zavx0z/git", {store})

    // получим snapshot meta-каталога из store
    const firstMeta = await store.meta.get("zavx0z/git")
    expect(firstMeta).not.toBeNull()
    const firstIds = await firstMeta!.identifiers()

    // вторая попытка: новый root Wimp той же src.
    // matter() пишет actor row для этого Wimp, но meta-декларация не переписывается.
    await matter("zavx0z/git", {store})

    const secondMeta = await store.meta.get("zavx0z/git")
    expect(secondMeta).not.toBeNull()
    const secondIds = await secondMeta!.identifiers()

    // Те же uuid'ы — декларация не переписалась
    expect(secondIds.fieldUuids.get("operation")).toBe(firstIds.fieldUuids.get("operation"))
    expect(secondIds.initialState).toBe(firstIds.initialState)
  })
})
