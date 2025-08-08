import { describe, test, expect, beforeEach, afterAll } from "bun:test"
import { MetaForFabric } from "../../index.ts"
import { SQLiteStore } from "../../../server/store/index.ts"
import { Database } from "bun:sqlite"
import { html, render } from "../../html/index.js"
import { repeat } from "../../html/directives/repeat.ts"

describe("repeat: без ключей", () => {
  const dbPath = `path.nokeys.${Date.now()}.sqlite`
  let db: Database
  let store: SQLiteStore
  let MetaFor: ReturnType<typeof MetaForFabric>
  let container: HTMLDivElement

  beforeEach(() => {
    if (!db) db = new Database(dbPath)
    if (!store) store = new SQLiteStore(dbPath)
    MetaFor = MetaForFabric({ store })
    container = document.createElement("div")
    document.body.innerHTML = ""
    document.body.append(container)
  })

  afterAll(async () => {
    db.close()
    await Bun.file(dbPath).delete()
    await Bun.file(dbPath + "-shm").delete()
    await Bun.file(dbPath + "-wal").delete()
  })

  test("без ключей индексация сохраняется", async () => {
    const Child = MetaFor("nokeys-child", { dev: true }).context((t) => ({ v: t.string.required("") })).states({ idle: {} }).core().processes().reactions().view()
    const ch = Child

    let items = [1, 2, 3]
    const Page = () => html`<div>${repeat(items, undefined as any, () => html`<meta-${ch}></meta-${ch}>`)}</div>`

    render(Page(), container)
    await Bun.sleep(50)

    const list1 = container.querySelectorAll(`meta-${ch}`)
    expect(list1.length, "3 элемента отрисованы").toBe(3)

    items = [3, 2]
    render(Page(), container)
    await Bun.sleep(50)

    const list2 = container.querySelectorAll(`meta-${ch}`)
    expect(list2.length, "2 элемента после удаления одного").toBe(2)
  })
})
