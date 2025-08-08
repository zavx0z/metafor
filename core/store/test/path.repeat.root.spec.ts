import { describe, test, expect, beforeEach, afterAll } from "bun:test"
import { MetaForFabric } from "../../index.ts"
import { SQLiteStore } from "../../../server/store/index.ts"
import { Database } from "bun:sqlite"
import { html, render } from "../../html/index.js"
import { repeat } from "../../html/directives/repeat.ts"

describe("path + repeat: корневые акторы", () => {
  const dbPath = `path.root.${Date.now()}.sqlite`
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

  test("перестановки, добавления, удаления с repeat обновляют path", async () => {
    const Child = MetaFor("child-root", { dev: true })
      .context((t) => ({ v: t.string.required("") }))
      .states({ idle: {} })
      .core()
      .processes()
      .reactions()
      .view()

    const childHash = Child

    let items = ["a", "b", "c"]

    const tpl = () => html`<div id="host">
      ${repeat(
        items,
        (it) => it,
        (it, i) => html`<meta-${childHash} data-key=${it}></meta-${childHash}>`
      )}
    </div>`

    render(tpl(), container)
    await Bun.sleep(0)

    const elA1 = container.querySelector(`meta-${childHash}[data-key="a"]`) as any
    const elB1 = container.querySelector(`meta-${childHash}[data-key="b"]`) as any
    const elC1 = container.querySelector(`meta-${childHash}[data-key="c"]`) as any
    expect(!!elA1 && !!elB1 && !!elC1, "все три актора смонтированы").toBeTrue()
    expect(elA1.path, "a на позиции 0").toBe(`${childHash}:0`)
    expect(elB1.path, "b на позиции 1").toBe(`${childHash}:1`)
    expect(elC1.path, "c на позиции 2").toBe(`${childHash}:2`)

    // Перестановка: [c, a, b]
    items = ["c", "a", "b"]
    render(tpl(), container)
    await Bun.sleep(0)
    const elA2 = container.querySelector(`meta-${childHash}[data-key="a"]`) as any
    const elB2 = container.querySelector(`meta-${childHash}[data-key="b"]`) as any
    const elC2 = container.querySelector(`meta-${childHash}[data-key="c"]`) as any
    expect(elC2.path, "c перемещен на 0").toBe(`${childHash}:0`)
    expect(elA2.path, "a перемещен на 1").toBe(`${childHash}:1`)
    expect(elB2.path, "b перемещен на 2").toBe(`${childHash}:2`)

    // Удаление b => [c, a]
    items = ["c", "a"]
    render(tpl(), container)
    await Bun.sleep(0)
    const elB3 = container.querySelector(`meta-${childHash}[data-key="b"]`)
    const elA3 = container.querySelector(`meta-${childHash}[data-key="a"]`) as any
    const elC3 = container.querySelector(`meta-${childHash}[data-key="c"]`) as any
    expect(elB3, "b удален").toBeNull()
    expect(elC3.path, "c остался на 0").toBe(`${childHash}:0`)
    expect(elA3.path, "a теперь на 1").toBe(`${childHash}:1`)

    // Добавление d в начало => [d, c, a]
    items = ["d", "c", "a"]
    render(tpl(), container)
    await Bun.sleep(0)
    const elD4 = container.querySelector(`meta-${childHash}[data-key="d"]`) as any
    const elA4 = container.querySelector(`meta-${childHash}[data-key="a"]`) as any
    const elC4 = container.querySelector(`meta-${childHash}[data-key="c"]`) as any
    expect(elD4.path, "d добавлен на 0").toBe(`${childHash}:0`)
    expect(elC4.path, "c смещен на 1").toBe(`${childHash}:1`)
    expect(elA4.path, "a смещен на 2").toBe(`${childHash}:2`)

    // Проверка ре-гидратации из стора: меняем контекст у "c", размонтируем и монтируем заново
    elC4.update({ v: "persist-root" })
    await Bun.sleep(120)
    container.remove()
    container = document.createElement("div")
    document.body.append(container)
    render(tpl(), container)
    await Bun.sleep(120)
    const elC5 = container.querySelector(`meta-${childHash}[data-key="c"]`) as any
    expect(elC5.snapshot.context.v.value, "контекст должен восстановиться после ре-монта").toBe("persist-root")
  })
})
