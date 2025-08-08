import { describe, test, expect, beforeEach } from "bun:test"
import { MetaForFabric } from "../../index.ts"
import { SQLiteStore } from "../../../server/store/index.ts"
import { Database } from "bun:sqlite"
import { html, render } from "../../html/index.js"
import { repeat } from "../../html/directives/repeat.ts"

describe("path + repeat: смешанные теги на одном уровне", () => {
  const dbPath = `path.mixed.${Date.now()}.sqlite`
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

  test("индексация среди одноименных тэгов, пути для разных мет уникальны", async () => {
    const A = MetaFor("mixed-a", { dev: true })
      .context((t) => ({ v: t.string.required("") }))
      .states({ idle: {} })
      .core()
      .processes()
      .reactions()
      .view()
    const a = A
    const B = MetaFor("mixed-b", { dev: true })
      .context((t) => ({ v: t.string.required("") }))
      .states({ idle: {} })
      .core()
      .processes()
      .reactions()
      .view()
    const b = B

    // порядок: A, B, A, B
    const tpl = () => html`<div>
      <meta-${a}></meta-${a}>
      <meta-${b}></meta-${b}>
      <meta-${a}></meta-${a}>
      <meta-${b}></meta-${b}>
    </div>`
    render(tpl(), container)
    await Bun.sleep(10)

    const nodesA = Array.from(container.querySelectorAll(`meta-${a}`)) as any[]
    const nodesB = Array.from(container.querySelectorAll(`meta-${b}`)) as any[]
    expect(nodesA[0]?.path, "первый A idx 0").toBe(`${a}:0`)
    expect(nodesA[1]?.path, "второй A idx 1").toBe(`${a}:1`)
    expect(nodesB[0]?.path, "первый B idx 0").toBe(`${b}:0`)
    expect(nodesB[1]?.path, "второй B idx 1").toBe(`${b}:1`)

    // Ре-гидратация: меняем контекст у второго A и проверяем после ре-монта
    const a2 = nodesA[1] as any
    a2.update({ v: "persist-mixed" })
    await Bun.sleep(20)
    container.remove()
    container = document.createElement("div")
    document.body.append(container)
    render(tpl(), container)
    await Bun.sleep(40)
    const nodesA4 = Array.from(container.querySelectorAll(`meta-${a}`)) as any[]
    expect(nodesA4[1].snapshot.context.v.value, "второй A восстановил контекст из стора").toBe("persist-mixed")
  })
})
