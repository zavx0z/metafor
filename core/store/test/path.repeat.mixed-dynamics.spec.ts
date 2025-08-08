import { describe, test, expect, beforeEach, afterAll } from "bun:test"
import { MetaForFabric } from "../../index.ts"
import { SQLiteStore } from "../../../server/store/index.ts"
import { Database } from "bun:sqlite"
import { html, render } from "../../html/index.js"
import { repeat } from "../../html/directives/repeat.ts"

describe("repeat: динамические вставки/удаления (смешанные)", () => {
  const dbPath = `path.mixdyn.${Date.now()}.sqlite`
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

  test("смешанные вставки и удаления не ломают индексацию одноименных тегов", async () => {
    const ChildA = MetaFor("mixdyn-a", { dev: true }).context((t) => ({ v: t.string.required("") })).states({ idle: {} }).core().processes().reactions().view()
    const ChildB = MetaFor("mixdyn-b", { dev: true }).context((t) => ({ v: t.string.required("") })).states({ idle: {} }).core().processes().reactions().view()
    const a = ChildA
    const b = ChildB

    let arr: Array<["a" | "b", string]> = [
      ["a", "a1"],
      ["b", "b1"],
      ["a", "a2"],
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

    const a1 = container.querySelector(`meta-${a}[data-key="a1"]`) as any
    const b1 = container.querySelector(`meta-${b}[data-key="b1"]`) as any
    const a2 = container.querySelector(`meta-${a}[data-key="a2"]`) as any
    expect(a1 && b1 && a2, "исходные элементы смонтированы").toBeTrue()

    // Вставка b2 между a1 и b1
    arr = [
      ["a", "a1"],
      ["b", "b2"],
      ["b", "b1"],
      ["a", "a2"],
    ]
    render(Page(), container)
    await Bun.sleep(60)

    const b2 = container.querySelector(`meta-${b}[data-key="b2"]`) as any
    expect(b2, "b2 вставлен").toBeTruthy()

    // Удаление a1
    arr = [
      ["b", "b2"],
      ["b", "b1"],
      ["a", "a2"],
    ]
    render(Page(), container)
    await Bun.sleep(60)

    const na1 = container.querySelector(`meta-${a}[data-key="a1"]`)
    expect(na1, "a1 удалён").toBeNull()
  })
})
