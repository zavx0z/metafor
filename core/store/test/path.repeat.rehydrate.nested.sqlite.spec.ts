import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import { MetaForFabric } from "../../index.ts"
import { SQLiteStore } from "../../../server/store/index.ts"
import { Database } from "bun:sqlite"
import { html, render } from "../../html/index.js"
import { repeat } from "../../html/directives/repeat.ts"

describe("rehydration: nested + repeat (SQLite)", () => {
  const dbPath = `rehydrate.nested.${Date.now()}.sqlite`
  let db: Database
  let store: SQLiteStore
  let MetaFor: ReturnType<typeof MetaForFabric>

  beforeAll(async () => {
    try {
      await Bun.file(dbPath).delete()
      await Bun.file(`${dbPath}-shm`).delete()
      await Bun.file(`${dbPath}-wal`).delete()
    } catch {}
    db = new Database(dbPath)
    store = new SQLiteStore(dbPath)
    MetaFor = MetaForFabric({ store })
  })
  afterAll(async () => {
    db.close()
    try {
      await Bun.file(dbPath).delete()
      await Bun.file(`${dbPath}-shm`).delete()
      await Bun.file(`${dbPath}-wal`).delete()
    } catch {}
  })

  test("значения детей восстанавливаются после манипуляций и повторного монтирования", async () => {
    const Child = MetaFor("reh-child", { dev: true })
      .context((t) => ({ label: t.string.required("") }))
      .states({ idle: {} })
      .core()
      .processes()
      .reactions()
      .view()
    const childHash = Child

    const Parent = MetaFor("reh-parent", { dev: true })
      .context((t) => ({ arr: t.array.required(["a", "b", "c"]) }))
      .states({ idle: {} })
      .core()
      .processes()
      .reactions()
      .view({
        render: ({ html, context }) => html`<div class="parent">
          ${repeat(
            context.arr,
            (it) => it,
            (it) =>
              html`<div class="wrap"><meta-${childHash} data-k=${it} context=${{
                label: it,
              }}></meta-${childHash}></div>`
          )}
        </div>`,
      })
    const parentHash = Parent

    // Монт 1
    document.body.innerHTML = `<meta-${parentHash}></meta-${parentHash}>`
    const p1 = document.querySelector(`meta-${parentHash}`) as any
    await Bun.sleep(100)

    // Меняем label у ребёнка "b"
    const bEl1 = p1.shadowRoot!.querySelector(`meta-${childHash}[data-k="b"]`) as any
    bEl1.update({ label: "changed-b" })
    await Bun.sleep(100)

    // Перестановка массива: [c, b, a], затем возвращаем исходный порядок, чтобы убедиться, что связывание по ключу сохранит соответствие
    p1.update({ arr: ["c", "b", "a"] })
    await Bun.sleep(100)
    p1.update({ arr: ["a", "b", "c"] })
    await Bun.sleep(30)

    // Размонтирование
    document.body.innerHTML = ""
    await Bun.sleep(100)

    // Монт 2 (rehydration)
    document.body.innerHTML = `<meta-${parentHash}></meta-${parentHash}>`
    const p2 = document.querySelector(`meta-${parentHash}`) as any
    await Bun.sleep(150)

    // Должно восстановиться для элемента с data-k="b"
    const bEl2 = p2.shadowRoot!.querySelector(`meta-${childHash}[data-k="b"]`) as any
    expect(bEl2.snapshot.context.label.value, "label ребёнка b восстановлен из стора").toBe("changed-b")
  })
})
