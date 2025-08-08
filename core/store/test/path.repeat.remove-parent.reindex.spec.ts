import { describe, test, expect, beforeEach } from "bun:test"
import { MetaForFabric } from "../../index.ts"
import { SQLiteStore } from "../../../server/store/index.ts"
import { Database } from "bun:sqlite"
import { html, render } from "../../html/index.js"
import { repeat } from "../../html/directives/repeat.ts"

describe("удаление родителя и реиндексация детей", () => {
  const dbPath = `path.rmparent.${Date.now()}.sqlite`
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

  test("после удаления P0, P1 становится idx 0 и его дети обновляют path", async () => {
    const Child = MetaFor("rp-child", { dev: true })
      .context((t) => ({ v: t.string.required("") }))
      .states({ idle: {} })
      .core()
      .processes()
      .reactions()
      .view()
    const ch = Child

    const Parent = MetaFor("rp-parent", { dev: true })
      .context((t) => ({ arr: t.array.required(["a", "b"]) }))
      .states({ idle: {} })
      .core()
      .processes()
      .reactions()
      .view({
        render: ({ html, context }) =>
          html`<div class="p">
            ${repeat(
              context.arr,
              (it) => it,
              () => html`<meta-${ch}></meta-${ch}>`
            )}
          </div>`,
      })
    const ph = Parent

    let parents = ["P0", "P1"]
    const Page = () =>
      html`<div id="page">
        ${repeat(
          parents,
          (p) => p,
          (p) => html`<meta-${ph} data-p=${p}></meta-${ph}>`
        )}
      </div>`

    render(Page(), container)
    await Bun.sleep(10)

    const p0 = container.querySelector(`meta-${ph}[data-p="P0"]`) as any
    const p1 = container.querySelector(`meta-${ph}[data-p="P1"]`) as any
    expect(p0.path, "P0 начальный idx 0").toBe(`${ph}:0`)
    expect(p1.path, "P1 начальный idx 1").toBe(`${ph}:1`)

    // Удаляем первого родителя
    parents = ["P1"]
    render(Page(), container)
    await Bun.sleep(10)

    const np1 = container.querySelector(`meta-${ph}[data-p="P1"]`) as any
    expect(np1.path, "P1 стал idx 0").toBe(`${ph}:0`)
    const cNodes = Array.from(np1.shadowRoot!.querySelectorAll(`meta-${ch}`)) as any[]
    expect(
      cNodes.map((n) => n.path),
      "дети p1 сместились в новый сегмент родителя"
    ).toEqual([`${ph}:0/${ch}:0`, `${ph}:0/${ch}:1`])

    // Ре-гидратация: меняем контекст у первого ребёнка, повторно монтируем
    ;(cNodes[0] as any).update({ v: "persist-rmparent" })
    await Bun.sleep(120)
    container.remove()
    container = document.createElement("div")
    document.body.append(container)
    render(Page(), container)
    await Bun.sleep(120)
    const np1b = container.querySelector(`meta-${ph}[data-p="P1"]`) as any
    const cNodesb = Array.from(np1b.shadowRoot!.querySelectorAll(`meta-${ch}`)) as any[]
    expect(cNodesb[0].snapshot.context.v.value, "после удаления/ре-монта контекст сохранился").toBe("persist-rmparent")
  })
})
