import { describe, test, expect, beforeEach, afterAll } from "bun:test"
import { MetaForFabric } from "../../index.ts"
import { SQLiteStore } from "../../../server/store/index.ts"
import { Database } from "bun:sqlite"
import { html, render } from "../../html/index.js"
import { repeat } from "../../html/directives/repeat.ts"

describe("перемещение между родителями", () => {
  const dbPath = `path.movebp.${Date.now()}.sqlite`
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

  test("перенос мета между родителями сохраняет ключи и путь", async () => {
    const Child = MetaFor("move-between-child", { dev: true })
      .context((t) => ({ v: t.string.required("") }))
      .states({ idle: {} })
      .core()
      .processes()
      .reactions()
      .view()
    const ch = Child

    const Parent = MetaFor("move-between-parent", { dev: true })
      .context((t) => ({ arr: t.array.required(["a"]) }))
      .states({ idle: {} })
      .core()
      .processes()
      .reactions()
      .view({
        render: ({ html, context }) => html`<div class="p">
          ${repeat(
            context.arr,
            (x) => x,
            (x) => html`<meta-${ch} data-k=${x}></meta-${ch}>`
          )}
        </div>`,
      })
    const ph = Parent

    let parents = ["P1", "P2"]
    const Page = () => html`<div id="page">
      ${repeat(
        parents,
        (p) => p,
        (p) => html`<meta-${ph} data-p=${p}></meta-${ph}>`
      )}
    </div>`

    render(Page(), container)
    await Bun.sleep(100)

    const p1 = container.querySelector(`meta-${ph}[data-p="P1"]`) as any
    const p2 = container.querySelector(`meta-${ph}[data-p="P2"]`) as any

    // перенос ребёнка "a" из P1 в P2
    p1.update({ arr: [] })
    p2.update({ arr: ["a"] })
    await Bun.sleep(100)

    const childInP2 = p2.shadowRoot!.querySelector(`meta-${ch}[data-k="a"]`) as any
    expect(childInP2, "ребёнок с ключом a перемещён в P2").toBeTruthy()
    expect(childInP2.path.startsWith(`${ph}:1/${ch}:`), "путь начинается с родителя P2").toBeTrue()
  })
})
