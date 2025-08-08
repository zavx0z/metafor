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
    const rec: ActorStore = { id: this.#auto++, timestamp: new Date().toISOString(), ...actor }
    this.#actors.push(rec)
    return rec
  }
  getActorByMeta(meta: string): ActorStore | null {
    return [...this.#actors].reverse().find((a) => a.meta === meta) || null
  }
  updateActorSnapshot(id: number, snapshot: string): void {
    const row = this.#actors.find((a) => a.id === id)
    if (row) row.snapshot = snapshot
  }
  getActorByComposite(meta: string, parent_id: number | null, idx: number): ActorStore | null {
    return this.#actors.find((a) => a.meta === meta && a.parent_id === parent_id && a.idx === idx) || null
  }
}

describe("repeat без ключей: индексация по позиции", () => {
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

  test("позиции корректно отражаются в path", async () => {
    const Child = MetaFor("no-keys-child", { dev: true }).context((t) => ({ v: t.string.required("") }))
      .states({ idle: {} })
      .core()
      .processes()
      .reactions()
      .view()
    const childHash = Child

    let items = [1, 2, 3]
    const tpl = () => html`<div>
      ${repeat(items, (it, i) => html`<meta-${childHash}></meta-${childHash}>`)}
    </div>`

    render(tpl(), container)
    await Bun.sleep(10)
    const nodes1 = Array.from(container.querySelectorAll(`meta-${childHash}`)) as any[]
    expect(nodes1.map((n) => n.path), "инициализация по позициям").toEqual([
      `${childHash}:0`,
      `${childHash}:1`,
      `${childHash}:2`,
    ])

    // Перемещение: [3,1,2]
    items = [3, 1, 2]
    render(tpl(), container)
    await Bun.sleep(10)
    const nodes2 = Array.from(container.querySelectorAll(`meta-${childHash}`)) as any[]
    expect(nodes2.map((n) => n.path), "после перестановки по позициям").toEqual([
      `${childHash}:0`,
      `${childHash}:1`,
      `${childHash}:2`,
    ])
  })
})


