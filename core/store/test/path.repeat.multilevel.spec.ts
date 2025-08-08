import { describe, test, expect, beforeEach } from "bun:test"
import { MetaForFabric } from "../../index.ts"
import { SQLiteStore } from "../../../server/store/index.ts"
import { Database } from "bun:sqlite"
import { html, render } from "../../html/index.js"
import { repeat } from "../../html/directives/repeat.ts"

describe("path + repeat: многоуровневые вложенности", () => {
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

  test("перестановки на 3 уровнях корректно обновляют path", async () => {
    const Child = MetaFor("ml-child", { dev: true })
      .context((t) => ({ v: t.string.required("") }))
      .states({ idle: {} })
      .core()
      .processes()
      .reactions()
      .view()
    const childHash = Child

    const Parent = MetaFor("ml-parent", { dev: true })
      .context((t) => ({ arr: t.array.required(["a"]) }))
      .states({ idle: {} })
      .core()
      .processes()
      .reactions()
      .view({
        render: ({ html, context }) => html`<section class="parent">
          ${repeat(
            context.arr,
            (it) => it,
            (it) => html`<meta-${childHash} data-key=${it}></meta-${childHash}>`
          )}
        </section>`,
      })
    const parentHash = Parent

    const Grand = MetaFor("ml-grand", { dev: true })
      .context((t) => ({ parents: t.array.required(["P1"]) }))
      .states({ idle: {} })
      .core()
      .processes()
      .reactions()
      .view({
        render: ({ html, context }) => html`<div id="grand">
          ${repeat(
            context.parents,
            (p) => p,
            (p) => html`<meta-${parentHash} data-parent=${p} context=${{ arr: ["a", "b", "c"] }}></meta-${parentHash}>`
          )}
        </div>`,
      })
    const grandHash = Grand

    // Монтируем один grand
    const tpl = () => html`<meta-${grandHash}></meta-${grandHash}>`
    render(tpl(), container)
    await Bun.sleep(10)

    const grand = container.querySelector(`meta-${grandHash}`) as any
    const p1 = grand.shadowRoot!.querySelector(`meta-${parentHash}[data-parent="P1"]`) as any
    expect(grand.path, "grand idx 0").toBe(`${grandHash}:0`)
    expect(p1.path, "p1 под grand").toBe(`${grandHash}:0/${parentHash}:0`)
    const cNodes = Array.from(p1.shadowRoot!.querySelectorAll(`meta-${childHash}`)) as any[]
    expect(
      cNodes.map((n) => n.path),
      "дети p1"
    ).toEqual([
      `${grandHash}:0/${parentHash}:0/${childHash}:0`,
      `${grandHash}:0/${parentHash}:0/${childHash}:1`,
      `${grandHash}:0/${parentHash}:0/${childHash}:2`,
    ])

    // Перестановка детей внутри p1
    p1.update({ arr: ["c", "b", "a"] })
    await Bun.sleep(10)
    const cNodes2 = Array.from(p1.shadowRoot!.querySelectorAll(`meta-${childHash}`)) as any[]
    expect(
      cNodes2.map((n) => n.path),
      "дети p1 переставлены"
    ).toEqual([
      `${grandHash}:0/${parentHash}:0/${childHash}:0`,
      `${grandHash}:0/${parentHash}:0/${childHash}:1`,
      `${grandHash}:0/${parentHash}:0/${childHash}:2`,
    ])

    // Добавим второго родителя P2
    grand.update({ parents: ["P1", "P2"] })
    await Bun.sleep(10)
    const p2 = grand.shadowRoot!.querySelector(`meta-${parentHash}[data-parent="P2"]`) as any
    expect(p2.path, "p2 idx 1").toBe(`${grandHash}:0/${parentHash}:1`)

    // Перестановка родителей: [P2, P1]
    grand.update({ parents: ["P2", "P1"] })
    await Bun.sleep(10)
    const np1 = grand.shadowRoot!.querySelector(`meta-${parentHash}[data-parent="P1"]`) as any
    expect(np1.path, "p1 стал idx 1").toBe(`${grandHash}:0/${parentHash}:1`)
    const np1Child = (np1.shadowRoot!.querySelectorAll(`meta-${childHash}`)[0] as any)!
    expect(np1Child.path, "ребёнок p1 скорректировал путь").toBe(`${grandHash}:0/${parentHash}:1/${childHash}:0`)

    // Ре-гидратация на глубине 3: меняем контекст у листа, ре-монтируем grand
    np1Child.update({ v: "persist-multilevel" })
    await Bun.sleep(20)
    container.remove()
    container = document.createElement("div")
    document.body.append(container)
    render(tpl(), container)
    await Bun.sleep(60)
    const grand2 = container.querySelector(`meta-${grandHash}`) as any
    const p12 = grand2.shadowRoot!.querySelector(`meta-${parentHash}[data-parent="P1"]`) as any
    const leaf2 = (p12.shadowRoot!.querySelectorAll(`meta-${childHash}`)[0] as any)!
    expect(leaf2.snapshot.context.v.value, "лист восстановился из стора").toBe("persist-multilevel")
  })
})
