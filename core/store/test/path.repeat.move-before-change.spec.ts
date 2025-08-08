import { describe, test, expect, beforeEach, afterAll } from "bun:test"
import { MetaForFabric } from "../../index.ts"
import { SQLiteStore } from "../../../server/store/index.ts"
import { Database } from "bun:sqlite"
import { html, render } from "../../html/index.js"
import { repeat } from "../../html/directives/repeat.ts"

describe("path + repeat: изменение контекста ДО манипуляции и восстановление в новом месте", () => {
  const dbPath = `path.movebefore.${Date.now()}.sqlite`
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

  test("до-изменили контекст → перенесли к другому родителю → ре-монт → контекст у нового родителя", async () => {
    const Child = MetaFor("mb-child", { dev: true })
      .context((t) => ({ v: t.string.required("") }))
      .states({ idle: {} })
      .core()
      .processes()
      .reactions()
      .view()
    const child = Child

    const Parent = MetaFor("mb-parent", { dev: true })
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
            () => html`<meta-${child}></meta-${child}>`
          )}
        </div>`,
      })
    const parent = Parent

    let roots = ["A", "B"]
    const Page = () => html`<section>
      ${repeat(
        roots,
        (r) => r,
        (r) => html`<meta-${parent} data-p=${r}></meta-${parent}>`
      )}
    </section>`

    render(Page(), container)
    await Bun.sleep(20)

    const pA = container.querySelector(`meta-${parent}[data-p="A"]`) as any
    const pB = container.querySelector(`meta-${parent}[data-p="B"]`) as any
    const xA = pA.shadowRoot!.querySelector(`meta-${child}`) as any
    expect(xA.path, "x изначально у A").toBe(`${parent}:0/${child}:0`)

    // 1) Изменяем контекст ДО переноса
    xA.update({ v: "prechange" })
    await Bun.sleep(20)

    // 2) Переносим ребёнка x из A к B
    pA.update({ arr: [] })
    pB.update({ arr: ["x"] })
    await Bun.sleep(40)
    const xB = pB.shadowRoot!.querySelector(`meta-${child}`) as any
    expect(xB.path, "x теперь у B").toBe(`${parent}:1/${child}:0`)

    // 3) Ре-монт и ожидание восстановления в новом месте
    container.remove()
    container = document.createElement("div")
    document.body.append(container)
    render(Page(), container)
    await Bun.sleep(120)
    const pB2 = container.querySelector(`meta-${parent}[data-p="B"]`) as any
    const xB2 = pB2.shadowRoot!.querySelector(`meta-${child}`) as any
    expect(xB2.snapshot.context.v.value, "контекст перенесённого x восстановился у нового родителя").toBe("prechange")
  })

  test("до-изменили контекст → перестановка внутри родителя → ре-монт → контекст у новой позиции", async () => {
    const Leaf = MetaFor("mb-leaf", { dev: true })
      .context((t) => ({ v: t.string.required("") }))
      .states({ idle: {} })
      .core()
      .processes()
      .reactions()
      .view()
    const leaf = Leaf

    const Parent = MetaFor("mb-parent-order", { dev: true })
      .context((t) => ({ arr: t.array.required(["a", "b", "c"]) }))
      .states({ idle: {} })
      .core()
      .processes()
      .reactions()
      .view({
        render: ({ html, context }) => html`<div class="po">
          ${repeat(
            context.arr,
            (k) => k,
            (k) => html`<meta-${leaf} data-k=${k}></meta-${leaf}>`
          )}
        </div>`,
      })
    const parent = Parent

    const tpl = () => html`<meta-${parent}></meta-${parent}>`
    render(tpl(), container)
    await Bun.sleep(20)
    const p1 = container.querySelector(`meta-${parent}`) as any
    const b1 = p1.shadowRoot!.querySelector(`meta-${leaf}[data-k="b"]`) as any
    expect(b1.path, "b изначально на idx 1").toBe(`${parent}:0/${leaf}:1`)

    // 1) Изменяем контекст ДО перестановки
    b1.update({ v: "pre-b" })
    await Bun.sleep(20)

    // 2) Переставляем: [b, c, a]
    p1.update({ arr: ["b", "c", "a"] })
    await Bun.sleep(40)
    const b2 = p1.shadowRoot!.querySelector(`meta-${leaf}[data-k="b"]`) as any
    expect(b2.path, "b теперь на idx 0").toBe(`${parent}:0/${leaf}:0`)

    // 3) Ре-монт и проверяем восстановление на новой позиции
    container.remove()
    container = document.createElement("div")
    document.body.append(container)
    render(tpl(), container)
    await Bun.sleep(120)
    const p2 = container.querySelector(`meta-${parent}`) as any
    const b3 = p2.shadowRoot!.querySelector(`meta-${leaf}[data-k="b"]`) as any
    expect(b3.snapshot.context.v.value, "контекст b восстановился на новой позиции").toBe("pre-b")
  })

  afterAll(async () => {
    db.close()
    await Bun.file(dbPath).delete()
    await Bun.file(`${dbPath}-shm`).delete()
    await Bun.file(`${dbPath}-wal`).delete()
  })
})
