import { describe, test, expect, beforeEach, afterAll } from "bun:test"
import { MetaForFabric } from "../../index.ts"
import { SQLiteStore } from "../../../server/store/index.ts"
import { Database } from "bun:sqlite"
import { html, render } from "../../html/index.js"
import { repeat } from "../../html/directives/repeat.ts"

describe("repeat: смешанные теги", () => {
  const dbPath = `path.mixed.${Date.now()}.sqlite`
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

  test("смешанные теги корректно индексируются", async () => {
    const A = MetaFor("mixed-a", { dev: true }).context((t) => ({ v: t.string.required("") })).states({ idle: {} }).core().processes().reactions().view()
    const B = MetaFor("mixed-b", { dev: true }).context((t) => ({ v: t.string.required("") })).states({ idle: {} }).core().processes().reactions().view()
    const a = A
    const b = B

    let arr: Array<["a" | "b", string]> = [
      ["a", "a1"],
      ["b", "b1"],
      ["a", "a2"],
      ["b", "b2"],
    ]

    const Page = () => html`<section>
      ${repeat(
        arr,
        (x) => x[1],
        ([type, key]) => (type === "a" ? html`<meta-${a} data-key=${key}></meta-${a}>` : html`<meta-${b} data-key=${key}></meta-${b}>`)
      )}
    </section>`

    render(Page(), container)
    await Bun.sleep(60)

    const a1 = container.querySelector(`meta-${a}[data-key="a1"]`)
    const b1 = container.querySelector(`meta-${b}[data-key="b1"]`)
    const a2 = container.querySelector(`meta-${a}[data-key="a2"]`)
    const b2 = container.querySelector(`meta-${b}[data-key="b2"]`)
    expect(!!a1 && !!b1 && !!a2 && !!b2, "все акты смонтированы").toBeTrue()
  })
})
