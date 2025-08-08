import { describe, test, expect, beforeEach } from "bun:test"
import { MetaForFabric } from "../../index.ts"
import { SQLiteStore } from "../../../server/store/index.ts"
import { Database } from "bun:sqlite"
import { html, render } from "../../html/index.js"
import { repeat } from "../../html/directives/repeat.ts"

describe("перенос ребёнка между разными родителями", () => {
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

  test("ребёнок меняет parent segment в path", async () => {
    const Child = MetaFor("move-child", { dev: true })
      .context((t) => ({ v: t.string.required("") }))
      .states({ idle: {} })
      .core()
      .processes()
      .reactions()
      .view()
    const child = Child

    const Parent = MetaFor("move-parent", { dev: true })
      .context((t) => ({ arr: t.array.required(["x"]) }))
      .states({ idle: {} })
      .core()
      .processes()
      .reactions()
      .view({
        render: ({ html, context }) => html`<div class="p">
          ${repeat(
            context.arr,
            (it) => it,
            (it) => html`<meta-${child} data-key=${it}></meta-${child}>`
          )}
        </div>`,
      })
    const parent = Parent

    let order = ["A", "B"]
    const Page = () => html`<div>
      ${repeat(
        order,
        (it) => it,
        (it) => html`<meta-${parent} data-p=${it} context=${{ arr: ["x"] }}></meta-${parent}>`
      )}
    </div>`

    render(Page(), container)
    await Bun.sleep(10)
    const pA = container.querySelector(`meta-${parent}[data-p="A"]`) as any
    const pB = container.querySelector(`meta-${parent}[data-p="B"]`) as any
    const xA = pA.shadowRoot!.querySelector(`meta-${child}`) as any
    expect(xA.path, "ребенок x у A").toBe(`${parent}:0/${child}:0`)

    // перенос x из A к B
    pA.update({ arr: [] })
    pB.update({ arr: ["x"] })
    await Bun.sleep(10)
    const xB = pB.shadowRoot!.querySelector(`meta-${child}`) as any
    expect(xB.path, "ребенок x теперь у B").toBe(`${parent}:1/${child}:0`)

    // Ре-гидратация: меняем контекст у x в B, размонтируем все и монтируем заново
    xB.update({ v: "persist-move" })
    await Bun.sleep(120)
    container.remove()
    container = document.createElement("div")
    document.body.append(container)
    render(Page(), container)
    await Bun.sleep(120)
    const pB2 = container.querySelector(`meta-${parent}[data-p="B"]`) as any
    const xB2 = pB2.shadowRoot!.querySelector(`meta-${child}`) as any
    expect(xB2.snapshot.context.v.value, "x у B восстановил контекст из стора").toBe("persist-move")
  })
})
