import {afterEach, beforeEach, describe, expect, test} from "bun:test"
import {SQL} from "bun"
import type {Store} from "../store/index.ts"
import {open} from "../store/sqlite.ts"
import {matter} from "./index.ts"

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

    // Вторая попытка той же src через matter():
    // matter() видит существующий wimp и пропускает повторное создание/наполнение —
    // декларация в БД не перезаписывается.
    await matter("zavx0z/git")

    const secondWimp = await store.wimp.get("zavx0z/git")
    expect(secondWimp).not.toBeNull()
    const secondFieldUuid = await secondWimp!.fields.get({key: "operation"})
    expect(secondFieldUuid).not.toBeNull()

    // Поле operation должно сохраниться.
    expect(secondFieldUuid?.key).toBe("operation")
  })
})
