import { describe, test, expect, beforeEach } from "bun:test"
import { MetaForFabric } from "../../index.ts"
import type { ActorStore, MetaRecord, Store } from "../../store/index.t.ts"
import { html, render } from "../../html/index.js"
import { repeat } from "../../html/directives/repeat.ts"

class MemStore implements Store {
  #auto = 1
  #metas = new Map<string, string>()
  #actors: ActorStore[] = []

  saveMetaIsNotExists(fingerprint: string): string {
    // Простейший детерминированный хеш по имени из fingerprint
    const name = JSON.parse(fingerprint).name as string
    const hash = `test-${name}`
    if (!this.#metas.has(hash)) this.#metas.set(hash, fingerprint)
    return hash
  }
  getMeta(meta: string): MetaRecord | null {
    const fp = this.#metas.get(meta)
    return fp ? { meta, fingerprint: fp, timestamp: new Date().toISOString() } : null
  }
  saveActorIsNotExist(actor: Omit<ActorStore, "id" | "timestamp">): ActorStore {
    const found = this.#actors.find(
      (a) => a.meta === actor.meta && a.parent_id === actor.parent_id && a.idx === actor.idx
    )
    if (found) return found
    const rec: ActorStore = {
      id: this.#auto++,
      timestamp: new Date().toISOString(),
      ...actor,
    }
    this.#actors.push(rec)
    return rec
  }
  getActorByMeta(meta: string): ActorStore | null {
    const row = [...this.#actors].reverse().find((a) => a.meta === meta) || null
    return row
  }
  updateActorSnapshot(id: number, snapshot: string): void {
    const row = this.#actors.find((a) => a.id === id)
    if (row) row.snapshot = snapshot
  }
  getActorByComposite(meta: string, parent_id: number | null, idx: number): ActorStore | null {
    return this.#actors.find((a) => a.meta === meta && a.parent_id === parent_id && a.idx === idx) || null
  }
}

describe("path + repeat: корневые акторы", () => {
  let store: MemStore
  let MetaFor: ReturnType<typeof MetaForFabric>
  let container: HTMLDivElement

  beforeEach(() => {
    store = new MemStore()
    MetaFor = MetaForFabric({ store })
    container = document.createElement("div")
    document.body.innerHTML = ""
    document.body.append(container)
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
  })
})


