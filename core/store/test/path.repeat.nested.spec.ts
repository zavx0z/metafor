import { describe, test, expect, beforeEach } from "bun:test"
import { MetaForFabric } from "../../index.ts"
import { SQLiteStore } from "../../../server/store/index.ts"
import { Database } from "bun:sqlite"
import { html, render } from "../../html/index.js"
import { repeat } from "../../html/directives/repeat.ts"

describe("path + repeat: вложенные акторы", () => {
  const dbPath = `path.nested.${Date.now()}.sqlite`
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

  test("перестановки/вставки/удаления на нескольких уровнях корректно обновляют path", async () => {
    const Child = MetaFor("child-nested", { dev: true })
      .context((t) => ({ v: t.string.required("") }))
      .states({ idle: {} })
      .core()
      .processes()
      .reactions()
      .view()
    const childHash = Child

    const Parent = MetaFor("parent-nested", { dev: true })
      .context((t) => ({ arr: t.array.required(["x"]) }))
      .states({ idle: {} })
      .core()
      .processes()
      .reactions()
      .view({
        render: ({ html, context }) => html`<div class="parent">
          ${repeat(
            context.arr,
            (it) => it,
            (it, i) => html`<meta-${childHash} data-key=${it}></meta-${childHash}>`
          )}
        </div>`,
      })
    const parentHash = Parent

    // Корневые parents
    let outer = ["P1", "P2"]
    const Page = (withContext: boolean) => html`<div id="page">
      ${repeat(
        outer,
        (it) => it,
        (it) =>
          withContext
            ? html`<meta-${parentHash} context=${{ arr: ["a", "b", "c"] }} data-parent=${it}></meta-${parentHash}>`
            : html`<meta-${parentHash} data-parent=${it}></meta-${parentHash}>`
      )}
    </div>`

    render(Page(true), container)
    ;(customElements as any).upgrade?.((container.querySelector(`meta-${parentHash}`) as any)?.shadowRoot)
    await Bun.sleep(10)

    // Проверка начальных путей
    const p1 = container.querySelector(`meta-${parentHash}[data-parent="P1"]`) as any
    const p2 = container.querySelector(`meta-${parentHash}[data-parent="P2"]`) as any
    expect(p1.path, "путь p1").toBe(`${parentHash}:0`)
    expect(p2.path, "путь p2").toBe(`${parentHash}:1`)

    const c1nodes = Array.from(p1.shadowRoot!.querySelectorAll(`meta-${childHash}`)) as any[]
    expect(c1nodes.length, "у p1 должно быть 3 ребёнка").toBe(3)
    expect(c1nodes[0]?.path, "p1/child idx 0").toBe(`${parentHash}:0/${childHash}:0`)
    expect(c1nodes[1]?.path, "p1/child idx 1").toBe(`${parentHash}:0/${childHash}:1`)
    expect(c1nodes[2]?.path, "p1/child idx 2").toBe(`${parentHash}:0/${childHash}:2`)

    // Перестановка детей внутри P1: [c,a,b]
    p1.update({ arr: ["c", "a", "b"] })
    ;(customElements as any).upgrade?.(p1.shadowRoot)
    await Bun.sleep(10)
    const c1nodes2 = Array.from(p1.shadowRoot!.querySelectorAll(`meta-${childHash}`)) as any[]
    expect(c1nodes2[0]?.path, "p1/child[0] -> idx 0").toBe(`${parentHash}:0/${childHash}:0`)
    expect(c1nodes2[1]?.path, "p1/child[1] -> idx 1").toBe(`${parentHash}:0/${childHash}:1`)
    expect(c1nodes2[2]?.path, "p1/child[2] -> idx 2").toBe(`${parentHash}:0/${childHash}:2`)

    // Удаление b, добавление d в начало: [d, c, a]
    p1.update({ arr: ["d", "c", "a"] })
    ;(customElements as any).upgrade?.(p1.shadowRoot)
    await Bun.sleep(10)
    const c1nodes3 = Array.from(p1.shadowRoot!.querySelectorAll(`meta-${childHash}`)) as any[]
    expect(c1nodes3[0]?.path, "p1/child[0] -> idx 0").toBe(`${parentHash}:0/${childHash}:0`)
    expect(c1nodes3[1]?.path, "p1/child[1] -> idx 1").toBe(`${parentHash}:0/${childHash}:1`)
    expect(c1nodes3[2]?.path, "p1/child[2] -> idx 2").toBe(`${parentHash}:0/${childHash}:2`)

    // Перестановка родительских акторов: [P2, P1]
    outer = ["P2", "P1"]
    render(Page(false), container)
    ;(customElements as any).upgrade?.(
      (container.querySelector(`meta-${parentHash}[data-parent="P1"]`) as any)?.shadowRoot
    )
    ;(customElements as any).upgrade?.(
      (container.querySelector(`meta-${parentHash}[data-parent="P2"]`) as any)?.shadowRoot
    )
    await Bun.sleep(10)
    const np1 = container.querySelector(`meta-${parentHash}[data-parent="P1"]`) as any
    const np2 = container.querySelector(`meta-${parentHash}[data-parent="P2"]`) as any
    expect(np2.path, "P2 теперь root idx 0").toBe(`${parentHash}:0`)
    expect(np1.path, "P1 теперь root idx 1").toBe(`${parentHash}:1`)

    const np1nodes = Array.from(np1.shadowRoot!.querySelectorAll(`meta-${childHash}`)) as any[]
    expect(np1nodes.length, "у p1 должно быть 3 ребёнка после перестановки родителей").toBe(3)
    expect(np1nodes[0]?.path, "p1/child[0] после перестановки родителя -> idx 0").toBe(`${parentHash}:1/${childHash}:0`)
    expect(np1nodes[1]?.path, "p1/child[1] после перестановки родителя -> idx 1").toBe(`${parentHash}:1/${childHash}:1`)
    expect(np1nodes[2]?.path, "p1/child[2] после перестановки родителя -> idx 2").toBe(`${parentHash}:1/${childHash}:2`)

    // Ре-гидратация: меняем контекст у первого ребёнка p1, размонтируем и монтируем снова
    const firstChild = np1nodes[0] as any
    firstChild.update({ v: "persist-nested" })
    await Bun.sleep(20)
    container.remove()
    container = document.createElement("div")
    document.body.append(container)
    render(Page(false), container)
    await Bun.sleep(60)
    const newP1 = container.querySelector(`meta-${parentHash}[data-parent="P1"]`) as any
    const newFirst = (newP1.shadowRoot!.querySelectorAll(`meta-${childHash}`)[0] as any)!
    expect(newFirst.snapshot.context.v.value, "вложенный ребёнок восстановился из стора").toBe("persist-nested")
  })
})
