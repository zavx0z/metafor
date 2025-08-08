import { describe, test, expect, beforeEach, afterAll } from "bun:test"
import { MetaForFabric } from "../../index.ts"
import { SQLiteStore } from "../../../server/store/index.ts"
import { Database } from "bun:sqlite"
import { html, render } from "../../html/index.js"
import { repeat } from "../../html/directives/repeat.ts"

describe("repeat: многоуровневые структуры", () => {
  const dbPath = `path.multilevel.${Date.now()}.sqlite`
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

  test("вложенные уровни корректно обновляются", async () => {
    const Leaf = MetaFor("multi-leaf", { dev: true }).context((t) => ({ v: t.string.required("") })).states({ idle: {} }).core().processes().reactions().view()
    const leaf = Leaf

    const Node = MetaFor("multi-node", { dev: true })
      .context((t) => ({ children: t.array.required([1]) }))
      .states({ idle: {} })
      .core()
      .processes()
      .reactions()
      .view({
        render: ({ html, context }) => html`<ul>
          ${repeat(context.children, (x) => x, () => html`<meta-${leaf}></meta-${leaf}>`)}
        </ul>`,
      })
    const node = Node

    let roots = ["R1", "R2"]
    const Page = () => html`<main>
      ${repeat(roots, (r) => r, () => html`<meta-${node}></meta-${node}>`)}
    </main>`

    render(Page(), container)
    await Bun.sleep(80)

    const first = container.querySelector(`meta-${node}`) as any
    first.update({ children: [1, 2, 3] })
    await Bun.sleep(80)
    const kids = first.shadowRoot!.querySelectorAll(`meta-${leaf}`)
    expect(kids.length, "добавились дети").toBe(3)
  })
})
