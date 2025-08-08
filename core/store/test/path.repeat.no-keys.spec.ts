import { describe, test, expect, beforeEach } from "bun:test"
import { MetaForFabric } from "../../index.ts"
import { SQLiteStore } from "../../../server/store/index.ts"
import { Database } from "bun:sqlite"
import { html, render } from "../../html/index.js"
import { repeat } from "../../html/directives/repeat.ts"

describe("repeat без ключей: индексация по позиции", () => {
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

  test("позиции корректно отражаются в path", async () => {
    const Child = MetaFor("no-keys-child", { dev: true })
      .context((t) => ({ v: t.string.required("") }))
      .states({ idle: {} })
      .core()
      .processes()
      .reactions()
      .view()
    const childHash = Child

    let items = [1, 2, 3]
    const tpl = () => html`<div>${repeat(items, (it, i) => html`<meta-${childHash}></meta-${childHash}>`)}</div>`

    render(tpl(), container)
    await Bun.sleep(10)
    const nodes1 = Array.from(container.querySelectorAll(`meta-${childHash}`)) as any[]
    expect(
      nodes1.map((n) => n.path),
      "инициализация по позициям"
    ).toEqual([`${childHash}:0`, `${childHash}:1`, `${childHash}:2`])

    // Перемещение: [3,1,2]
    items = [3, 1, 2]
    render(tpl(), container)
    await Bun.sleep(10)
    const nodes2 = Array.from(container.querySelectorAll(`meta-${childHash}`)) as any[]
    expect(
      nodes2.map((n) => n.path),
      "после перестановки по позициям"
    ).toEqual([`${childHash}:0`, `${childHash}:1`, `${childHash}:2`])

    // Ре-гидратация: меняем контекст у первого элемента, ре-монтируем
    const first = nodes2[0] as any
    first.update({ v: "persist-nokeys" })
    await Bun.sleep(20)
    container.remove()
    container = document.createElement("div")
    document.body.append(container)
    render(tpl(), container)
    await Bun.sleep(40)
    const nodes3 = Array.from(container.querySelectorAll(`meta-${childHash}`)) as any[]
    expect(nodes3[0].snapshot.context.v.value, "контекст восстановился из стора").toBe("persist-nokeys")
  })
})
